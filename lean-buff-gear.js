// Confirm every native inventory move before casting or restoring combat gear.
const BuffGear = {
  run: null, recovery: null, message: 'Buff weapon swapping off.', skipped: new Map(), waiting: '', started: false,
  cfg() { return Settings.profile.macro; },
  items() { return World.gp?.inventory || []; },
  at(slot) { return this.items().find(i => i.slot === slot) || null; },
  key(i) { return i ? JSON.stringify([i.refObjId, i.typeFlags, i.plus ?? 0, i.variance ?? null, i.magic ?? null]) : null; },
  weapon(i) { return i && (i.typeFlags & 0x7e) === 0x2c && (i.typeFlags >>> 7 & 15) === 6; },
  shield(i) { return i && (i.typeFlags & 0x1e) === 0x0c && (i.typeFlags >>> 7 & 15) === 4; },
  find(key) {
    if (!key) return null;
    const matches = this.items().filter(i => this.key(i) === key);
    return matches.length === 1 ? matches[0] : null;
  },
  setup() { return { weapon: this.key(this.at(6)), shield: this.key(this.at(7)) }; },
  matches(set) { return set.weapon === this.key(this.at(6)) && set.shield === this.key(this.at(7)); },
  signature() { return JSON.stringify([this.cfg().buffSwap, this.cfg().buffSets, this.cfg().buffs]); },
  init() {
    if (this.started) return;
    this.started = true;
    Hook.observers.push(command => {
      if (command.kind === 'gameplay' && command.command?.kind === 'inventory-move' && this.run) this.fail('Manual equipment move interrupted buff swaps.');
    });
    bus.on('cast', c => {
      const p = this.run?.cast;
      if (p && c.caster === World.localGid() && c.skill === p.id && !c.resultOnly && c.cancelledAtMs === undefined) p.accepted = true;
    });
  },
  save(name) {
    if (this.run || this.recovery || Hunt.running || World.gp?.inventoryPending || !World.inWorld()) return UI.toast('Stop hunting and settle gear restoration first.', 'warn');
    const set = this.setup();
    if (!this.weapon(this.at(6)) || this.at(7) && !this.shield(this.at(7))) return UI.toast('Equip a buff weapon and an optional shield first. Remove arrows or bolts from the off-hand slot.', 'warn');
    if (!this.find(set.weapon) || set.shield && !this.find(set.shield)) return UI.toast('Identical gear cannot be distinguished. Keep only one matching copy.', 'warn');
    const sets = this.cfg().buffSets;
    if (sets.length >= 8) return UI.toast('Up to eight buff sets can be saved.', 'warn');
    sets.push({ ...set, id: Math.max(0, ...sets.map(s => Number(s.id) || 0)) + 1, name: String(name || 'Buff set').trim().slice(0, 40) || 'Buff set' });
    Settings.saveProfile(); UI.draw();
  },
  reset() {
    this.run = this.recovery = null; this.skipped.clear();
    this.message = 'Buff gear reset. Check equipped weapons after reconnecting.';
  },
  interrupt(text) {
    if (this.run) this.fail(text);
  },
  fail(text) {
    if (this.run) this.recovery = this.run.home;
    this.run = null;
    if (Hunt.running && World.inWorld() && !World.isDead()) Hunt.stop(text);
    else Hunt.running = false;
    this.message = text + ' Check gear or use Restore combat gear.';
    UI.toast(this.message, 'warn');
  },
  cancel() {
    if (!this.run) return;
    this.run.restoring = true; this.run.queue = []; this.run.cancelled = true;
    this.message = 'Stopping buffs; restoring combat gear.';
  },
  restore() {
    if (this.run || !this.recovery || !World.inWorld() || World.isDead() || World.gp?.inventoryPending || World.isCasting()) return;
    if (Hunt.running || Town.trip || WalkBack.active || Restock.trip || Alchemy.run || Alchemy.pending) return UI.toast('Stop hunting and travel before restoring gear.', 'warn');
    this.run = this.create(this.recovery, []); this.run.restoring = true; this.recovery = null;
  },
  create(home, queue) {
    return { home, queue, restoring: false, pending: null, cast: null, effects: [],
      at: now(), manualAt: Manual.lastAt, character: World.charName, profile: Settings.profile, signature: this.signature() };
  },
  due(b) {
    if (!b.enabled || !b.gearSet) return 0;
    const id = Combat.resolve(b), info = World.skill(id);
    if (!id || !info || info.targetRequired || Combat.blocked(id) || !Cmd.canCast(id) || !Combat.mpOk(id, World.me())) return 0;
    const skip = this.skipped.get(b.group);
    if (skip) { if (skip.signature === this.signature() && now() < skip.until) return 0; this.skipped.delete(b.group); }
    const remaining = World.buffRemaining(id);
    if (remaining > (b.refreshS ?? 3) * 1000) return 0;
    const gap = Math.max(4000, Math.min((info?.durationMs || 20000) * .85, 600000));
    return now() - (Combat.buffCastAt.get(b.group) ?? -Infinity) >= gap ? id : 0;
  },
  begin() {
    if (!this.cfg().buffSwap || this.recovery || !Hunt.running || !World.inWorld() || World.isDead() ||
        Combat.busy() || World.isSitting() || World.local()?.mountedOn || World.gp?.inventoryPending ||
        World.gp?.pendingMoves || World.gp?.returnScroll || now() - Manual.lastAt < Hunt.cfg().manualPauseS * 1000 ||
        Town.trip || WalkBack.active || Restock.trip || Restock.recording || Resurrect.trip || now() < Resurrect.holdUntil ||
        Restock.activeShop() || World.gp?.storage || World.gp?.exchange?.open || World.gp?.exchange?.requesting || World.gp?.stall?.phase && World.gp.stall.phase !== 'none' ||
        Alchemy.run || Alchemy.pending || Loot.active && !Loot.active.petGid || Loot.pressed()) return false;
    const queue = [];
    for (const set of this.cfg().buffSets) {
      const buffs = this.cfg().buffs.filter(b => Number(b.gearSet) === set.id).map(b => ({ b, id: this.due(b) })).filter(b => b.id);
      if (buffs.length) queue.push({ set, buffs });
    }
    if (!queue.length) { this.waiting = ''; return false; }
    // A buff is due, so say why the swap cannot start instead of waiting silently.
    const wait = text => { this.waiting = text; return false; };
    const home = this.setup();
    if (!this.weapon(this.at(6))) return wait('Equip your combat weapon before hunting.');
    for (const set of [home, ...queue.map(q => q.set)]) {
      const name = set === home ? 'your combat gear' : 'the saved set "' + set.name + '"';
      if (!this.find(set.weapon)) return wait(`Cannot find ${name}: its weapon is not in your bag or equipped (or two copies look identical). Save the buff set again.`);
      if (!this.weapon(this.find(set.weapon))) return wait(`${name} is not a weapon any more. Save the buff set again.`);
      if (set.shield && (!this.find(set.shield) || set !== home && !this.shield(this.find(set.shield)))) return wait(`Cannot find the shield of ${name} (or two copies look identical). Save the buff set again.`);
    }
    // One free bag slot permits explicit shield removal before two-handed swaps.
    if (World.freeBagSlots() < 1) return wait('Buff swaps need one free bag slot.');
    this.waiting = '';
    if (!Cmd.move(World.pose())) return false;
    Loot.suspend(); Hunt.state = 'buff'; this.run = this.create(home, queue);
    this.message = 'Pausing combat for buff gear.';
    return true;
  },
  move(source, destination) {
    const r = this.run, from = this.key(this.at(source)), to = this.key(this.at(destination));
    if (!from || !Cmd.spaced('inventory-move')) return;
    if (Cmd.raw({ kind: 'inventory-move', source, destination, quantity: 0 }, 'Buff gear: move equipment')) {
      r.pending = { source, destination, from, to, at: now() };
    }
  },
  equip(set) {
    if (this.matches(set)) return true;
    const weapon = this.find(set.weapon), shield = this.find(set.shield);
    if (!weapon || !this.weapon(weapon) || set.shield && (!shield || set !== this.run.home && !this.shield(shield))) { this.fail('Required equipment missing or ambiguous.'); return false; }
    if (this.at(7) && this.key(this.at(7)) !== set.shield) {
      const gp = World.gp;
      let empty = -1;
      for (let slot = gp.equipmentSlotCount || 13; slot < gp.inventorySlotCount; slot++) if (!this.at(slot)) { empty = slot; break; }
      if (empty < 0) { this.fail('No bag space to remove the off-hand item.'); return false; }
      this.move(7, empty); return false;
    }
    if (weapon.slot !== 6) { this.move(weapon.slot, 6); return false; }
    if (shield && shield.slot !== 7) { this.move(shield.slot, 7); return false; }
    return false;
  },
  tick() {
    if (!this.run) return this.begin();
    const r = this.run, gp = World.gp;
    if (r.character !== World.charName || r.profile !== Settings.profile) { this.reset(); return false; }
    if (!World.inWorld() || World.isDead()) { this.interrupt('World change or death interrupted buff swaps.'); return false; }
    if (Manual.lastAt !== r.manualAt) { this.fail('Manual control interrupted buff swaps.'); return true; }
    if (now() - r.at > 120000) { this.fail('Buff gear cycle timed out.'); return true; }
    if (!Hunt.running || r.signature !== this.signature()) this.cancel();
    if (r.pending) {
      const p = r.pending;
      if (!gp.inventoryPending && this.key(this.at(p.destination)) === p.from && this.key(this.at(p.source)) === p.to) r.pending = null;
      else { if (now() - p.at > 15000) this.fail('Equipment move unconfirmed; no retry sent.'); return true; }
    }
    if (r.cast) {
      const p = r.cast, remaining = World.buffRemaining(p.id);
      if (remaining > 0) { p.accepted = true; p.visible = true; }
      if (now() < p.until || World.isCasting()) return true;
      if (!p.accepted) { if (now() - p.at > 10000) { this.skipped.set(p.group, { signature: r.signature, until: now() + 120000, why: 'the cast was not confirmed, trying again in two minutes' }); this.cancel(); this.message = 'Buff cast unconfirmed; restoring combat gear.'; r.cast = null; } return true; }
      r.effects.push(p); r.cast = null;
    }
    if (Combat.busy() || gp.inventoryPending || World.isSitting() || World.local()?.mountedOn || Loot.pressed()) return true;
    if (Restock.activeShop() || gp.storage || gp.exchange?.open || gp.exchange?.requesting || gp.stall?.phase && gp.stall.phase !== 'none' || gp.returnScroll) { this.fail('Buff swaps interrupted by another game action.'); return true; }
    if (r.restoring || !r.queue.length) {
      this.message = 'Restoring combat gear.';
      if (!this.equip(r.home)) return true;
      if (!r.restoredAt) { r.restoredAt = now(); return true; }
      if (now() - r.restoredAt < 1000) return true;
      for (const p of r.effects) if (p.visible && World.buffRemaining(p.id) <= 0) {
        this.skipped.set(p.group, { signature: r.signature, until: Infinity, why: 'it ended when the weapon changed back, so it stays with your combat weapon until buff settings change' });
        this.message = 'A buff ended after changing weapons; skipped until buff settings change.';
      }
      if (this.message === 'Restoring combat gear.') this.message = 'Combat gear restored.';
      this.run = null; this.recovery = null; return true;
    }
    const q = r.queue[0];
    this.message = 'Equipping ' + q.set.name + ' for buffs.';
    if (!this.equip(q.set)) return true;
    const entry = q.buffs[0];
    if (!entry) { r.queue.shift(); return true; }
    if (!this.due(entry.b)) { q.buffs.shift(); return true; }
    if (Combat.cast(entry.id, 0)) {
      Combat.buffCastAt.set(entry.b.group, now()); q.buffs.shift();
      r.cast = { id: entry.id, group: entry.b.group, at: now(), until: now() + Math.max(1000, World.skill(entry.id)?.actionMs || 6000) + 500, accepted: false, visible: false };
      this.message = 'Casting buff; waiting before changing weapons.';
    }
    return true;
  },
  // The buffs assigned to a saved set that are on, with how long each has left.
  assigned() {
    return this.cfg().buffs.filter(b => b.enabled && Number(b.gearSet) && this.cfg().buffSets.some(s => s.id === Number(b.gearSet))).map(b => {
      const id = Combat.resolve(b);
      return { name: World.skillName(id || b.id), left: id ? World.buffRemaining(id) : 0, learned: !!id && World.learned(id), skip: this.skipped.get(b.group) };
    });
  },
  status() {
    if (this.run || this.recovery) return this.message;
    if (!this.cfg().buffSwap) return 'Buff weapon swapping off.';
    const sets = this.cfg().buffSets, list = this.assigned();
    if (!sets.length) return 'Buff weapon swapping is on, but no buff set is saved yet. Equip the buff weapon and press Save equipped buff set.';
    if (!list.length) return 'Buff weapon swapping is on, but no buff skill is assigned to a set yet. Use Gear for <skill> under your buffs.';
    const lines = [];
    for (const a of list) {
      if (!a.learned) lines.push(`${a.name}: not learned on this character, so it is never cast.`);
      else if (a.skip && a.skip.signature === this.signature() && now() < a.skip.until) lines.push(`${a.name}: skipped because ${a.skip.why}.`);
      else if (a.left > 0) lines.push(`${a.name}: active, ${Math.ceil(a.left / 1000)} s left; the swap happens when it is about to end.`);
      else lines.push(`${a.name}: due now.`);
    }
    return (this.waiting ? this.waiting + '\n' : '') + lines.join('\n');
  },
  draw(parent) {
    const box = UI.group('Buff weapon sets');
    box.append(UI.check('Swap weapons for assigned buffs', () => this.cfg().buffSwap, v => this.cfg().buffSwap = v),
      el('p', 'Equip a buff weapon and optional shield, save the set, then put your combat gear back on. Assign each buff below to its set. Multiple sets run in turn while hunting; original combat gear is restored afterward. Keep one bag slot free. Buffs tied to the removed weapon may end.', 'muted'));
    const name = el('input'); name.type = 'text'; name.maxLength = 40; name.value = 'Buff set ' + (this.cfg().buffSets.length + 1);
    box.append(UI.field('New buff set name', name), UI.button('Save equipped buff set', () => this.save(name.value)));
    for (const set of this.cfg().buffSets) {
      const weapon = this.find(set.weapon), shield = this.find(set.shield);
      box.append(UI.row(el('span', set.name + ': ' + (weapon?.name || (weapon ? 'Weapon +' + (weapon.plus || 0) : 'weapon missing / ambiguous')) + (set.shield ? shield ? ' + shield' : ' + shield missing / ambiguous' : '')),
        UI.button('Remove ' + set.name, () => {
          if (this.run || this.recovery) return UI.toast('Restore combat gear before editing sets.', 'warn');
          this.cfg().buffSets = this.cfg().buffSets.filter(s => s.id !== set.id);
          for (const b of this.cfg().buffs) if (Number(b.gearSet) === set.id) b.gearSet = 0;
          Settings.saveProfile(); UI.draw();
        })));
    }
    box.append(UI.button('Restore combat gear', () => this.restore()), UI.button('Use current gear', () => {
      if (this.run || World.gp?.inventoryPending) return UI.toast('Wait for the current equipment move to settle.', 'warn');
      this.recovery = null; this.message = 'Current gear accepted. Review it before hunting.';
    }));
    this.note = el('p', this.status(), 'muted'); box.append(this.note); parent.append(box);
  },
};
const normalBuffs = Combat.buffs;
Combat.buffs = function (hunting) {
  // Assigned buffs are owned exclusively by the gear cycle, including when off.
  const original = Settings.profile.macro.buffs;
  Settings.profile.macro.buffs = original.filter(b => !b.gearSet);
  try { return normalBuffs.call(this, hunting); }
  finally { Settings.profile.macro.buffs = original; }
};
