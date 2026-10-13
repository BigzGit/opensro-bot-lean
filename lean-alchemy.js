// Weapon enhancement (elixirs) and the Luck / Steady / Immortal magic stones. Never resend an unconfirmed
// material-spending request.
// A stone adds 1 to the weapon's attribute count (at most 6): Luck raises the enhancement success chance, Steady
// protects the durability and Immortal the weapon itself when an enhancement fails. Stone items are one per weapon
// degree 1..12, in consecutive ids, and are used in the game's attribute tab (weapon + stone).
const STONES = {
  luck: { label: 'Luck', option: 'MATTR_LUCK', base: 6871 },
  steady: { label: 'Steady', option: 'MATTR_SOLID', base: 6859 },
  immortal: { label: 'Immortal', option: 'MATTR_ATHANASIA', base: 6847 },
};
const STONE_MAX = 6;
const Alchemy = {
  windowOwner: null, selected: null, run: null, pending: null, result: null, message: 'Select a bag weapon to begin.', started: false,
  cfg() { return Settings.profile.alchemy; },
  weapon(i) { return i && i.slot >= 13 && i.slot <= 255 && (i.typeFlags & 0x7e) === 0x2c && ((i.typeFlags >>> 7) & 15) === 6 && Number.isInteger(i.plus) && i.plus >= 0; },
  degree(i) { const n = i?.tooltip?.fields?.itemClass; return Number.isInteger(n) && n > 0 ? Math.floor((n - 1) / 3) + 1 : 0; },
  // Retail itemdata: weapon recipes 3675/3679 (param1 includes category 6).
  // Powder A 3683..3694 and B 3695..3706 have param1 = degree 1..12.
  elixir(i) { return i && [3675, 3679].includes(i.refObjId) && (i.typeFlags & 0xfffe) === 0x0d6c && i.quantity > 0 && i.slot >= 13; },
  powderDegree(i) {
    if (!i || (i.typeFlags & 0xfffe) !== 0x156c || !(i.quantity > 0) || i.slot < 13) return 0;
    return i.refObjId >= 3683 && i.refObjId <= 3694 ? i.refObjId - 3682 : i.refObjId >= 3695 && i.refObjId <= 3706 ? i.refObjId - 3694 : 0;
  },
  fingerprint(i) { return JSON.stringify([i.slot, i.refObjId, i.typeFlags, i.plus, i.durability, i.variance, i.magic]); },
  identity(i) { return JSON.stringify([i.slot, i.refObjId, i.typeFlags, i.variance]); },
  select(slot) {
    if (this.run || this.pending) return UI.toast('Stop alchemy and wait for the pending result before changing weapons.', 'warn');
    const item = World.items().find(i => i.slot === Number(slot));
    this.selected = this.weapon(item) ? { slot: item.slot, fingerprint: this.fingerprint(item) } : null;
    this.message = this.selected ? 'Weapon selected. Set the target and attempt limit.' : 'Select a bag weapon to begin.';
  },
  item() { return World.items().find(i => i.slot === this.selected?.slot); },
  // The count of one attribute (Luck, Steady, Immortal) on a weapon, from its magic options; the option's amount is the count.
  attributeCount(item, option) {
    const refs = item?.magicReferences || [];
    return (item?.magic || []).reduce((n, encoded) => {
      const bits = toBigInt(encoded), ref = refs.find(r => r.paramId === Number(bits & 65535n));
      return ref?.optionName === option ? Math.max(n, Number(bits >> 32n) & 0xffffffff) : n;
    }, 0);
  },
  // Counts are readable only when every magic option has its reference loaded; otherwise they would read as zero.
  attributesKnown(item) {
    const refs = item?.magicReferences || [];
    return (item?.magic || []).every(encoded => refs.some(r => r.paramId === Number(toBigInt(encoded) & 65535n)));
  },
  wanted(cfg = this.cfg()) { return Object.keys(STONES).filter(kind => Math.min(STONE_MAX, Number(cfg.stones?.[kind]) || 0) > 0); },
  // The next stone to fuse: the first kind still below its wanted count, with a bag stone of the weapon's degree.
  nextStone(item, cfg = this.cfg()) {
    const degree = this.degree(item);
    for (const kind of this.wanted(cfg)) {
      const want = Math.min(STONE_MAX, Number(cfg.stones[kind])), have = this.attributeCount(item, STONES[kind].option);
      if (have >= want) continue;
      const ref = STONES[kind].base + degree - 1;
      const stone = World.items().find(i => i.refObjId === ref && (i.typeFlags & 0xfffe) === 0x3dec && i.quantity > 0 && i.slot >= 13);
      return stone ? { kind, item: stone, count: have } : { missing: kind };
    }
    return null;
  },
  materials(item, cfg = this.cfg()) {
    const elixir = World.items().find(i => this.elixir(i) && (!cfg.elixir || i.refObjId === cfg.elixir));
    const powder = cfg.powder ? World.items().find(i => this.powderDegree(i) === this.degree(item) && this.degree(item) > 0) : null;
    return { elixir, powder };
  },
  blocked() {
    if (BuffGear.run || BuffGear.recovery) return 'Restore or review combat gear before alchemy.';
    const gp = World.gp;
    if (!World.inWorld() || !gp || !World.local()) return 'Enter the game world first.';
    if (World.isDead()) return 'Alchemy stopped: character died.';
    if (Hunt.running || Town.trip || WalkBack.active || Restock.trip || Restock.recording || Resurrect.trip || Controller.resumeAfterRevive) return 'Stop hunting, travel and route recording first.';
    if (Loot.active) return 'Stop collection and wait for its inventory transaction first.';
    if (World.isCasting() || Hunt.underAttack() || gp.returnScroll || gp.pendingMoves) return 'Wait for combat and movement to finish.';
    if (Restock.activeShop() || gp.storage || gp.exchange?.open || gp.exchange?.requesting || gp.stall?.phase && gp.stall.phase !== 'none') return 'Close shop, storage, trade and stall first.';
    return '';
  },
  start(stonesOnly = false) {
    if (this.run) return;
    if (this.pending) return UI.toast('Previous attempt is unconfirmed. Wait for its result; reload if the game cannot settle it.', 'warn');
    const error = this.blocked(), gp = World.gp, item = this.item(), c = this.cfg();
    const reject = text => { this.message = text; UI.toast(text, 'warn'); };
    if (error) return reject(error);
    if (gp.inventoryPending || !gp.alchemy || gp.alchemy.pending) return reject('Wait for known, settled inventory and alchemy state.');
    if (!this.weapon(item) || this.fingerprint(item) !== this.selected?.fingerprint) return reject('Weapon changed or moved. Select it again.');
    const wants = this.wanted(c);
    if (stonesOnly && !wants.length) return reject('Set at least one stone count above zero first.');
    if (wants.length && !this.degree(item)) return reject('Weapon degree is unknown; cannot choose matching stones.');
    if (wants.length && !this.attributesKnown(item)) return reject('The weapon\'s attributes are not loaded yet. Try again in a moment.');
    if (!stonesOnly) {
    if (!Number.isInteger(c.target) || c.target < 1 || c.target > 250 || !Number.isInteger(c.limit) || c.limit < 1 || c.limit > 1000) return reject('Set target + from 1 to 250 and attempts from 1 to 1000.');
    if (item.plus >= c.target) return reject('Weapon already meets the target +.');
    const materials = this.materials(item);
    if (!materials.elixir) return reject('No selected weapon elixirs in the bag.');
    if (c.powder && !this.degree(item)) return reject('Weapon degree is unknown; cannot choose compatible lucky powder.');
    if (c.powder && !materials.powder) return reject('No lucky powder matching this weapon degree.');
    }
    this.run = { slot: item.slot, identity: this.identity(item), fingerprint: this.fingerprint(item), stonesOnly,
      cfg: { ...c }, config: JSON.stringify(c), manualAt: Manual.lastAt, character: World.charName,
      attempts: 0, successes: 0, failures: 0, elixirs: 0, powders: 0, stoneAttempts: 0, stonesUsed: { luck: 0, steady: 0, immortal: 0 }, nextAt: now(), opening: null };
    this.result = this.run; this.message = 'Preparing alchemy.';
  },
  stop(reason = 'Alchemy stopped. An attempt already sent may still finish.') {
    if (this.run) { this.run = null; this.message = reason; }
    // Close only a session we opened/used, on the same character. Native close
    // does not cancel reinforcement; keep the pending result until confirmed.
    const owner = this.windowOwner; this.windowOwner = null;
    if (owner && owner.character === World.charName && World.inWorld() && ['reinforce', 'attribute'].includes(World.gp?.alchemy?.mode))
      Cmd.raw({ kind: 'alchemy-close' }, 'Close alchemy');
  },
  init() {
    if (this.started) return; this.started = true;
    // All manual native gameplay commands can interfere with the selected bag.
    // Our own Cmd.raw bypasses these observers, as with combat/manual pause.
    Hook.observers.push(command => { if (command.kind === 'gameplay' && this.run) this.stop('Alchemy stopped by manual game control.'); });
    bus.on('game-error', text => { if (this.run && /alchemy|inventory process/i.test(String(text))) this.stop('Alchemy stopped after a game refusal; wait for the inventory to settle.'); });
    bus.on('reset', () => { this.windowOwner = null; this.stop('Alchemy stopped after world reset.'); this.pending = null; this.selected = null; });
  },
  observe() {
    const p = this.pending, gp = World.gp, a = gp?.alchemy;
    if (!p || !a || gp === p.state) return;
    if (a.pending) {
      if (a.mode !== (p.stone ? 'attribute' : 'reinforce') || a.slot !== p.run.slot) this.stop('Alchemy state changed unexpectedly. Wait for the outstanding result.');
      return;
    }
    if (a !== p.before && a.error !== null && a.error !== undefined) {
      this.pending = null; this.stop('Alchemy refused by the game (code ' + a.error + ').'); return;
    }
    if (p.stone) return this.observeStone(p, gp);
    const outcome = a.flags & 0x70;
    if (a.mode !== 'reinforce' || a.slot !== p.run.slot || ![0x10, 0x20, 0x40].includes(outcome) || gp.inventoryPending) return;
    // The worker may publish the start and result between our ticks. Require
    // exactly one of each selected reagent consumed, not just a stale flag.
    if (Restock.count(p.elixir.ref) !== p.elixir.before - 1 || p.powder && Restock.count(p.powder.ref) !== p.powder.before - 1) return;
    const item = World.items().find(i => i.slot === p.run.slot);
    if (outcome !== 0x40 && (!this.weapon(item) || this.identity(item) !== p.run.identity)) {
      this.stop('Weapon identity changed. Outstanding result requires manual review.'); return;
    }
    if (outcome === 0x40 && item) { this.stop('Unexpected destruction result. Outstanding result requires manual review.'); return; }
    if (outcome === 0x10 && item.plus !== p.plus + 1 || outcome === 0x20 && item.plus > p.plus) {
      this.stop('Unexpected enhancement level. Outstanding result requires manual review.'); return;
    }
    this.pending = null;
    p.run.elixirs++; if (p.powder) p.run.powders++;
    if (outcome === 0x10) p.run.successes++; else p.run.failures++;
    if (outcome === 0x40) { this.selected = null; this.stop('Weapon destroyed; alchemy stopped.'); this.message = 'Weapon destroyed; alchemy stopped.'; return; }
    p.run.fingerprint = this.fingerprint(item); this.selected = { slot: item.slot, fingerprint: p.run.fingerprint };
    p.run.nextAt = now() + 1000;
    if (this.run !== p.run) return;
    this.message = outcome === 0x10 ? 'Success: weapon is now +' + item.plus + '.' : 'Failed attempt: weapon is now +' + item.plus + '.';
    if (item.plus >= p.run.cfg.target) this.stop('Target reached: +' + item.plus + '.');
    else if (p.run.attempts >= p.run.cfg.limit) this.stop('Attempt limit reached.');
  },
  // A stone fusion is confirmed by exactly one stone leaving the bag with the inventory settled, not by a flag alone.
  observeStone(p, gp) {
    if (gp.inventoryPending || Restock.count(p.stone.ref) !== p.stone.before - 1) return;
    const item = World.items().find(i => i.slot === p.run.slot), label = STONES[p.stone.kind].label;
    if (!this.weapon(item) || this.identity(item) !== p.run.identity) { this.stop('Weapon identity changed. Outstanding result requires manual review.'); return; }
    const count = this.attributeCount(item, STONES[p.stone.kind].option);
    this.pending = null; p.run.stonesUsed[p.stone.kind]++;
    p.run.fingerprint = this.fingerprint(item); this.selected = { slot: item.slot, fingerprint: p.run.fingerprint };
    p.run.nextAt = now() + 1000;
    if (this.run !== p.run) return;
    this.message = count > p.stone.count ? `${label} is now ${count} of ${STONE_MAX}.` : `A ${label} stone was used but the count did not rise (still ${count}).`;
  },
  tick() {
    this.observe();
    const r = this.run, gp = World.gp;
    if (this.pending && now() - this.pending.at > 15000) this.stop('Result unconfirmed after 15 seconds. No further attempts; wait for settlement or reload.');
    if (!r || this.run !== r) return;
    const blocked = this.blocked();
    if (blocked || r.character !== World.charName || r.manualAt !== Manual.lastAt || r.config !== JSON.stringify(this.cfg())) return this.stop(blocked || 'Alchemy stopped: settings, character or manual control changed.');
    if (this.pending) { this.message = 'Attempt ' + r.attempts + ': waiting for server result.'; return; }
    const item = World.items().find(i => i.slot === r.slot);
    if (!this.weapon(item) || this.fingerprint(item) !== r.fingerprint) return this.stop('Weapon changed or moved. Select it again.');
    if (!r.stonesOnly && (r.attempts >= r.cfg.limit || item.plus >= r.cfg.target)) return this.stop('Target or attempt limit reached.');
    if (!gp.alchemy) return this.stop('Alchemy state unavailable.');
    if (gp.inventoryPending || gp.alchemy.pending || Loot.pressed()) { this.message = 'Alchemy waiting for inventory or potion use.'; return; }
    if (!gp.alchemy.visible) {
      if (r.opening !== null) { if (now() - r.opening > 5000) this.stop('Alchemy window did not open.'); return; }
      if (Cmd.spaced('alchemy-open') && Cmd.raw({ kind: 'alchemy-open' }, 'Open alchemy')) {
        r.opening = now(); this.windowOwner = { character: r.character };
      }
      return;
    }
    if (r.opening !== null) r.opening = null;
    if (now() < r.nextAt || !Cmd.spaced('alchemy-start')) return;
    const need = this.nextStone(item, r.cfg);
    if (need?.missing) return this.stop(`No ${STONES[need.missing].label} stone of degree ${this.degree(item)} in the bag.`);
    if (need) {
      if (r.stoneAttempts >= 30) return this.stop('Stopped after 30 stone fusions.');
      const slots = [item.slot, need.item.slot];
      if (slots.some(slot => !Number.isInteger(slot) || slot < 13 || slot > 255) || new Set(slots).size !== slots.length) return this.stop('Invalid material slots.');
      if (Cmd.raw({ kind: 'alchemy-start', mode: 'attribute', slots }, 'Alchemy: fuse a ' + STONES[need.kind].label + ' stone')) {
        this.windowOwner = { character: r.character };
        r.stoneAttempts++;
        this.pending = { run: r, state: gp, before: gp.alchemy, at: now(), plus: item.plus,
          stone: { kind: need.kind, ref: need.item.refObjId, before: Restock.count(need.item.refObjId), count: need.count } };
        this.message = `Fusing a ${STONES[need.kind].label} stone: waiting for the server result.`;
      }
      return;
    }
    if (r.stonesOnly) return this.stop('The weapon has the wanted stone counts.');
    const { elixir, powder } = this.materials(item, r.cfg);
    if (!elixir || r.cfg.powder && !powder) return this.stop('Selected elixirs or compatible lucky powder ran out.');
    const slots = [item.slot, elixir.slot, ...(powder ? [powder.slot] : [])];
    if (slots.some(slot => !Number.isInteger(slot) || slot < 13 || slot > 255) || new Set(slots).size !== slots.length) return this.stop('Invalid material slots.');
    if (Cmd.raw({ kind: 'alchemy-start', mode: 'reinforce', slots }, 'Alchemy: enhance selected weapon')) {
      this.windowOwner = { character: r.character };
      r.attempts++;
      this.pending = { run: r, state: gp, before: gp.alchemy, at: now(), plus: item.plus,
        elixir: { ref: elixir.refObjId, before: Restock.count(elixir.refObjId) },
        powder: powder ? { ref: powder.refObjId, before: Restock.count(powder.refObjId) } : null };
      this.message = 'Attempt ' + r.attempts + ': waiting for server result.';
    }
  },
  draw() {
    const c = () => this.cfg(), weapons = () => [[-1, 'Select a weapon from your bag'], ...World.items().filter(i => this.weapon(i)).map(i => [i.slot, (i.name || Items.name(i.refObjId)) + ' +' + i.plus + ' · bag slot ' + i.slot])];
    const group = UI.group('Weapon enhancement');
    group.append(UI.select('Weapon', weapons, () => this.selected?.slot ?? -1, slot => { this.select(slot); UI.draw(); }),
      UI.number('Target +', () => c().target, n => c().target = n, 1, 250),
      UI.number('Maximum attempts', () => c().limit, n => c().limit = n, 1, 1000),
      UI.select('Weapon elixir', () => [[0, 'Any compatible weapon elixir'], ...[...new Map(World.items().filter(i => this.elixir(i)).map(i => [i.refObjId, i.name || Items.name(i.refObjId)])).entries()]], () => c().elixir, value => c().elixir = Number(value)),
      UI.check('Use lucky powder of matching degree', () => c().powder, value => c().powder = value),
      UI.row(UI.button('Start alchemy', () => this.start()), UI.button('Stop alchemy', () => this.stop())),
      el('p', 'Keep the weapon in your bag and stop hunting/travel first. Each attempt spends a weapon elixir and, when enabled, matching lucky powder. Failures can reduce +, damage or destroy the weapon. Stop prevents the next attempt; a sent attempt may still finish. Unknown results pause without retrying.', 'muted'));
    UI.alchemyPreview = el('div', '', 'row'); UI.alchemyNote = el('p', '', 'muted'); group.append(UI.alchemyPreview, UI.alchemyNote); UI.pane.append(group);
    const stones = UI.group('Magic stones for the weapon');
    for (const [kind, s] of Object.entries(STONES)) stones.append(UI.number(s.label + ' stones: fuse up to (0 = off)', () => c().stones[kind], n => c().stones[kind] = n, 0, STONE_MAX));
    stones.append(UI.row(UI.button('Fuse stones now', () => this.start(true)), UI.button('Stop', () => this.stop())),
      el('p', 'Each stone adds 1 to that attribute on the weapon, up to 6. Luck raises the enhancement success chance, Steady stops durability damage and Immortal stops destruction when an enhancement fails; none of them stops the + from being reset (an Astral stone does that, from +4). The stone must be of the weapon\'s degree and in your bag. Start alchemy fuses the stones first, then enhances; Fuse stones now only fuses them. Stops if a stone is missing, the game refuses, or after 30 fusions.', 'muted'));
    UI.pane.append(stones);
    this.refresh();
  },
  refresh() {
    if (UI.current !== 'Alchemy' || !UI.alchemyNote) return;
    const item = this.item(), r = this.result;
    const attributes = item && this.weapon(item) ? '\nStones on the weapon: ' + Object.entries(STONES).map(([kind, s]) => {
      const have = this.attributesKnown(item) ? this.attributeCount(item, s.option) : '?', bag = World.items().filter(i => i.refObjId === s.base + this.degree(item) - 1 && i.quantity > 0).reduce((n, i) => n + i.quantity, 0);
      return `${s.label} ${have}/${STONE_MAX} (${bag} in bag)`;
    }).join(' · ') : '';
    UI.alchemyNote.textContent = this.message + attributes + (r ? `\nAttempts ${r.attempts} · Success ${r.successes} · Failed ${r.failures} · Elixirs used ${r.elixirs} · Powder used ${r.powders}` : '') +
      `\nElixirs available: ${World.items().filter(i => this.elixir(i) && (!this.cfg().elixir || i.refObjId === this.cfg().elixir)).reduce((n, i) => n + i.quantity, 0)}` +
      (this.cfg().powder ? ` · Matching powder: ${World.items().filter(i => this.powderDegree(i) === this.degree(item) && this.degree(item) > 0).reduce((n, i) => n + i.quantity, 0)}` : '');
    const key = item ? item.refObjId + ':' + item.plus + ':' + item.slot : '';
    if (UI.alchemyPreview.dataset.item !== key) {
      UI.alchemyPreview.dataset.item = key; UI.alchemyPreview.replaceChildren();
      if (this.weapon(item)) {
        const icon = el('span', '', 'skill-icon'); Icons.paint(icon, item.icon || Items.iconDdj(item.refObjId));
        UI.alchemyPreview.append(icon, el('span', (item.name || Items.name(item.refObjId)) + ' +' + item.plus + (this.degree(item) ? ' · Degree ' + this.degree(item) : '')));
      }
    }
  },
};
