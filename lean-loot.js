// One pickup intent at a time. Progress, inventory changes and failures own its lifetime.
const Loot = {
  active: null,
  skips: new Map(),
  failureCounts: new Map(),
  categories: ['gold', 'potions', 'equipment', 'elixirs', 'powders', 'alchemy', 'others'],
  category(tf) {
    if (ItemType.isGold(tf)) return 'gold';
    if (ItemType.isPotion(tf) || ItemType.isCure(tf)) return 'potions';
    if (ItemType.isEquipment(tf)) return 'equipment';
    // Native alchemy item words: (TID1,TID2,TID3,TID4), also used by reinforce.go.
    const consumable = (tf & 126) === 108, t3 = (tf >>> 7) & 15, t4 = (tf >>> 11) & 31;
    if (consumable && t3 === 10 && t4 === 1) return 'elixirs';
    if (consumable && t3 === 10 && t4 === 2) return 'powders';
    if (consumable && (t3 === 10 || t3 === 11)) return 'alchemy';
    return 'others';
  },
  preset(mode) {
    const p = Hunt.cfg().pickup;
    for (const key of this.categories) p[key] = mode === 'all' || key === 'elixirs' || (mode === 'elixirs-gold' && key === 'gold');
    p.enabled = true; p.include = '';
    Settings.saveProfile();
  },
  count(ref) { return World.items().filter(i => i.refObjId === ref).reduce((n, i) => n + (i.quantity ?? 1), 0); },
  bagSignature() { return World.items().map(i => `${i.slot}:${i.refObjId}:${i.quantity ?? 1}`).join('|'); },
  owned(e) {
    const gi = e.groundItem;
    if (!gi) return false;
    const local = World.localGid();
    if (gi.claimantGid !== undefined && gi.claimantGid !== local) return false;
    const party = World.gp?.social?.members || [];
    return gi.ownerJid === undefined || gi.ownerJid === local || party.some(m => m.id === gi.ownerJid);
  },
  allowed(e) {
    if (!e || e.kind !== 'ground-item' || !this.owned(e)) return false;
    const P = Hunt.cfg().pickup, tf = e.groundItem.typeFlags ?? e.tidWord ?? 0;
    const name = (e.name || '').toLowerCase();
    if (splitList(P.exclude).some(s => name.includes(s))) return false;
    const included = splitList(P.include).some(s => name.includes(s));
    const gold = ItemType.isGold(tf);
    if (!included && !P[this.category(tf)]) return false;
    if (gold || World.freeBagSlots() > 0) return true;
    // Ground drops omit quantity/stack ceiling. Permit an existing stack to merge;
    // a server capacity refusal suppresses this drop until inventory changes.
    if (!ItemType.isStackable(tf)) return false;
    return World.items().some(i => i.refObjId === e.refObjId &&
      (!i.tooltip?.fields?.maxStack || (i.quantity ?? 1) < i.tooltip.fields.maxStack));
  },
  skip(e, reason, inventoryBound = false) {
    const n = Math.min(6, (this.failureCounts.get(e.gid) || 0) + 1);
    this.failureCounts.set(e.gid, n);
    this.skips.set(e.gid, { until: now() + Math.min(60000, 5000 * 2 ** (n - 1)), bag: inventoryBound ? this.bagSignature() : null });
    Log.warn(`Loot skipped (${e.name || e.gid}): ${reason}`);
    this.active = null;
    Hunt.lootGid = 0;
  },
  choose() {
    const H = Hunt.cfg(), P = H.pickup, pose = World.pose();
    if (!P.enabled || !pose) return null;
    let chosen = null, best = Infinity;
    for (const e of World.ents.values()) {
      if (e.kind !== 'ground-item') continue;
      const skip = this.skips.get(e.gid);
      if (skip) {
        if (skip.bag !== null ? skip.bag === this.bagSignature() : skip.until > now()) continue;
        this.skips.delete(e.gid);
      }
      const d = dist2D(pose, e);
      if (!Number.isFinite(d) || d > P.radius || H.center && dist2D(H.center, e) > H.radius + P.radius || !this.allowed(e)) continue;
      if (d < best) { chosen = e; best = d; }
    }
    return chosen;
  },
  begin(e) {
    if (World.gp?.inventoryPending || World.isCasting() || !Cmd.pickup(e.gid)) return false;
    const gold = ItemType.isGold(e.groundItem.typeFlags);
    this.active = { gid: e.gid, ref: e.refObjId, name: e.name, gold,
      before: gold ? toBigInt(World.gp?.progression?.gold) : this.count(e.refObjId),
      at: now(), progressAt: now(), best: dist2D(World.pose(), e), attempts: 1,
      retryAt: 0, goneAt: null, failure: '' };
    Hunt.lootGid = e.gid;
    return true;
  },
  gained(a) {
    return a.gold ? toBigInt(World.gp?.progression?.gold) > a.before : this.count(a.ref) > a.before;
  },
  tick() {
    const a = this.active;
    if (!a) return false;
    Hunt.state = 'loot';
    const e = World.ents.get(a.gid);
    if (this.gained(a)) {
      Stats.count('loot');
      // If inventory updates precede despawn, don't request this same drop again.
      this.skips.set(a.gid, { until: now() + 3000, bag: null });
      this.failureCounts.delete(a.gid);
      this.active = null; Hunt.lootGid = 0;
      return true;
    }
    if (!e) {
      a.goneAt ??= now();
      if (now() - a.goneAt < 1500) return true; // allow a delayed inventory/gold update
      Log.info(`Drop disappeared without a matching inventory gain: ${a.name || a.gid}`);
      this.active = null; Hunt.lootGid = 0;
      return false;
    }
    if (!this.allowed(e) || !Hunt.cfg().pickup.enabled) {
      if (!Cmd.move(World.pose())) return true;
      this.suspend(); return false;
    }
    const d = dist2D(World.pose(), e);
    if (d < a.best - 2) { a.best = d; a.progressAt = now(); }
    if (World.gp?.inventoryPending) return true;
    if (a.retryAt) {
      if (now() < a.retryAt) return true;
      if (Cmd.pickup(a.gid)) {
        a.attempts++; a.retryAt = 0; a.at = now(); a.progressAt = now(); a.best = d; a.failure = '';
      }
      return true;
    }
    // Keep the approach alive while moving; don't expire it after a fixed 4.5 seconds.
    if (!a.failure && now() - a.progressAt < 8000 && now() - a.at < 45000) return true;
    const reason = a.failure || 'no approach/pickup progress';
    const capacity = /inventory|space|full|capacity|envanter/i.test(reason);
    if (capacity || a.attempts > Hunt.cfg().pickup.retries) { this.skip(e, reason, capacity); return false; }
    // Movement cancels the outstanding worker pickup intent. Resubmit on a later tick.
    if (Cmd.move(World.pose())) { a.retryAt = now() + 700; a.failure = ''; }
    return true;
  },
  suspend() { this.active = null; Hunt.lootGid = 0; },
  reset() { this.suspend(); this.skips.clear(); this.failureCounts.clear(); },
  init() {
    bus.on('game-error', message => { if (this.active) this.active.failure = String(message); });
    bus.on('despawn', e => {
      this.skips.delete(e.gid); this.failureCounts.delete(e.gid);
    });
  },
};
