// Town service owns the whole recall -> warehouse -> shop -> smith -> reverse trip.
// Native reverse scrolls are spent by travel-gate type 5/choice 2, not item-use.
const Town = {
  trip: null, lastScrollPoint: null, message: 'Town cycle off.',
  cfg() { return Restock.cfg().town; },
  // Native X-Large HP/MP IDs 8/15, both authored with 50 potions per stack.
  supplies() { return Restock.supplies().map(s => ({ ...s, refObjId: s.kind === 'hp' ? 8 : 15, target: this.cfg().stacks?.[s.kind] * 50 })); },
  status() {
    if (this.trip || this.message.startsWith('Town cycle stopped:')) return this.message;
    if (!this.cfg().enabled) return 'Town cycle off. The pet-full chime is an alert; enable the scroll town cycle to return automatically.';
    if (!World.inWorld()) return 'Town cycle: waiting for game world.';
    const error = this.validate();
    return error ? 'Town cycle not ready: ' + error : 'Town cycle ready: waiting for low potions or character/pet bag capacity.';
  },
  scroll(type) { return World.items().find(i => (i.typeFlags & 0xfffc) === type && (i.quantity ?? 1) > 0); },
  free(items, start, end) {
    const used = new Set(items.map(i => i.slot));
    for (let slot = start; slot < end; slot++) if (!used.has(slot)) return slot;
    return null;
  },
  save(role) {
    if (Hunt.running || this.trip || Restock.recording || !World.inWorld()) return UI.toast('Stop hunting and route recording before saving town services.', 'warn');
    const c = this.cfg(), p = World.pose(), gp = World.gp;
    if (!p) return;
    if (role === 'arrival') c.arrival = { ...p };
    else {
      const npc = World.target(), cap = gp.targetCapabilities ?? 0;
      const required = { storage: 4, vendor: 1, smith: 8, gate: 0x80 }[role];
      if (!this.serviceEntity(role, npc) || gp.targetPending || !(cap & required)) return UI.toast(role === 'gate' ? 'Select the world statue / teleport in the game first.' : role === 'smith' ? 'Select a merchant that offers equipment repair in the game first.' : 'Select the appropriate town NPC in the game first.', 'warn');
      if (dist2D(p, npc) > 200) return UI.toast('Stand within 20 m of the NPC before saving its approach point.', 'warn');
      if (!c.arrival || dist2D(p, c.arrival) > 3000) return UI.toast('Save the town arrival point nearby first.', 'warn');
      if (role === 'vendor') {
        const shop = Restock.activeShop();
        if (!shop || shop.npc !== npc.gid) return UI.toast('Open this potion merchant shop before saving it.', 'warn');
        Restock.cfg().offers = shop.offers.filter(o => Restock.offerKind(o)).map(o => ({ refObjId: o.refObjId, name: o.name, kind: Restock.offerKind(o) }));
        for (const kind of ['hp', 'mp']) if (!Restock.cfg().offers.some(o => o.kind === kind && o.refObjId === Restock.cfg()[kind].refObjId)) Restock.cfg()[kind].refObjId = Restock.cfg().offers.find(o => o.kind === kind)?.refObjId || 0;
      }
      // Save the reachable place the user stands, rather than the NPC/model centre.
      c[role] = { ...p, refObjId: npc.refObjId, name: npc.name,
        npc: { regionId: npc.regionId, x: npc.x, y: npc.y, z: npc.z } };
    }
    this.message = 'Town setup updated.';
    Settings.saveProfile(); UI.toast('Saved town ' + role + '.'); UI.draw();
  },
  disposable(item) {
    const c = this.cfg(), name = (item.name || '').toLowerCase(), tf = item.typeFlags;
    // Missing type metadata must never turn an item into a disposal candidate.
    if (!Number.isInteger(tf) || ItemType.isPotion(tf) || ItemType.isCure(tf) ||
        (tf & 0x7fc) === 0x1ec || item.refObjId === 24198 ||
        Restock.supplies().some(s => s.refObjId === item.refObjId) ||
        splitList(c.keep).some(s => name.includes(s))) return false;
    // Native rarity 2 covers seal tiers. Plus and blue options do not protect
    // ordinary gear; unknown rarity still means keep it rather than guess.
    if (ItemType.isEquipment(tf) && (![0, 1].includes(item.tooltip?.fields?.rarity) ||
        /_(RARE|MAGIC|LEGEND|MYTH)(?:_HONOR)?$/i.test(item.codename || ''))) return false;
    return true;
  },
  eligible(item) { return this.disposable(item) && Loot.category(item.typeFlags) === 'elixirs'; },
  sellable(item) { return this.disposable(item) && Loot.category(item.typeFlags) !== 'elixirs'; },
  autoRevive() { return this.cfg().enabled && this.cfg().revive; },
  reason() {
    const c = this.cfg(), pet = Loot.pet();
    if (World.freeBagSlots() <= 1) return 'character bag nearly full';
    if (c.petFull && pet && pet.rec.status - pet.rec.inventory.length <= c.petFree) return 'pickup pet nearly full';
    if (this.supplies().some(s => Restock.count(s.refObjId) <= s.low)) return 'potions running low';
    return '';
  },
  validate() {
    const c = this.cfg(), supplies = this.supplies();
    const missing = [['arrival', 'arrival point'], ['vendor', 'potion merchant'], ['smith', 'repair merchant'], ['gate', 'world statue / teleport'], ...(c.petFull ? [['storage', 'warehouse']] : [])].filter(([key]) => !c[key]).map(([, label]) => label);
    if (missing.length) return 'Save missing town services: ' + missing.join(', ') + '.';
    if (supplies.some(s => !Number.isInteger(c.stacks?.[s.kind]) || c.stacks[s.kind] < 1 || c.stacks[s.kind] > 200)) return 'Set town refill targets to whole stacks from 1 to 200.';
    if (!supplies.length || supplies.some(s => !s.refObjId || !Number.isInteger(s.low) || !Number.isInteger(s.target) || s.low < 0 || s.target <= s.low || s.target > 10000)) return 'Choose potions and valid low-stock/refill quantities.';
    if (!this.scroll(0x09ec) || !this.scroll(0x19ec)) return 'Carry a return scroll and a reverse return scroll before hunting.';
    if (toBigInt(World.gp.progression?.gold ?? 0) <= 0n) return 'Carry gold for potions, storage and repairs.';
    return '';
  },
  fail(reason) {
    this.cancel(); this.message = 'Town cycle stopped: ' + reason;
    Hunt.stop(this.message); UI.toast(this.message, 'warn', 8000);
  },
  cancel() {
    if (this.trip && World.inWorld() && World.gp.returnScroll && ['recall-wait', 'reverse-wait'].includes(this.trip.phase)) Cmd.raw({ kind: 'return-cancel' }, 'Town: cancel return cast');
    this.trip = null;
  },
  phase(phase) {
    const t = this.trip;
    if (!t) return false;
    if (phase === 'entering-world' && ['recall-wait', 'reverse-wait'].includes(t.phase) && now() - t.at < 90000) {
      t.transition = true; return true;
    }
    if (phase !== 'world') this.fail('Unexpected travel or disconnect.');
    return false;
  },
  begin(revival = false) {
    const error = this.validate();
    if (error) return this.fail(error);
    const origin = revival ? this.lastScrollPoint || Hunt.cfg().center : World.pose();
    if (!origin) return this.fail('No saved hunting point for revival return.');
    if (revival) Hunt.running = true;
    Restock.trip = null;
    Resurrect.cancelTrip('', true); Resurrect.holdUntil = 0; Loot.suspend();
    this.trip = { phase: 'recall', at: now(), started: now(), origin: { ...origin }, revival,
      manualAt: Manual.lastAt, character: World.charName, petRef: Loot.pet()?.rec.refObjId,
      config: JSON.stringify(this.cfg()), supplies: this.supplies() };
    Hunt.targetGid = Hunt.lootGid = 0;
    // Stop the worker's repeating attack/movement as well as the bot's next tick.
    // Pending inventory work still settles before item-use is admitted below.
    this.trip.haltSent = Cmd.move(World.pose());
    this.trip.haltAt = now();
    this.trip.haltAttempts = this.trip.haltSent ? 1 : 0;
    if (revival) this.enter('revive-arrival');
    else this.message = 'Using return scroll; recall must be bound to Hotan.';
  },
  arrived() {
    if (World.freeBagSlots() < 1) return this.fail('Returned to town; free a character bag slot for storage and refills.');
    if (this.cfg().petFull && this.reason() === 'pickup pet nearly full' && !Loot.pet()?.rec.inventory.some(i => this.disposable(i))) return this.fail('Returned to town; pet is full of protected items. Empty it manually.');
    this.enter(this.cfg().storage ? 'walk-storage' : 'walk-vendor');
  },
  enter(phase) {
    const t = this.trip;
    t.phase = phase; t.at = now(); t.sent = false; t.pending = null; t.transition = false;
    t.travel = null; t.lastPose = null; t.progressAt = now(); t.movedAt = -Infinity; t.retryAt = 0;
    this.message = 'Town cycle: ' + phase;
  },
  walk(dest) {
    const t = this.trip, pose = World.pose();
    // Permit a reachable nearby approach, but always stay in service range.
    const radius = Math.max(0, Math.min(60, 190 - dist2D(dest, dest.npc || dest)));
    if (dist2D(pose, dest) <= Math.max(12, radius) && dist2D(pose, dest.npc || dest) <= 200) return true;
    if (!Number.isFinite(dist2D(pose, dest))) { this.fail('Town service is in another world.'); return false; }
    if (!t.lastPose || dist2D(t.lastPose, pose) > 3) { t.lastPose = { ...pose }; t.progressAt = now(); }
    if (now() < t.retryAt) return false;
    if (now() - t.progressAt > 20000) {
      t.travel = null; t.retryAt = now() + 5000; t.progressAt = now();
      this.message = 'Town movement: waiting to retry a blocked route.';
      return false;
    }
    const step = Navigation.next(t, dest, false, radius);
    if (step.waiting || step.error) {
      t.travel = null; t.retryAt = now() + 5000; t.progressAt = now();
      this.message = 'Town movement to ' + (dest.name || t.phase.slice(5)) + ': waiting; retrying collision route. ' + (step.error || 'Waiting for collision coverage.');
      return false;
    }
    this.message = 'Town cycle: walking to ' + (dest.name || 'service point');
    if (!step.point || now() - t.movedAt < 1000 || World.gp.inventoryPending) return false;
    if (World.isSitting()) { if (Cmd.action(1000)) t.movedAt = now(); }
    else if (Cmd.move(step.point)) t.movedAt = now();
    return false;
  },
  serviceEntity(role, entity) { return !!entity && (entity.kind === 'npc' || role === 'gate' && entity.kind === 'teleport'); },
  npc(role) {
    const saved = this.cfg()[role];
    return [...World.ents.values()].find(e => this.serviceEntity(role, e) && e.refObjId === saved.refObjId && dist2D(e, saved.npc || saved) < 100);
  },
  open(role, kind) {
    const t = this.trip, gp = World.gp, npc = this.npc(role);
    if (now() - t.at > 15000) { this.fail('Could not open ' + role + '.'); return false; }
    if (!npc || gp.targetPending || gp.inventoryPending) return false;
    if (gp.target !== npc.gid) {
      if (t.sent) { this.fail('Town NPC selection changed.'); return false; }
      if (Cmd.spaced('select')) Cmd.select(npc.gid);
      return false;
    }
    const caps = { storage: 4, vendor: 1, smith: 8, gate: 0x20000000 };
    if (!(gp.targetCapabilities & caps[role])) { this.fail('Selected NPC does not offer ' + role + '.'); return false; }
    // Selection itself opens the service menu. npc-talk requires the separate
    // Talk capability and is invalid for teleport statues with no dialogue.
    if (role === 'gate') return gp.npcConversation?.phase === 'menu' && gp.npcConversation.gid === npc.gid;
    if (!t.sent) {
      t.revision = gp.shopCompletionRevision;
      if (Cmd.raw({ kind, ...(kind === 'npc-talk' ? {} : { gid: npc.gid }) }, 'Town: open ' + role)) t.sent = true;
      return false;
    }
    if (role === 'storage') return gp.storage?.phase === 'open' && !gp.storage.guild && gp.storage.npc === npc.gid;
    return gp.shop?.npc === npc.gid && gp.shopCompletionRevision !== t.revision;
  },
  close(next) {
    const t = this.trip, gp = World.gp;
    if (gp.inventoryPending) return;
    if (!t.sent) { if (Cmd.raw({ kind: 'npc-close' }, 'Town: close NPC')) t.sent = true; return; }
    if (!gp.target && !gp.storage) this.enter(next);
  },
  pendingDone(check) {
    const t = this.trip, p = t.pending;
    if (!p) return true;
    if (World.gp.inventoryPending || now() - p.at < 500) {
      if (now() - p.at > 15000) this.fail('Inventory transaction timed out. No repeat command sent.');
      return false;
    }
    if (check(p)) { t.pending = null; return true; }
    if (World.gp.error || now() - p.at > 15000) this.fail(World.gp.error || 'Transaction was not confirmed. No repeat command sent.');
    return false;
  },
  store() {
    const t = this.trip, gp = World.gp, st = gp.storage;
    if (!st || st.guild || st.phase !== 'open' || gp.target !== st.npc) return this.fail('Warehouse closed or selection changed.');
    const pet = Loot.pet();
    if (t.petRef && (!pet || pet.rec.refObjId !== t.petRef)) return this.fail('Pickup pet is missing or changed.');
    if (!this.pendingDone(p => {
      if (p.kind === 'pet') return !pet.rec.inventory.some(i => i.slot === p.source && i.refObjId === p.ref) && World.items().some(i => i.slot === p.destination && i.refObjId === p.ref && (i.quantity ?? 1) === p.quantity);
      return !World.items().some(i => i.slot === p.source && i.refObjId === p.ref) && st.items.some(i => i.slot === p.destination && i.refObjId === p.ref && (i.quantity ?? 1) === p.quantity);
    }) || !this.trip || gp.inventoryPending) return;
    const bagItem = t.staged ? World.items().find(i => i.slot === t.staged.slot && i.refObjId === t.staged.ref) : null;
    if (t.staged && !bagItem) return this.fail('Staged pet item changed unexpectedly.');
    const item = bagItem || pet?.rec.inventory.find(i => this.eligible(i));
    if (!item) {
      this.enter('close-storage'); return;
    }
    const destination = this.free(st.items, 0, st.capacity);
    if (destination === null) return this.fail('Storage is full.');
    let command, pending;
    if (bagItem) {
      command = { kind: 'storage-move', move: { type: 2, source: item.slot, destination, quantity: 0, gold: 0 } };
      pending = { kind: 'store', source: item.slot, destination, ref: item.refObjId, quantity: item.quantity ?? 1 };
    } else {
      const slot = this.free(gp.inventory, gp.equipmentSlotCount || 13, gp.inventorySlotCount);
      if (slot === null) return this.fail('No temporary character bag slot for pet transfer.');
      command = { kind: 'cos-transfer', gid: pet.rec.gid, toCos: false, source: item.slot, destination: slot };
      pending = { kind: 'pet', source: item.slot, destination: slot, ref: item.refObjId, quantity: item.quantity ?? 1 };
    }
    if (Cmd.raw(command, 'Town: move selected pet loot')) {
      t.pending = { ...pending, at: now() };
      t.staged = bagItem ? null : { slot: pending.destination, ref: pending.ref };
    }
  },
  sell() {
    const t = this.trip, gp = World.gp, pet = Loot.pet();
    if (!Restock.activeShop() || gp.shop.npc !== this.npc('smith')?.gid || gp.shop.error) return this.fail(gp.shop?.error || 'Weapon merchant selection changed.');
    if (t.petRef && (!pet || pet.rec.refObjId !== t.petRef)) return this.fail('Pickup pet is missing or changed.');
    if (t.salePetGid && pet?.rec.gid !== t.salePetGid) return this.fail('Pickup pet changed during selling.');
    if (!this.pendingDone(p => !pet.rec.inventory.some(i => i.slot === p.source && i.refObjId === p.ref)) || !this.trip || gp.inventoryPending) return;
    const item = pet?.rec.inventory.find(i => this.sellable(i));
    if (!item) {
      if (this.cfg().petFull && pet && pet.rec.status - pet.rec.inventory.length <= this.cfg().petFree) return this.fail('Protected pet items still fill the bag.');
      this.enter('repair'); return;
    }
    const quantity = item.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 65535) return this.fail('Invalid pet item sale quantity.');
    if (Cmd.raw({ kind: 'cos-shop-sell', gid: pet.rec.gid, slot: item.slot, quantity }, 'Town: sell pet loot at weapon merchant')) {
      t.salePetGid = pet.rec.gid;
      t.pending = { source: item.slot, ref: item.refObjId, quantity, at: now() };
    }
  },
  buy() {
    const t = this.trip, gp = World.gp, shop = Restock.activeShop();
    if (!shop || shop.npc !== this.npc('vendor')?.gid || shop.error) return this.fail(shop?.error || 'Potion merchant selection changed.');
    if (!this.pendingDone(p => Restock.count(p.ref) >= p.before + p.quantity) || !this.trip || gp.inventoryPending) return;
    let s = t.supplies.find(s => Restock.count(s.refObjId) < s.target);
    if (!s) {
      // Refill held travel scrolls from gold offers only. Never buy from Item Mall.
      for (const type of [0x09ec, 0x19ec]) {
        const count = World.items().filter(i => (i.typeFlags & 0xfffc) === type).reduce((n, i) => n + (i.quantity ?? 1), 0);
        if (count >= 2) continue;
        const offer = shop.offers.find(o => (o.currency === undefined || o.currency === 1) &&
          (o.items || o.previews || []).some(i => i.refObjId === o.refObjId && (i.typeFlags & 0xfffc) === type) &&
          (!o.contents?.length || o.contents.length === 1 && o.contents[0].refObjId === o.refObjId && o.contents[0].quantity === 1));
        if (offer) { s = { kind: 'scroll', refObjId: offer.refObjId, target: Restock.count(offer.refObjId) + 2 - count }; break; }
        if (!count) return this.fail('Travel scrolls unavailable at this merchant. Carry spares.');
      }
    }
    if (!s) { this.enter('close-vendor'); return; }
    const offer = shop.offers.find(o => o.refObjId === s.refObjId && (s.kind === 'scroll' || Restock.offerKind(o) === s.kind));
    if (!offer || !(offer.maxStack > 0)) return this.fail(s.kind === 'scroll' ? 'Selected scroll is unavailable here.' : 'X-Large ' + s.kind.toUpperCase() + ' potion is unavailable here.');
    const before = Restock.count(s.refObjId), room = World.items().filter(i => i.refObjId === s.refObjId).reduce((n, i) => n + Math.max(0, offer.maxStack - (i.quantity ?? 1)), 0);
    const quantity = Math.min(s.target - before, offer.purchaseLimit ?? offer.maxStack, 65535, room + Math.max(0, World.freeBagSlots() - 1) * offer.maxStack);
    if (quantity < 1) return this.fail('Not enough bag space for refill and a spare transfer slot.');
    if (gp.progression?.gold === undefined || toBigInt(offer.price) * BigInt(quantity) > toBigInt(gp.progression.gold)) return this.fail('Not enough gold for potion refill.');
    if (Cmd.raw({ kind: 'shop-buy', tab: offer.tab, slot: offer.slot, quantity }, 'Town: refill ' + s.kind)) t.pending = { ref: s.refObjId, before, quantity, at: now() };
  },
  maximum(item) {
    const f = item.tooltip?.fields;
    if (!f || !Number.isFinite(f.varianceIntMin1c0) || !Number.isFinite(f.varianceIntMax1c4) || item.variance === undefined) return null;
    const base = Math.trunc((f.varianceIntMax1c4 - f.varianceIntMin1c0) * Number(toBigInt(item.variance) & 31n) / 31 + f.varianceIntMin1c0 + .5);
    if (!base) return 0;
    let pct = 0;
    for (const encoded of item.magic || []) {
      const bits = toBigInt(encoded), r = item.magicReferences?.find(r => r.paramId === Number(bits & 65535n)), amount = Number(bits >> 32n) & 0xffffffff;
      if (!r) continue;
      if (r.optionName === 'MATTR_DUR' && r.paramName.includes('+')) pct += amount;
      if (r.optionName === 'MATTR_DEC_MAXDUR' && r.paramName.includes('-')) pct -= amount;
      if (r.optionName === 'MATTR_NOT_REPARABLE' && r.paramName.includes('-')) pct += r.rangeWords?.[1] ?? 0;
    }
    return Math.max(1, base + Math.trunc(base * pct / 100));
  },
  damaged() {
    const result = [];
    for (const i of World.gp.inventory || []) {
      if (!ItemType.isEquipment(i.typeFlags) || i.durability === undefined) continue;
      if (!i.tooltip?.fields) throw Error('Missing equipment repair metadata.');
      if (!i.tooltip.fields.canRepair) continue;
      const max = this.maximum(i);
      if (max === null) throw Error('Missing equipment maximum durability.');
      if (i.durability < max) result.push({ slot: i.slot, ref: i.refObjId, max });
    }
    return result;
  },
  repair() {
    const t = this.trip, gp = World.gp;
    if (!Restock.activeShop() || gp.shop.npc !== this.npc('smith')?.gid) return this.fail('Smith selection changed.');
    if (!t.sent) {
      const damaged = this.damaged();
      if (!damaged.length) return this.enter('close-smith');
      if (Cmd.raw({ kind: 'shop-repair', mode: 2, slot: 0 }, 'Town: repair equipment')) { t.sent = true; t.repairs = damaged; }
      return;
    }
    if (gp.inventoryPending || now() - t.at < 1000) return;
    if (t.repairs.every(r => gp.inventory.some(i => i.slot === r.slot && i.refObjId === r.ref && i.durability >= r.max))) this.enter('close-smith');
    else if (now() - t.at > 15000) this.fail('Repairs were not confirmed. Check gold and repair restrictions.');
  },
  tick() {
    const c = this.cfg();
    if (!this.trip) {
      if (!c.enabled || !Hunt.running || !World.inWorld() || World.isDead() ||
          WalkBack.active || Restock.recording || Restock.activeShop() || World.gp.storage || now() - Manual.lastAt < Hunt.cfg().manualPauseS * 1000 || !this.reason()) return false;
      this.begin();
      if (!this.trip) return true;
    }
    const t = this.trip, gp = World.gp;
    if (!c.enabled || !Hunt.running || t.character !== World.charName || t.config !== JSON.stringify(c)) { this.fail('Settings or character changed during the trip.'); return true; }
    if (Manual.lastAt !== t.manualAt) { this.fail('Manual control interrupted the trip.'); return true; }
    // Movement may wait indefinitely for collision coverage. Individual service
    // and transaction phases still enforce their own confirmation timeouts.
    if (['recall-wait', 'reverse-wait', 'revive-arrival'].includes(t.phase) && now() - t.at > 90000) { this.fail('Scroll arrival timed out.'); return true; }
    if (!World.inWorld() || !gp?.pose || !World.local()) return true;
    if (World.isDead()) { this.fail('Character died during town service.'); return true; }
    if (t.phase === 'recall' && now() - t.at > 30000) { this.fail('Combat or inventory did not settle before departure.'); return true; }
    // Stopping combat is part of departure, not a best-effort side effect.
    // The initial move may hit Cmd.move's 550 ms rate limit or pending queue.
    // Retry it before waiting for a cast that the worker otherwise repeats.
    if (t.phase === 'recall' && (!t.haltSent || World.isCasting() && now() - t.haltAt >= 1500 && t.haltAttempts < 3)) {
      if (Cmd.move(World.pose())) { t.haltSent = true; t.haltAt = now(); t.haltAttempts++; }
      this.message = 'Town departure: stopping combat before using the return scroll.';
      return true;
    }
    if (now() - Potion.lastUse < 350) return true;
    Hunt.state = 'restock';
    if (t.phase === 'recall') {
      if (World.isCasting() || gp.inventoryPending) {
        this.message = 'Town departure reserved; waiting for combat or inventory to settle.';
        return true;
      }
      if (World.isSitting()) { if (Cmd.spaced('action')) Cmd.action(1000); return true; }
      if (World.local()?.mountedOn) { this.fail('Dismount before starting town service.'); return true; }
      const scroll = this.scroll(0x09ec);
      if (!scroll) { this.fail('Return scroll missing.'); return true; }
      if (Cmd.itemUse(scroll.slot)) this.enter('recall-wait');
    } else if (t.phase === 'revive-arrival') {
      if (!gp.inventoryPending && !gp.returnScroll && dist2D(World.pose(), c.arrival) <= clamp(Number(c.arrivalRadius) || 500, 100, 1500)) this.arrived();
      else this.message = 'Waiting for revival at the saved town arrival area.';
    } else if (['recall-wait', 'reverse-wait'].includes(t.phase)) {
      const dest = t.phase === 'recall-wait' ? c.arrival : t.origin;
      const radius = t.phase === 'recall-wait' ? clamp(Number(c.arrivalRadius) || 500, 100, 1500) : 120;
      const distance = dist2D(World.pose(), dest);
      // Require a world transition; the old pose can lie next to the expected point.
      if (t.transition && distance <= radius && !gp.inventoryPending && !gp.returnScroll) {
        if (t.phase === 'recall-wait') { this.lastScrollPoint = { ...t.origin }; this.arrived(); }
        else {
          this.trip = null; Hunt.targetGid = Hunt.lootGid = 0; Hunt.state = 'search';
          this.message = 'Town service complete; hunting resumed.'; UI.toast(this.message);
        }
      } else {
        this.message = !t.transition ? 'Waiting for scroll travel confirmation.' : gp.inventoryPending || gp.returnScroll
          ? 'Waiting for scroll arrival state to settle.'
          : 'Waiting for arrival area: ' + (Number.isFinite(distance) ? Math.round(distance / 10) + ' m from saved point; tolerance ' + Math.round(radius / 10) + ' m.' : 'saved point is in another world.');
      }
    } else if (t.phase.startsWith('walk-')) {
      const role = t.phase.slice(5);
      if (this.walk(c[role]) && this.trip) this.enter('open-' + role);
    } else if (t.phase.startsWith('open-')) {
      const role = t.phase.slice(5), kind = role === 'storage' ? 'storage-open' : role === 'gate' ? 'npc-talk' : 'shop-open';
      if (this.open(role, kind) && this.trip) this.enter({ storage: 'store', vendor: 'buy', smith: 'sell', gate: 'reverse' }[role]);
    } else if (t.phase === 'store') this.store();
    else if (t.phase === 'buy') this.buy();
    else if (t.phase === 'sell') this.sell();
    else if (t.phase === 'repair') this.repair();
    else if (t.phase.startsWith('close-')) {
      if (now() - t.at > 15000) this.fail('NPC window did not close.');
      else this.close({ 'close-storage': 'walk-vendor', 'close-vendor': 'walk-smith', 'close-smith': 'walk-gate' }[t.phase]);
    } else if (t.phase === 'reverse') {
      if (gp.inventoryPending || World.isCasting()) return true;
      if (t.supplies.some(s => Restock.count(s.refObjId) < s.target) || this.damaged().length || !this.scroll(0x09ec) || !this.scroll(0x19ec)) { this.fail('Final supply, repair or travel-scroll check failed.'); return true; }
      if (World.freeBagSlots() <= 1) { this.fail('Returned to town; free at least two character bag slots before hunting again.'); return true; }
      const npc = this.npc('gate');
      if (!npc || gp.target !== npc.gid || !(gp.targetCapabilities & 0x20000000)) { this.fail('Reverse-return teleport NPC unavailable.'); return true; }
      if (Cmd.raw({ kind: 'travel-gate', gid: npc.gid, type: 5, target: 2 }, 'Town: reverse to last return-scroll point')) this.enter('reverse-wait');
    }
    return true;
  },
};
