// One pickup intent at a time. Progress, inventory changes and failures own its lifetime.
const Loot = {
  active: null,
  skips: new Map(),
  failureCounts: new Map(),
  petSetup: null,
  fullAlert: null,
  lastFullChimeAt: -Infinity,
  checkPetFull() {
    const P = Hunt.cfg().pickup;
    if (!Hunt.running || !World.inWorld() || World.isDead() || !P.enabled || !this.petMode() || !P.petFullSound) return;
    const pet = this.pet();
    if (!pet || pet.rec.inventory.length < pet.rec.status) { this.fullAlert = null; return; }
    let alert = this.fullAlert;
    if (!alert || alert.gid !== pet.rec.gid) {
      alert = this.fullAlert = { gid: pet.rec.gid, sounded: false };
      UI.toast('Pickup pet bag is full. Free a slot; existing stacks may still accept items.', 'warn', 6000);
    }
    if (!alert.sounded && now() - this.lastFullChimeAt >= 30000) {
      this.lastFullChimeAt = now();
      alert.sounded = Sound.play('pet-full');
    }
  },
  pet() {
    for (const rec of World.gp?.cosRecords || []) {
      const ent = World.ents.get(rec.gid);
      if (rec.band === 4 && !rec.dead && rec.hp > 0 && rec.status > 0 && Array.isArray(rec.inventory) &&
          ent?.kind === 'cos' && ent.ownerGid === World.localGid() && ent.refObjId === rec.refObjId) return { rec, ent };
    }
    return null;
  },
  petMode() { return Hunt.cfg().pickup.collector === 'pet'; },
  preparePet() {
    if (!this.petMode() || !Hunt.cfg().pickup.enabled || World.isDead()) return false;
    const pet = this.pet();
    if (!pet || !Number.isInteger(pet.rec.commandMode)) return false;
    if (!(pet.rec.commandMode & 128)) { this.petSetup = null; return true; }
    // Native auto-grab has only gold/equipment/other categories. Disable it and
    // wait for the live server-confirmed mode before submitting selective requests.
    let setup = this.petSetup;
    if (!setup || setup.gid !== pet.rec.gid) setup = this.petSetup = { gid: pet.rec.gid, attempts: 0, at: -Infinity };
    if (setup.attempts < 3 && now() - setup.at >= 5000 && !World.gp.inventoryPending && Cmd.spaced('cos-behavior') &&
        Cmd.raw({ kind: 'cos-behavior', gid: pet.rec.gid, mode: (pet.rec.commandMode & ~128) >>> 0 }, 'Disable broad pet auto-grab')) {
      setup.attempts++; setup.at = now();
    }
    return false;
  },
  petStatus() {
    const pet = this.pet();
    if (!pet) return 'Summon a pickup pet to collect into its bag.';
    if (!Number.isInteger(pet.rec.commandMode)) return 'Waiting for pet settings.';
    if (pet.rec.commandMode & 128) return this.petSetup?.attempts >= 3 && now() - this.petSetup.at >= 5000
      ? 'Auto-grab was not disabled. Turn it off in the game pet settings, then retry.' : 'Waiting for broad auto-grab to turn off.';
    return `Pet ready: ${Math.max(0, pet.rec.status - pet.rec.inventory.length)} empty slots. Collects while hunting; auto-grab stays off when stopped.`;
  },
  items(petGid = 0) { return petGid ? World.gp?.cosRecords?.find(r => r.gid === petGid)?.inventory || [] : World.items(); },
  pickup(gid, petGid = 0) {
    return petGid ? Cmd.spaced('cos-pickup') && Cmd.raw({ kind: 'cos-pickup', gid: petGid, target: gid }, 'Pet pickup') : Cmd.pickup(gid);
  },
  pressed() {
    const me = World.me(), p = Settings.profile.potion;
    return p.enabled && ((p.hp.on && me.hpPct <= p.hp.pct + 10) || (p.mp.on && me.mpPct <= p.mp.pct + 10));
  },
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
  count(ref, petGid = 0) { return this.items(petGid).filter(i => i.refObjId === ref).reduce((n, i) => n + (i.quantity ?? 1), 0); },
  bagSignature() { const pet = this.petMode() && this.pet(); return `${pet ? pet.rec.gid : 0}:` + this.items(pet ? pet.rec.gid : 0).map(i => `${i.slot}:${i.refObjId}:${i.quantity ?? 1}`).join('|'); },
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
    const pet = this.petMode() ? this.pet() : null;
    if (this.petMode() && (!pet || !Number.isInteger(pet.rec.commandMode) || (pet.rec.commandMode & 128) || dist2D(pet.ent, e) > 500)) return false;
    if (gold || (pet ? pet.rec.status > pet.rec.inventory.length : World.freeBagSlots() > 0)) return true;
    // Ground drops omit quantity/stack ceiling. Permit an existing stack to merge;
    // a server capacity refusal suppresses this drop until inventory changes.
    if (!ItemType.isStackable(tf)) return false;
    return this.items(pet ? pet.rec.gid : 0).some(i => i.refObjId === e.refObjId &&
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
    if (!this.allowed(e) || World.gp?.inventoryPending || !this.petMode() && World.isCasting()) return false;
    const petGid = this.petMode() ? this.pet()?.rec.gid : 0;
    if (this.petMode() && (!petGid || this.pressed()) || !this.pickup(e.gid, petGid)) return false;
    const gold = ItemType.isGold(e.groundItem.typeFlags);
    this.active = { gid: e.gid, ref: e.refObjId, name: e.name, gold, petGid,
      before: gold ? toBigInt(World.gp?.progression?.gold) : this.count(e.refObjId, petGid),
      at: now(), progressAt: now(), best: dist2D(petGid ? this.pet().ent : World.pose(), e), attempts: 1,
      retryAt: 0, goneAt: null, failure: '' };
    Hunt.lootGid = e.gid;
    return true;
  },
  gained(a) {
    return a.gold ? toBigInt(World.gp?.progression?.gold) > a.before : this.count(a.ref, a.petGid) > a.before;
  },
  tick() {
    const a = this.active;
    if (!a) return false;
    if (!!a.petGid !== this.petMode() || a.petGid && this.pet()?.rec.gid !== a.petGid) { this.suspend(); return false; }
    if (!a.petGid) Hunt.state = 'loot';
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
      if (!a.petGid && !Cmd.move(World.pose())) return true;
      this.suspend(); return false;
    }
    const d = dist2D(a.petGid ? this.pet().ent : World.pose(), e);
    if (d < a.best - 2) { a.best = d; a.progressAt = now(); }
    if (World.gp?.inventoryPending) return true;
    if (a.retryAt) {
      if (now() < a.retryAt) return true;
      if (a.petGid && this.pressed()) return true;
      if (this.pickup(a.gid, a.petGid)) {
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
    if (a.petGid || Cmd.move(World.pose())) { a.retryAt = now() + 700; a.failure = ''; }
    return true;
  },
  suspend() { this.active = null; Hunt.lootGid = 0; },
  reset() { this.suspend(); this.skips.clear(); this.failureCounts.clear(); this.petSetup = null; this.fullAlert = null; },
  init() {
    bus.on('game-error', message => { if (this.active) this.active.failure = String(message); });
    bus.on('despawn', e => {
      this.skips.delete(e.gid); this.failureCounts.delete(e.gid);
    });
  },
};
