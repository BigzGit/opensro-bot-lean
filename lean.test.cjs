const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/bot.lean.user.js', 'utf8');
const isolated = source.slice(0, source.lastIndexOf('installWorkerHook();')) +
  'globalThis.bot = {World, Settings, Updates, Diagnostics, Reports, Alchemy, Hook, Cmd, Hunt, Loot, Restock, WalkBack, Navigation, Learned, Display, Wardrobe, WdData, LeanWardrobe, Controller, UI, Stats, Combat, Potion, Party, Town, bus, Manual, Resurrect, SpeedScroll, stopAll, toggleBot, boot, Ticker, Sound};\n})();';
function fixture() {
  let time = 100000;
  const storage = new Map(), commands = [], notices = [], intervals = [], timers = [];
  const win = { addEventListener() {}, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) } };
  const context = { window: win, performance: { now: () => time }, console,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, setInterval(fn, ms) { intervals.push({ fn, ms }); }, AbortController, Blob, FormData, URL, Map, Set, Date, ArrayBuffer, DataView, atob };
  vm.createContext(context); vm.runInContext(isolated, context);
  const b = context.bot;
  b.UI.toast = message => notices.push(message);
  b.Hook.post = msg => commands.push(msg.command.command);
  b.World.phase = 'world'; b.World.simOffset = 0;
  b.World.gp = { localGid: 1, target: 0, targetPending: false, inventoryPending: false,
    pose: { regionId: 1, x: 100, y: 0, z: 100 }, progression: { gold: '100000', stats: { maxHp: 100, maxMp: 100 } },
    inventory: [], inventorySlotCount: 30, equipmentSlotCount: 13, skills: [], vitals: [],
    social: { members: [] }, pendingMoves: 0, shopCompletionRevision: 0 };
  b.World.ents.set(1, { gid: 1, kind: 'player', movementMode: 0, appearanceState: [0, 0, 0] });
  b.Settings.profile.hunt.center = { regionId: 1, x: 100, y: 0, z: 100 };
  b.Settings.profile.hunt.sit.enabled = false;
  b.Loot.init();
  b.Navigation.install(navProduct());
  function drop(gid = 20, tf = 2284) {
    const e = { gid, kind: 'ground-item', refObjId: 101, name: 'HP potion', regionId: 1, x: 200, y: 0, z: 100, groundItem: { typeFlags: tf, goldAmount: 0 } };
    b.World.ents.set(gid, e); return e;
  }
  return { ...b, commands, notices, storage, drop, win, intervals, timers, advance: ms => { time += ms; } };
}
let passed = 0;
function pickupPet(f, commandMode = 7) {
  const rec = { gid: 50, refObjId: 500, band: 4, hp: 100, status: 5, inventory: [], commandMode };
  f.World.gp.cosRecords = [rec];
  f.World.ents.set(50, { gid: 50, kind: 'cos', refObjId: 500, ownerGid: 1, regionId: 1, x: 100, y: 0, z: 100 });
  f.Settings.profile.hunt.pickup.collector = 'pet'; f.Loot.preset('elixirs');
  return rec;
}
test('pet disables only native auto-grab bit and waits for server confirmation', () => {
  const f = fixture(), pet = pickupPet(f, 0x1c7), d = f.drop(20, 3436);
  assert.equal(f.Loot.preparePet(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands.at(-1))), { kind: 'cos-behavior', gid: 50, mode: 0x147 });
  assert.equal(pet.commandMode, 0x1c7); assert.equal(f.Loot.begin(d), false);
  f.advance(1000); f.Loot.preparePet(); assert.equal(f.commands.length, 1);
  pet.commandMode = 0x147; assert.equal(f.Loot.preparePet(), true);
  assert.equal(f.Loot.begin(d), true); assert.equal(f.commands.at(-1).kind, 'cos-pickup');
});
test('pet collects only elixirs into its own inventory and confirms its gain', () => {
  const f = fixture(), pet = pickupPet(f), d = f.drop(20, 3436);
  f.drop(21, 5484); f.drop(22, 2284); f.drop(23, 748);
  assert.equal(f.Loot.choose().gid, d.gid); assert.equal(f.Loot.begin(d), true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands.at(-1))), { kind: 'cos-pickup', gid: 50, target: 20 });
  f.World.gp.inventory.push({ slot: 13, refObjId: 101, quantity: 5 });
  f.Loot.tick(); assert.equal(f.Stats.values.loot, 0);
  pet.inventory.push({ slot: 0, refObjId: 101, quantity: 1 });
  f.Loot.tick(); assert.equal(f.Stats.values.loot, 1); assert.equal(f.Loot.active, null);
  assert.equal(f.commands.some(c => c.kind === 'pickup'), false);
});
test('pet capacity is independent of the player bag and existing stacks merge', () => {
  const f = fixture(), pet = pickupPet(f), d = f.drop(20, 3436);
  f.World.gp.inventorySlotCount = 13; assert.equal(f.Loot.allowed(d), true);
  pet.status = 1; pet.inventory = [{ slot: 0, refObjId: 200, quantity: 1 }]; assert.equal(f.Loot.allowed(d), false);
  pet.inventory[0] = { slot: 0, refObjId: 101, quantity: 1, tooltip: { fields: { maxStack: 100 } } };
  assert.equal(f.Loot.allowed(d), true); pet.inventory[0].quantity = 100; assert.equal(f.Loot.allowed(d), false);
});
test('missing, foreign, dead or distant pet never falls back to character collection', () => {
  const f = fixture(), pet = pickupPet(f), d = f.drop(20, 3436);
  const ent = f.World.ents.get(50);
  ent.ownerGid = 2; assert.equal(f.Loot.begin(d), false);
  ent.ownerGid = 1; pet.dead = true; assert.equal(f.Loot.choose(), null);
  pet.dead = false; ent.x = 900; assert.equal(f.Loot.choose(), null);
  ent.x = 100; f.World.gp.cosRecords = []; assert.equal(f.Loot.begin(d), false);
  assert.equal(f.commands.length, 0);
});
test('pet pickup yields to busy inventory and a freshly sent potion', () => {
  const f = fixture(); pickupPet(f); const d = f.drop(20, 3436);
  f.World.gp.inventoryPending = true; assert.equal(f.Loot.begin(d), false);
  f.World.gp.inventoryPending = false; f.Potion.lastUse = 100000;
  assert.equal(f.Loot.begin(d), false); assert.equal(f.commands.length, 0);
});
test('pet collects promptly above potion thresholds instead of waiting in the ten-percent margin', () => {
  for (const [hp, mp] of [[65, 100], [100, 45]]) {
    const f = fixture(); petFight(f); f.drop(20, 3436);
    f.Settings.profile.hunt.pickup.afterKillOnly = false;
    f.World.gp.vitals = [{ gid: 1, hp, mp, maxHp: 100, maxMp: 100 }];
    let fights = 0; f.Combat.fight = () => { fights++; };
    f.Controller.tick();
    assert.equal(f.commands.filter(c => c.kind === 'cos-pickup').length, 1);
    assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
    assert.equal(fights, 1);
  }
});
test('pet retries are not starved by HP just above the potion threshold', () => {
  const f = fixture(); pickupPet(f); const d = f.drop(20, 3436); f.Hunt.start(); f.Loot.begin(d);
  f.advance(9000); f.Loot.tick();
  f.World.gp.vitals = [{ gid: 1, hp: 65, mp: 100, maxHp: 100, maxMp: 100 }];
  f.advance(800); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'cos-pickup').length, 2);
});
test('combat errors do not interrupt or suppress a pending pet pickup', () => {
  for (const error of ['Target is out of range', 'Insufficient MP', 'Not enough inventory space for item use']) {
    const f = fixture(); pickupPet(f); const d = f.drop(20, 3436); f.Hunt.start(); f.Loot.begin(d);
    f.bus.emit('game-error', error); f.Loot.tick();
    assert.ok(f.Loot.active); assert.equal(f.Loot.active.retryAt, 0);
    assert.equal(f.Loot.skips.has(d.gid), false);
  }
});
test('native busy and rejected pickup errors never permanently exclude an unchanged pet bag', () => {
  for (const error of ['Inventory command unavailable', 'Inventory rejected: 3']) {
    const f = fixture(); pickupPet(f); const d = f.drop(20, 3436); f.Hunt.start(); f.Loot.begin(d);
    f.Settings.profile.hunt.pickup.retries = 0;
    f.bus.emit('game-error', error); f.Loot.tick();
    assert.equal(f.Loot.active, null); assert.equal(f.Loot.choose(), null);
    f.advance(6000); assert.equal(f.Loot.choose()?.gid, d.gid);
  }
});
test('pet chooses the nearest eligible drop to itself inside the configured hunting range', () => {
  const f = fixture(); pickupPet(f); f.World.ents.get(50).x = 350;
  const nearPlayer = f.drop(20, 3436); nearPlayer.x = 110;
  const nearPet = f.drop(21, 3436); nearPet.x = 340;
  const outside = f.drop(22, 3436); outside.x = 410;
  assert.equal(f.Loot.choose()?.gid, nearPet.gid);
  nearPet.groundItem.ownerJid = 999; assert.equal(f.Loot.choose()?.gid, nearPlayer.gid);
});
test('pet yields to actual potion dispatch and pending inventory then collects without interrupting combat', () => {
  const f = fixture(); petFight(f); f.drop(20, 3436);
  f.World.gp.inventory.push({ slot: 16, refObjId: 8, typeFlags: 2284, quantity: 50 });
  f.World.gp.vitals = [{ gid: 1, hp: 55, mp: 100, maxHp: 100, maxMp: 100 }];
  let fights = 0; f.Combat.fight = () => { fights++; };
  f.Controller.tick(); assert.equal(f.commands.some(c => c.kind === 'item-use'), true);
  assert.equal(f.commands.some(c => c.kind === 'cos-pickup'), false);
  assert.match(f.Loot.petStatus(), /potion/);
  f.World.gp.inventoryPending = true; f.advance(400); f.Controller.tick();
  assert.equal(f.commands.some(c => c.kind === 'cos-pickup'), false);
  assert.match(f.Loot.petStatus(), /transaction/);
  f.World.gp.inventoryPending = false; f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'cos-pickup').length, 1);
  assert.match(f.Loot.petStatus(), /collecting/);
  assert.equal(fights, 3);
});
test('pet configuration retries are bounded and resummoning resets setup', () => {
  const f = fixture(), pet = pickupPet(f, 135);
  for (let i = 0; i < 8; i++) { f.Loot.preparePet(); f.advance(6000); }
  assert.equal(f.commands.length, 3); assert.match(f.Loot.petStatus(), /not disabled/);
  pet.commandMode = 7; assert.equal(f.Loot.preparePet(), true); assert.equal(f.Loot.petSetup, null);
});
test('pet retries retain pet recipient and stop prevents further pickups', () => {
  const f = fixture(); pickupPet(f); const d = f.drop(20, 3436); f.Loot.begin(d);
  f.advance(9000); f.Loot.tick(); f.advance(800); f.Loot.tick();
  assert.equal(f.commands.filter(c => c.kind === 'cos-pickup').length, 2);
  assert.equal(f.commands.some(c => c.kind === 'pickup'), false);
  f.stopAll(); f.advance(1000); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'cos-pickup').length, 2);
});
test('hunt controller waits for pet settings, then collects with the pet only', () => {
  const f = fixture(), pet = pickupPet(f, 135); f.drop(20, 3436); f.Hunt.start();
  f.Controller.tick(); assert.equal(f.commands.at(-1).kind, 'cos-behavior');
  assert.equal(f.commands.some(c => c.kind === 'cos-pickup'), false);
  pet.commandMode = 7; f.advance(500); f.Controller.tick();
  assert.equal(f.Controller.mode, 'loot'); assert.equal(f.commands.at(-1).kind, 'cos-pickup');
  assert.equal(f.commands.some(c => c.kind === 'pickup'), false);
});
function navProduct(objects = [], blocked = new Uint8Array(9216)) {
  return { regionId: 1, complete: true, objects,
    navmesh: { regionSize: 1920, tileSize: 20, tilesPerAxis: 96,
      regions: [{ dx: 0, dz: 0, cells: { count: 1 }, blockedTiles: Buffer.from(blocked).toString('base64'), tileCellIds: Buffer.alloc(36864).toString('base64') }] } };
}
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
test('filters foreign ownership and permits own/party claims', () => {
  const f = fixture(), d = f.drop(); d.groundItem.ownerJid = 2;
  assert.equal(f.Loot.choose(), null);
  f.World.gp.social.members = [{ id: 2 }]; assert.equal(f.Loot.choose().gid, d.gid);
  d.groundItem.claimantGid = 3; assert.equal(f.Loot.choose(), null);
  d.groundItem.claimantGid = 1; assert.equal(f.Loot.choose().gid, d.gid);
});
test('include cannot bypass exclusion or capacity; existing stack can merge', () => {
  const f = fixture(), d = f.drop(), p = f.Settings.profile.hunt.pickup;
  p.include = 'potion'; p.exclude = 'potion'; assert.equal(f.Loot.allowed(d), false);
  p.exclude = ''; f.World.gp.inventorySlotCount = 13; assert.equal(f.Loot.allowed(d), false);
  f.World.gp.inventory = [{ slot: 13, refObjId: 101, quantity: 10, tooltip: { fields: { maxStack: 100 } } }];
  assert.equal(f.Loot.allowed(d), true);
  f.World.gp.inventory[0].quantity = 100; assert.equal(f.Loot.allowed(d), false);
});
test('approach survives more than 4.5 seconds while making progress', () => {
  const f = fixture(), d = f.drop(); assert.equal(f.Loot.begin(d), true);
  for (let n = 0; n < 3; n++) { f.advance(5000); f.World.gp.pose.x += 20; assert.equal(f.Loot.tick(), true); assert.ok(f.Loot.active); }
  assert.equal(f.commands.filter(c => c.kind === 'pickup').length, 1);
});
test('inventory gain confirms exactly one pickup before despawn', () => {
  const f = fixture(), d = f.drop(); f.Loot.begin(d);
  f.World.gp.inventory = [{ slot: 13, refObjId: 101, quantity: 1 }]; f.Loot.tick();
  assert.equal(f.Stats.values.loot, 1); assert.equal(f.Loot.active, null); assert.equal(f.Loot.choose(), null);
  f.Loot.tick(); assert.equal(f.Stats.values.loot, 1);
});
test('despawn alone never counts as success; delayed gain still confirms', () => {
  const f = fixture(), d = f.drop(); f.Loot.begin(d); f.World.ents.delete(d.gid); f.Loot.tick();
  f.advance(1600); f.Loot.tick(); assert.equal(f.Stats.values.loot, 0); assert.equal(f.Loot.active, null);
  const g = fixture(), other = g.drop(); g.Loot.begin(other); g.World.ents.delete(other.gid); g.Loot.tick();
  g.advance(700); g.World.gp.inventory = [{ slot: 13, refObjId: 101, quantity: 2 }]; g.Loot.tick(); assert.equal(g.Stats.values.loot, 1);
});
test('gold gain confirms pickup', () => {
  const f = fixture(), d = f.drop(20, 748); f.Loot.begin(d); f.World.gp.progression.gold = '100050'; f.Loot.tick(); assert.equal(f.Stats.values.loot, 1);
});
test('bounded retries cancel worker intent then back off', () => {
  const f = fixture(), d = f.drop(); f.Settings.profile.hunt.pickup.retries = 1; f.Loot.begin(d);
  f.advance(9000); f.Loot.tick(); assert.equal(f.commands.at(-1).kind, 'move');
  f.advance(800); f.Loot.tick(); assert.equal(f.commands.filter(c => c.kind === 'pickup').length, 2);
  f.advance(9000); f.Loot.tick(); assert.equal(f.Loot.active, null); assert.equal(f.Loot.choose(), null);
  f.advance(6000); assert.equal(f.Loot.choose().gid, d.gid);
});
test('capacity failures suppress a drop until inventory changes', () => {
  const f = fixture(), d = f.drop(); f.Loot.begin(d); f.bus.emit('game-error', 'Inventory full'); f.Loot.tick();
  f.advance(120000); assert.equal(f.Loot.choose(), null);
  f.World.gp.inventory.push({ slot: 13, refObjId: 201, quantity: 1 }); assert.equal(f.Loot.choose().gid, d.gid);
});
test('drains nearby loot before acquiring a fresh monster', () => {
  const f = fixture(); f.Hunt.start(); f.drop();
  f.World.ents.set(30, { gid: 30, kind: 'monster', name: 'Mob', regionId: 1, x: 120, z: 100, attackFlags: 16, appearanceState: [0] });
  f.Hunt.tick(); assert.equal(f.commands.at(-1).kind, 'pickup'); assert.equal(f.Hunt.state, 'loot');
});
test('finish-fight setting has effect and attackers interrupt pickups', () => {
  const f = fixture(); f.Hunt.start(); f.drop();
  const mob = { gid: 30, kind: 'monster', name: 'Mob', regionId: 1, x: 120, z: 100, attackFlags: 16, appearanceState: [0] };
  f.World.ents.set(30, mob); f.Hunt.targetGid = 30; f.Hunt.targetSince = 100000;
  f.Hunt.tick(); assert.equal(f.commands.at(-1).kind, 'select');
  f.Settings.profile.hunt.pickup.afterKillOnly = false; f.advance(500); f.Hunt.tick(); assert.equal(f.commands.at(-1).kind, 'pickup');
  f.World.attackers.set(30, 100500); f.advance(500); f.Hunt.tick(); assert.equal(f.Loot.active, null); assert.equal(f.commands.at(-1).kind, 'select');
});
test('stop and manual control prevent further automation', () => {
  const f = fixture(); f.Hunt.start(); f.drop(); f.Hunt.tick(); f.Hunt.stop();
  assert.equal(f.Loot.active, null); assert.equal(f.commands.at(-1).kind, 'move');
  f.advance(1000); f.Hunt.start(); f.Manual.lastAt = 101000; f.Controller.tick(); assert.equal(f.Controller.mode, 'manual');
});
test('native metadata checks flat and percent MP costs', () => {
  const f = fixture(); f.World.rebuildCatalog([{ id: 5, mp: 10, mpPercent: 20 }]);
  assert.equal(f.Combat.mpOk(5, { mp: 29, maxMp: 100 }), false);
  assert.equal(f.Combat.mpOk(5, { mp: 30, maxMp: 100 }), true);
});
test('return mode owns movement; arrival can start hunting', () => {
  const f = fixture(); f.Settings.profile.hunt.center.x = 300; f.WalkBack.start(true); f.Controller.tick();
  assert.equal(f.Controller.mode, 'returning'); assert.equal(f.commands.at(-1).kind, 'move');
  f.World.gp.pose.x = 300; f.advance(1000); f.Controller.tick(); assert.equal(f.Hunt.running, true); assert.equal(f.WalkBack.active, null);
});
test('original profile import preserves wardrobe while stripping unrelated modules', () => {
  const f = fixture(); f.Settings.profileKey = 'profile:Tester';
  f.storage.set('sroAsistan:v7:profile:Tester', JSON.stringify({ macro: { castGapMs: 900 }, hunt: { radius: 500 }, wardrobe: { eq: { 6: { ref: 99 } }, large: true }, radar: { on: true } }));
  const before = f.storage.get('sroAsistan:v7:profile:Tester'); f.Settings.importOriginal();
  assert.equal(f.Settings.profile.macro.castGapMs, 900); assert.equal(f.Settings.profile.hunt.radius, 500); assert.equal(f.Settings.profile.wardrobe.eq[6].ref, 99); assert.equal(f.Settings.profile.wardrobe.large, undefined); assert.equal(f.Settings.profile.radar, undefined);
  assert.equal(f.storage.get('sroAsistan:v7:profile:Tester'), before);
});
test('restock round trip uses real lean command layer and awaits purchase settlement', () => {
  const f = fixture(), c = f.Settings.profile.potion.restock;
  const vendor = { gid: 7, refObjId: 99, name: 'Merchant', kind: 'npc', regionId: 1, x: 100, y: 0, z: 100 };
  f.World.ents.set(7, vendor); c.enabled = true; c.vendor = vendor;
  c.route = [{ regionId: 1, x: 100, y: 0, z: 100 }, { regionId: 1, x: 140, y: 0, z: 100 }]; c.hp.refObjId = 101; c.hp.target = 30; c.mp.on = false;
  f.Hunt.start(); f.Hunt.tick(); f.advance(500); f.Hunt.tick();
  f.World.gp.target = 7; f.advance(500); f.Hunt.tick(); assert.equal(f.commands.at(-1).kind, 'shop-open');
  f.World.gp.shop = { npc: 7, offers: [{ tab: 0, slot: 0, refObjId: 101, name: 'HP potion', price: '10', maxStack: 100, previews: [{ refObjId: 101, typeFlags: 2284 }] }] };
  f.World.gp.shopCompletionRevision++; f.advance(500); f.Hunt.tick(); f.advance(500); f.Hunt.tick();
  assert.equal(f.commands.at(-1).kind, 'shop-buy'); assert.equal(f.commands.at(-1).quantity, 30);
  f.World.gp.inventory = [{ slot: 13, refObjId: 101, typeFlags: 2284, quantity: 30 }]; f.advance(600); f.Hunt.tick(); assert.equal(f.commands.at(-1).kind, 'npc-close');
  f.World.gp.target = 0; f.advance(600); f.Hunt.tick(); f.Hunt.tick(); assert.equal(f.Restock.trip, null); assert.equal(f.Hunt.running, true);
});
test('revival travel preserves return intent through same-character bootstrap', () => {
  const f = fixture(); f.UI.mount = () => {}; f.UI.draw = () => {}; f.UI.update = () => {}; f.Ticker.start = () => {};
  f.boot();
  f.Settings.profileKey = 'profile:TestHero'; f.Settings.profile.hunt.onDeath = 'revive';
  f.Hunt.start(); f.Hunt.state = 'dead'; f.Hunt.revived = true;
  f.bus.emit('phase', 'entering-world'); assert.equal(f.Controller.resumeAfterRevive, true);
  f.bus.emit('character', 'TestHero'); assert.equal(f.Controller.resumeAfterRevive, true);
  f.World.gp.pose.x = 300; f.Controller.tick(); assert.equal(f.Controller.resumeAfterRevive, false); assert.ok(f.WalkBack.active);
});
test('collision routing goes around object walls through the actual gap', () => {
  const f = fixture(), wall = { x: 0, y: 0, z: 0, yaw: 0, mesh: {
    vertices: [200,0,0,200,0,300,200,0,380,200,0,1920], edges: [0,1,0,65535,3,0,2,3,0,65535,3,0] } };
  f.Navigation.capture({ kind: 'gameplay', command: { kind: 'navigation', bundle: navProduct([wall]) } });
  const target = { regionId: 1, x: 400, z: 100, y: 0 }, route = f.Navigation.plan(f.World.pose(), target);
  assert.ok(route.length > 1); assert.ok(route.some(p => p.z >= 300 && p.z <= 380));
  let previous = f.Navigation.local(f.World.pose());
  for (const p of route) { const next = f.Navigation.local(p); assert.equal(f.Navigation.clear(previous, next), true); previous = next; }
  assert.equal(route.at(-1).x, 400);
});
test('native open outlines and terrain surface edges do not create false town walls', () => {
  const f = fixture(), from = f.World.pose(), to = { ...from, x: 400 };
  const vertices = [200,0,0,200,0,1920,100,0,100];
  for (const placement of [
    { mesh: { vertices, edges: [0,1,0,65535,0,0] } },
    { terrainCells: [[0,0,1920,1920]], mesh: { vertices, edges: [0,1,0,65535,19,0] } },
    { terrainCells: [[0,0,1920,1920]], mesh: { vertices, edges: [0,1,0,1,3,1] } },
    { terrainCells: [], mesh: { vertices, edges: [0,1,0,65535,3,0] } },
  ]) {
    f.Navigation.install(navProduct([{ x: 0, z: 0, yaw: 0, ...placement }]));
    assert.ok(f.Navigation.plan(from, to).length);
    assert.equal(f.Navigation.clear(f.Navigation.local(from), f.Navigation.local(to)), true);
  }
  f.Navigation.install(navProduct([{ x: 0, z: 0, yaw: 0, terrainCells: [[0,0,1920,1920]], mesh: { vertices, edges: [0,1,0,65535,3,0] } }]));
  assert.equal(f.Navigation.plan(from, to).length, 0, 'Real blocking outlines must remain walls');
});

test('native directional borders allow the permitted side and block the opposite side', () => {
  const f = fixture(), left = f.World.pose(), right = { ...left, x: 400 };
  for (const flag of [1, 2]) {
    const mesh = { vertices: [200,0,0,200,0,1920,100,0,100], cells: [0,1,2], edges: [0,1,0,65535,flag,0] };
    f.Navigation.install(navProduct([{ x: 0, z: 0, yaw: 0, mesh }]));
    assert.equal(f.Navigation.clear(f.Navigation.local(left), f.Navigation.local(right)), flag === 1);
    assert.equal(f.Navigation.clear(f.Navigation.local(right), f.Navigation.local(left)), flag === 2);
  }
});

test('terrain barriers and fully sealed walls cannot be crossed', () => {
  const f = fixture(), blocked = new Uint8Array(9216);
  for (let z = 0; z < 96; z++) blocked[z * 96 + 10] = 1;
  f.Navigation.install(navProduct([], blocked));
  const route = f.Navigation.plan(f.World.pose(), { regionId: 1, x: 400, z: 100, y: 0 });
  assert.ok(route.every(p => p.x < 200));
  const t = { route: [], index: 0 }; f.Navigation.scene = null;
  assert.equal(f.Navigation.next(t, f.Settings.profile.hunt.center).waiting, true);
  assert.deepEqual(f.Navigation.next(t, f.Settings.profile.hunt.center, true).point, f.Settings.profile.hunt.center);
});
test('walk-back follows collision waypoints and permits detours away from the destination', () => {
  const f = fixture(); f.Settings.profile.hunt.center.x = 400;
  f.Navigation.install(navProduct([{ x:0,y:0,z:0,yaw:0,mesh:{ vertices:[200,0,0,200,0,500],edges:[0,1,0,65535,3,0] } }]));
  f.WalkBack.start(); f.Controller.tick();
  assert.ok(f.commands.at(-1).destination.z > 100);
  for (let n = 0; n < 4; n++) { f.World.gp.pose.z += 50; f.advance(7000); f.Controller.tick(); assert.ok(f.WalkBack.active); }
});
test('Thunderdragon Force level 13 appears as the highest learned imbue and is cast', () => {
  const f = fixture();
  f.World.rebuildCatalog([{ id:3392,group:334,level:1,name:'Thunderdragon force',targetRequired:false }, { id:3404,group:334,level:13,name:'Thunderdragon force',targetRequired:false,mp:0 }]);
  f.World.gp.skills = [3392,3404];
  assert.equal(f.UI.learnedSkills(true).find(s => s.group === 334).id, 3404);
  f.Settings.profile.macro.imbue = { id:3392,group:334 };
  assert.equal(f.Combat.imbue(), true); assert.equal(f.commands.at(-1).skillId, 3404);
  f.World.gp.skills = [3392]; assert.equal(f.UI.learnedSkills(true)[0].id, 3392);
});
test('wardrobe retains honor skins and validates body and equipment slot', () => {
  const f = fixture();
  f.WdData.build({items:[[10,'ITEM_CH_SWORD_09_A',6,-1,'CH_M',0,0],[11,'ITEM_CH_SWORD_09_C_RARE_HONOR',6,-1,'CH_M',1,0],[12,'ITEM_CH_SWORD_09_A',6,-1,'CH_W',0,0]],models:[[123,'CHAR_CH_MAN_TEST',0]]},[],{});
  f.Wardrobe.body = 'CH_M';
  assert.ok(f.Wardrobe.validEq(6,11)); assert.equal(f.Wardrobe.validEq(6,12), null); assert.equal(f.Wardrobe.validEq(7,11), null);
  f.LeanWardrobe.slot = 'e6'; assert.equal(f.LeanWardrobe.rows().length,2);
});
test('wardrobe appearance changes never alter real inventory or command metadata', () => {
  const f = fixture(), tf = (2 << 11) | (6 << 7) | 44;
  f.WdData.build({items:[[10,'ITEM_CH_SWORD_09_A',6,-1,'CH_M',0,0],[11,'ITEM_CH_SWORD_09_C_RARE_HONOR',6,-1,'CH_M',1,0]],models:[[123,'CHAR_CH_MAN_TEST',0]]},[],{});
  f.Wardrobe.body = 'CH_M'; f.Settings.profile.wardrobe.eq[6] = { ref:11, plus:9 };
  const real = {slot:6,refObjId:10,typeFlags:tf,plus:0};
  const ev = {kind:'gameplay',state:{...f.World.gp,inventory:[real]}}; f.World.applyEvent(ev);
  assert.equal(f.World.gp.inventory[0].refObjId,10); assert.equal(real.refObjId,10);
  assert.equal(ev.state.inventory[0].refObjId,11); assert.equal(ev.state.inventory[0].plus,9);
  f.Settings.profile.wardrobe.on = false; f.Wardrobe.applyNow(); assert.equal(ev.state.inventory[0].refObjId,10);
});
test('all compatible paid avatar skins remain browsable without ownership or equipment filters', () => {
  const f = fixture(), items = [];
  for (let n=0;n<70;n++) items.push([100+n,'ITEM_MALL_AVATAR_M_PREMIUM_'+n,-1,n%4,'CH_M',0,0]);
  items.push([999,'ITEM_MALL_AVATAR_W_PREMIUM',-1,1,'CH_W',0,0]);
  f.WdData.build({items,models:[[123,'CHAR_CH_MAN_TEST',0]]},[],{}); f.Wardrobe.body='CH_M';
  f.LeanWardrobe.slot='a*'; f.LeanWardrobe.degree=13; f.LeanWardrobe.rarity='3';
  assert.equal(f.LeanWardrobe.rows().length,70); assert.equal(f.World.gp.avatarInventory,undefined);
  f.LeanWardrobe.slot='a2'; assert.equal(f.LeanWardrobe.rows().length,17);
  f.Wardrobe.view.slot='a2'; f.Wardrobe.pick(f.LeanWardrobe.rows()[0]);
  assert.equal(f.Wardrobe.buildAv([])[0].refObjId,102); assert.equal(f.commands.length,0);
  assert.equal(f.Wardrobe.validAv(1,999),null);
});
test('elixirs-only preset uses native types, clears include overrides and excludes other drops', () => {
  const f=fixture(),p=f.Settings.profile.hunt.pickup;
  p.include='potion'; f.Loot.preset('elixirs');
  assert.equal(p.include,'');
  const elixir=f.drop(30,3436); elixir.name='Localized reinforcement item';
  assert.equal(f.Loot.allowed(elixir),true);
  for (const tf of [2284,748,3436+2048, (11<<7)|108|(2<<11),44,108]) assert.equal(f.Loot.allowed(f.drop(tf,tf)),false);
  p.others=true; p.elixirs=false; assert.equal(f.Loot.allowed(elixir),false);
  f.Loot.preset('elixirs-gold'); assert.equal(f.Loot.allowed(f.drop(40,748)),true);
  assert.equal(f.Loot.allowed(f.drop(41,2284)),false);
  f.Loot.preset('all'); assert.equal(f.Loot.allowed(f.drop(42,2284)),true);
});
test('elixir filters preserve ownership, exclusions and full-bag stack merging', () => {
  const f=fixture(),d=f.drop(30,3436); f.Loot.preset('elixirs');
  d.groundItem.ownerJid=999; assert.equal(f.Loot.allowed(d),false); delete d.groundItem.ownerJid;
  f.Settings.profile.hunt.pickup.exclude='potion'; assert.equal(f.Loot.allowed(d),false);
  f.Settings.profile.hunt.pickup.exclude=''; f.World.gp.inventorySlotCount=13; assert.equal(f.Loot.allowed(d),false);
  f.World.gp.inventory=[{slot:13,refObjId:101,quantity:2,tooltip:{fields:{maxStack:50}}}]; assert.equal(f.Loot.allowed(d),true);
});
test('new alchemy category switches inherit old Other items preferences', () => {
  const f=fixture(); f.storage.set('sroAsistan:v7:profile:default',JSON.stringify({hunt:{pickup:{others:false}}}));
  f.Settings.importOriginal();
  for(const key of ['elixirs','powders','alchemy']) assert.equal(f.Settings.profile.hunt.pickup[key],false);
});
test('changing loot filters cancels an outstanding pickup before handing back control', () => {
  const f=fixture(); f.Loot.begin(f.drop()); f.Loot.preset('elixirs'); f.advance(1000);
  assert.equal(f.Loot.tick(),false); assert.equal(f.Loot.active,null); assert.equal(f.commands.at(-1).kind,'move');
});
test('idle, manual pause and walk-back do not change pet auto-grab settings', () => {
  const f = fixture(); pickupPet(f, 135);
  f.Controller.tick();
  assert.equal(f.commands.some(c => c.kind === 'cos-behavior'), false);
  f.Hunt.start(); f.Manual.lastAt = 100000; f.Controller.tick();
  assert.equal(f.commands.some(c => c.kind === 'cos-behavior'), false);
  f.Settings.profile.hunt.center.x = 400; f.WalkBack.start(true); f.advance(1000); f.Controller.tick();
  assert.equal(f.commands.some(c => c.kind === 'cos-behavior'), false);
});

test('revival return waits for inventory settlement without losing resume intent', () => {
  const f = fixture(); f.Controller.resumeAfterRevive = true;
  f.World.gp.pose.x = 300; f.World.gp.inventoryPending = true;
  f.Controller.tick(); f.advance(500); f.Controller.tick();
  assert.equal(f.Controller.resumeAfterRevive, true);
  assert.equal(f.WalkBack.active, null); assert.equal(f.notices.length, 0);
  f.World.gp.inventoryPending = false; f.Controller.tick();
  assert.equal(f.Controller.resumeAfterRevive, false);
  assert.equal(f.WalkBack.active.resume, true);
});

test('stop cancels a revival return waiting for inventory settlement', () => {
  const f = fixture(); f.Controller.resumeAfterRevive = true; f.World.gp.inventoryPending = true;
  f.Controller.tick(); f.toggleBot(); f.World.gp.inventoryPending = false; f.Controller.tick();
  assert.equal(f.Controller.resumeAfterRevive, false); assert.equal(f.WalkBack.active, null);
});

test('restarting walk-back preserves hunting on arrival', () => {
  const f = fixture(); f.Settings.profile.hunt.center.x = 400;
  f.Hunt.start(); f.WalkBack.start(); assert.equal(f.WalkBack.active.resume, true);
  f.advance(1000); f.WalkBack.start(); assert.equal(f.WalkBack.active.resume, true);
  f.World.gp.pose.x = 400; f.WalkBack.tick(); assert.equal(f.Hunt.running, true);
});
test('pet full chime alerts once and rearms after space is freed with a cooldown', () => {
  const f = fixture(), pet = pickupPet(f); let sounds = 0;
  f.Sound.play = kind => { if (kind !== 'pet-full') return false; sounds++; return true; };
  f.Hunt.start(); pet.status = 1; pet.inventory = [{ slot: 0, refObjId: 101, quantity: 1 }];
  f.Controller.tick(); f.advance(60000); f.Controller.tick();
  assert.equal(sounds, 1); assert.equal(f.notices.filter(n => /bag is full/.test(n)).length, 1);
  pet.inventory = []; f.Controller.tick(); pet.inventory = [{ slot: 0 }]; f.Controller.tick();
  assert.equal(sounds, 2);
  pet.inventory = []; f.Controller.tick(); pet.inventory = [{ slot: 0 }]; f.Controller.tick();
  assert.equal(sounds, 2); f.advance(30000); f.Controller.tick(); assert.equal(sounds, 3);
});

test('pet full alert respects toggle, collector, stopped and missing pet states', () => {
  const f = fixture(), pet = pickupPet(f); let sounds = 0;
  f.Sound.play = kind => { if (kind !== 'pet-full') return false; sounds++; return true; }; pet.status = 1; pet.inventory = [{ slot: 0 }];
  f.Controller.tick(); assert.equal(sounds, 0); f.Hunt.start();
  f.Settings.profile.hunt.pickup.petFullSound = false; f.Controller.tick(); assert.equal(sounds, 0);
  f.Settings.profile.hunt.pickup.petFullSound = true;
  f.Settings.profile.hunt.pickup.collector = 'character'; f.Controller.tick(); assert.equal(sounds, 0);
  f.Settings.profile.hunt.pickup.collector = 'pet'; pet.dead = true; f.Controller.tick(); assert.equal(sounds, 0);
  pet.dead = false; f.Controller.tick(); assert.equal(sounds, 1);
});

test('blocked audio retries with cooldown and does not repeat full-bag notices', () => {
  const f = fixture(), pet = pickupPet(f); let attempts = 0;
  f.Sound.play = kind => kind === 'pet-full' && ++attempts >= 2; f.Hunt.start(); pet.status = 1; pet.inventory = [{ slot: 0 }];
  f.Controller.tick(); f.advance(1000); f.Controller.tick(); assert.equal(attempts, 1);
  f.advance(30000); f.Controller.tick(); assert.equal(attempts, 2);
  f.advance(60000); f.Controller.tick(); assert.equal(attempts, 2);
  assert.equal(f.notices.filter(n => /bag is full/.test(n)).length, 1);
});

test('pet chime schedules three gentle notes and leaves other bot sounds silent', () => {
  const f = fixture(); let notes = 0;
  assert.equal(f.Sound.play('pet-full'), false);
  f.Sound.ctx = { state: 'running', currentTime: 10, destination: {},
    createOscillator() { notes++; return { frequency: {}, connect() {}, start() {}, stop() {}, disconnect() {} }; },
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; } };
  assert.equal(f.Sound.play('good'), false); assert.equal(notes, 0);
  assert.equal(f.Sound.play('pet-full'), true); assert.equal(notes, 3);
});
function partyApplication(f) {
  f.Settings.profile.party.autoAcceptMatching = true;
  f.World.gp.social = { self: 10, leader: 10, options: 1, members: [{ id: 10 }] };
  f.World.gp.partyMatching = { own: { id: 5, type: 1 }, request: { a: 40, b: 50, expires: 110000, member: { name: 'Applicant' } } };
  return f.World.gp.partyMatching;
}

test('party matching is opt-in and accepts once while hunting is stopped', () => {
  const f = fixture(); assert.equal(f.Settings.profile.party.autoAcceptMatching, false);
  partyApplication(f); f.Settings.profile.party.autoAcceptMatching = false;
  f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.Settings.profile.party.autoAcceptMatching = true; f.Controller.tick();
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands[0])), { kind: 'party-match-answer', a: 40, b: 50, answer: 1 });
  f.advance(1000); f.Controller.tick(); assert.equal(f.commands.length, 1); assert.equal(f.Hunt.running, false);
});

test('party matching permits first applicant but never approves for another leader or listing', () => {
  const f = fixture(), m = partyApplication(f);
  f.World.gp.social.leader = 99; f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.World.gp.social.leader = 10; m.own = null; f.Controller.tick(); assert.equal(f.commands.length, 0);
  m.own = { id: 5, type: 1 }; f.World.gp.social = { leader: 0, self: 0, options: 0, members: [] };
  f.Controller.tick(); assert.equal(f.commands[0].answer, 1);
});

test('party matching respects four and eight member capacity', () => {
  for (const [options, capacity] of [[0, 4], [1, 8]]) {
    const f = fixture(); partyApplication(f); f.World.gp.social.options = options;
    f.World.gp.social.members = Array.from({ length: capacity }, (_, id) => ({ id }));
    f.Controller.tick(); assert.equal(f.commands.length, 0);
    f.World.gp.social.members.pop(); f.Controller.tick(); assert.equal(f.commands.length, 1);
  }
});

test('shared EXP accepts successive applicants past four through eight without toggling', () => {
  for (const options of [1, 3, 5, 7]) for (const autoRecruit of [false, true]) {
    const f = fixture(); partyApplication(f);
    Object.assign(f.Settings.profile.party, { autoRecruit, autoAcceptMatching: !autoRecruit });
    let members = [{ id: 10 }];
    const own = { id: 5, type: options };
    for (let size = 1; size <= 8; size++) {
      const request = { a: 40, b: 50 + size, expires: f.World.simNow() + 10000, member: { name: 'Applicant' + size } };
      // Fresh native-style snapshots, including consecutive requests where the
      // bot never observes the intervening request:null acknowledgement.
      f.World.applyGameplay({ ...f.World.gp,
        social: { self: 10, leader: 10, options, members },
        partyMatching: { own, pending: null, request } });
      f.Controller.tick(); f.Controller.tick();
      assert.equal(f.commands.length, Math.min(size, 7), `options=${options}, recruit=${autoRecruit}, members=${size}`);
      if (size < 8) {
        assert.equal(f.commands.at(-1).b, request.b);
        members = [...members, { id: 100 + size }];
      }
      f.advance(500);
    }
    assert.equal(f.commands.every(c => c.kind === 'party-match-answer' && c.answer === 1), true);
  }
});

test('shared EXP resumes accepting after a full party loses a member', () => {
  const f = fixture(); partyApplication(f);
  f.Settings.profile.party.autoAcceptMatching = false; f.Settings.profile.party.autoRecruit = true;
  const social = { self: 10, leader: 10, options: 3, members: Array.from({ length: 8 }, (_, n) => ({ id: 10 + n })) };
  const matching = { ...f.World.gp.partyMatching, own: { id: 5, type: 3 }, pending: null };
  f.World.applyGameplay({ ...f.World.gp, social, partyMatching: matching });
  f.Controller.tick(); assert.equal(f.commands.length, 0);
  assert.match(f.Party.message, /Party full/);
  f.advance(500);
  f.World.applyGameplay({ ...f.World.gp, social: { ...social, members: social.members.slice(0, 7) },
    partyMatching: { ...matching, request: { ...matching.request, b: 99, expires: f.World.simNow() + 10000 } } });
  f.Controller.tick(); assert.equal(f.commands.length, 1); assert.equal(f.commands[0].b, 99);
  assert.match(f.Party.message, /accepting applicants/);
});

test('native party sharing controls capacity even when saved recruitment settings differ', () => {
  for (const options of [0, 1]) {
    const f = fixture(); partyApplication(f);
    Object.assign(f.Settings.profile.party, { autoRecruit: true, expShare: !options });
    f.World.gp.social.options = options;
    f.World.gp.social.members = Array.from({ length: 5 }, (_, n) => ({ id: 10 + n }));
    f.Controller.tick(); assert.equal(f.commands.length, options ? 1 : 0);
  }
});

test('party matching leaves invitations and expired or unclocked requests alone', () => {
  const f = fixture(), m = partyApplication(f), request = m.request;
  m.request = null; f.World.gp.social.invitation = { type: 2, gid: 99 };
  f.Controller.tick(); assert.equal(f.commands.length, 0);
  m.request = request; f.World.simOffset = null; f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.World.simOffset = 0; request.expires = 100000; f.Controller.tick(); assert.equal(f.commands.length, 0);
  request.expires = 110000; f.World.phase = 'login'; f.Controller.tick(); assert.equal(f.commands.length, 0);
});

test('party matching retries failed dispatch and correlates replacement requests', () => {
  const f = fixture(), m = partyApplication(f), raw = f.Cmd.raw;
  f.Cmd.raw = () => false; f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.Cmd.raw = raw; f.Controller.tick(); assert.equal(f.commands.length, 1);
  m.request = { ...m.request, b: 51 }; f.advance(300); f.Controller.tick();
  assert.equal(f.commands.length, 2); assert.equal(f.commands[1].b, 51);
  m.request = { ...m.request, b: 52 }; f.Settings.profile.party.autoAcceptMatching = false;
  f.advance(300); f.Controller.tick(); assert.equal(f.commands.length, 2);
});

test('gameplay mirror exposes party matching requests and clears answered requests', () => {
  const f = fixture(), m = partyApplication(f);
  f.World.applyGameplay({ ...f.World.gp, partyMatching: m }); f.Controller.tick(); assert.equal(f.commands.length, 1);
  f.World.applyGameplay({ ...f.World.gp, partyMatching: { ...m, request: null } });
  f.advance(300); f.Controller.tick(); assert.equal(f.commands.length, 1);
});
function recruiting(f) {
  f.Settings.profile.party.autoRecruit = true;
  f.World.gp.progression.level = 30;
  f.World.gp.social = { self: 0, leader: 0, options: 0, members: [] };
  f.World.gp.partyMatching = { own: null, request: null, pending: null };
  return f.World.gp.partyMatching;
}
test('auto-recruit registers saved settings while hunting is stopped', () => {
  const f = fixture(); assert.equal(f.Settings.profile.party.autoRecruit, false); recruiting(f);
  Object.assign(f.Settings.profile.party, { title: 'My party', min: 20, max: 40, itemShare: false });
  f.Controller.tick(); assert.equal(f.Hunt.running, false);
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands[0])), { kind: 'party-match-register', registration: { party: 0, type: 1, purpose: 0, min: 20, max: 40, title: 'My party' } });
});
test('auto-recruit preserves existing listings and existing party sharing options', () => {
  const f = fixture(), m = recruiting(f); m.own = { id: 5, type: 0 };
  f.Controller.tick(); assert.equal(f.commands.length, 0);
  m.own = null; f.World.gp.social = { self: 10, leader: 10, options: 6, members: [{ id: 10 }] };
  f.Controller.tick(); assert.equal(f.commands[0].registration.type, 6);
});
test('auto-recruit waits for confirmation without duplicate or blind repeat registrations', () => {
  const f = fixture(), m = recruiting(f); f.Controller.tick();
  f.advance(1000); m.pending = 'register'; f.Controller.tick();
  f.advance(60000); m.pending = null; m.result = 9; f.Controller.tick();
  assert.equal(f.commands.length, 1);
});
test('auto-recruit recovers a refused registration from fresh idle state without toggling', () => {
  const f = fixture(); recruiting(f); f.Controller.tick();
  f.World.applyGameplay({ ...f.World.gp, partyMatching: { ...f.World.gp.partyMatching, pending: 'register' } });
  f.advance(1000); f.Controller.tick(); assert.equal(f.commands.length, 1);
  f.World.applyGameplay({ ...f.World.gp, partyMatching: { ...f.World.gp.partyMatching, pending: null, result: 9 } });
  f.advance(28900); f.Controller.tick(); assert.equal(f.commands.length, 1);
  f.advance(100); f.Controller.tick(); assert.equal(f.commands.length, 2);
  assert.equal(f.Settings.profile.party.autoRecruit, true); assert.equal(f.Hunt.running, false);
  f.Controller.tick(); assert.equal(f.commands.length, 2);
  f.World.applyGameplay({ ...f.World.gp, partyMatching: { ...f.World.gp.partyMatching, own: { id: 5, type: 1 }, pending: null } });
  f.advance(60000); f.Controller.tick(); assert.equal(f.commands.length, 2);
  assert.equal(f.Party.registration, null);
});
test('auto-recruit retry waits for fresh explicitly idle matching state and preserves pending requests', () => {
  const f = fixture(); recruiting(f); f.Controller.tick(); f.advance(60000);
  f.Controller.tick(); assert.equal(f.commands.length, 1);
  for (const change of [{ pending: 'register' }, { pending: 'page' }, { pending: undefined }, { own: undefined, pending: null },
      { pending: null, request: { a: 1, b: 2 } }, { pending: null, joining: { name: 'Other' } }]) {
    f.World.applyGameplay({ ...f.World.gp, partyMatching: { own: null, pending: null, request: null, ...change } });
    f.Controller.tick(); assert.equal(f.commands.length, 1);
  }
  f.World.applyGameplay({ ...f.World.gp, partyMatching: { own: null, pending: null, request: null } });
  f.Controller.tick(); assert.equal(f.commands.length, 2);
});
test('auto-recruit keeps retrying at thirty-second intervals while enabled and stops when disabled', () => {
  const f = fixture(); recruiting(f); f.Controller.tick();
  for (let attempt = 2; attempt <= 4; attempt++) {
    f.World.applyGameplay({ ...f.World.gp, partyMatching: { own: null, pending: null, request: null, result: 9 } });
    f.advance(30000); f.Controller.tick(); assert.equal(f.commands.length, attempt);
    for (let tick = 0; tick < 10; tick++) f.Controller.tick();
    assert.equal(f.commands.length, attempt);
  }
  f.Settings.profile.party.autoRecruit = false;
  f.World.applyGameplay({ ...f.World.gp, partyMatching: { own: null, pending: null, request: null } });
  f.advance(60000); f.Controller.tick(); assert.equal(f.commands.length, 4);
});
test('auto-recruit revalidates leadership, capacity and settings before retrying registration', () => {
  const f = fixture(); recruiting(f); f.Controller.tick(); f.advance(30000);
  f.World.applyGameplay({ ...f.World.gp, partyMatching: { own: null, pending: null, request: null } });
  f.World.gp.social = { self: 10, leader: 20, options: 1, members: [{ id: 10 }] };
  f.Controller.tick(); assert.equal(f.commands.length, 1);
  f.World.gp.social.leader = 10; f.World.gp.social.members = Array(8).fill({ id: 10 });
  f.Controller.tick(); assert.equal(f.commands.length, 1);
  f.World.gp.social.members.pop(); f.Settings.profile.party.title = '';
  f.Controller.tick(); assert.equal(f.commands.length, 1);
  f.Settings.profile.party.title = 'Recovered party'; f.Controller.tick();
  assert.equal(f.commands.length, 2); assert.equal(f.commands[1].registration.title, 'Recovered party');
});
test('auto-recruit restores a confirmed listing after it disappears and space opens', () => {
  const f = fixture(), m = recruiting(f); f.Controller.tick();
  m.own = { id: 5, type: 1 }; f.Controller.tick();
  f.World.gp.social = { self: 10, leader: 10, options: 1, members: Array(8).fill({ id: 10 }) };
  m.own = null; f.advance(31000); f.Controller.tick(); assert.equal(f.commands.length, 1);
  f.World.gp.social.members.pop(); f.Controller.tick(); assert.equal(f.commands.length, 2);
});
test('auto-recruit accepts matching applicants without requiring the separate accept switch', () => {
  const f = fixture(), m = recruiting(f); m.own = { id: 5, type: 1 };
  m.request = { a: 40, b: 50, expires: 110000, member: { name: 'Applicant' } };
  f.Controller.tick(); assert.equal(f.commands[0].kind, 'party-match-answer');
  f.Settings.profile.party.autoRecruit = false; m.request.b++; f.advance(500); f.Controller.tick(); assert.equal(f.commands.length, 1);
});
test('auto-recruit skips non-leaders, low level, pending matching and invalid listing settings', () => {
  const f = fixture(), m = recruiting(f);
  f.World.gp.social = { self: 10, leader: 20, options: 1, members: [{ id: 10 }] }; f.Controller.tick();
  f.World.gp.social = { self: 0, leader: 0, options: 0, members: [] };
  f.World.gp.progression.level = 4; f.Controller.tick(); f.World.gp.progression.level = 30;
  m.pending = 'join'; f.Controller.tick(); m.pending = null;
  f.Settings.profile.party.title = ''; f.Controller.tick(); f.Settings.profile.party.title = 'Test';
  f.Settings.profile.party.min = 60; f.Settings.profile.party.max = 30; f.Controller.tick();
  assert.equal(f.commands.length, 0);
});
test('auto-recruit validates listing purpose against job suit', () => {
  const f = fixture(); recruiting(f); f.Settings.profile.party.purpose = 2;
  f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.World.gp.inventory = [{ slot: 8, typeFlags: (1 << 11) | 0x3ac }];
  f.Controller.tick(); assert.equal(f.commands[0].registration.purpose, 2);
});
function resurrection(f) {
  f.Settings.profile.party.autoRes = true;
  f.World.gp.social = { localName: 'Me', self: 10, leader: 10, options: 1, members: [{ id: 10, name: 'Me' }, { id: 11, name: 'Mate', status: 0 }] };
  f.World.gp.skills = [10067];
  f.World.rebuildCatalog([{ id: 10067, group: 638, level: 1, name: 'Rebirth', targetRequired: true, targets: 178, masteries: [{ ID: 518, Level: 10 }] }]);
  f.World.ents.set(50, { gid: 50, kind: 'player', name: 'Mate', regionId: 1, x: 110, y: 0, z: 100, appearanceState: [2, 0, 0] });
  return f.World.gp.social.members[1];
}
function resurrectionTravel() {
  const f = fixture(); resurrection(f); f.Hunt.start();
  Object.assign(f.World.skill(10067), { range: 100, actionMs: 1000 });
  f.World.ents.get(50).x = 350; return f;
}
test('res travel defaults to 30m, approaches, casts and returns before resuming hunting', () => {
  const f = resurrectionTravel(); assert.equal(f.Settings.profile.party.resRadius, 300);
  f.Controller.tick(); assert.equal(f.Resurrect.trip.phase, 'approach'); assert.equal(f.commands.at(-1).kind, 'move');
  f.advance(1000); f.World.gp.pose.x = 270; f.Controller.tick(); assert.equal(f.commands.at(-1).kind, 'skill');
  assert.equal(f.Resurrect.trip.phase, 'cast'); assert.equal(f.Hunt.running, true);
  f.advance(2000); f.Controller.tick(); assert.equal(f.Resurrect.trip.phase, 'return');
  assert.equal(f.commands.at(-1).destination.x, 100);
  f.World.gp.pose.x = 100; f.advance(1000); f.Controller.tick(); assert.equal(f.Resurrect.trip, null); assert.equal(f.Hunt.running, true);
});
test('res radius is anchored to hunt spot and never selects outside it', () => {
  const f = resurrectionTravel(); f.Settings.profile.party.resRadius = 200;
  f.World.gp.pose.x = 340; f.Controller.tick(); assert.equal(f.Resurrect.trip, null);
  assert.equal(f.commands.some(c => c.kind === 'skill' || c.kind === 'select'), false);
  f.World.ents.get(50).x = 250; f.advance(1000); f.Controller.tick(); assert.equal(f.commands.at(-1).kind, 'skill');
});
test('res travel uses collision detours and skips blocked bodies with backoff', () => {
  const f = resurrectionTravel(); f.Navigation.plan = () => [];
  f.Controller.tick(); assert.equal(f.Resurrect.trip.phase, 'return');
  f.advance(500); f.Controller.tick(); assert.equal(f.Resurrect.trip, null);
  assert.equal(f.commands.some(c => c.kind === 'skill'), false); assert.ok(f.Resurrect.sent[11] > 100000);
  const g = resurrectionTravel();
  g.Navigation.install(navProduct([{x:0,y:0,z:0,yaw:0,mesh:{vertices:[200,0,0,200,0,200],edges:[0,1,0,65535,3,0]}}]));
  g.Controller.tick(); assert.equal(g.commands.at(-1).kind, 'move'); assert.ok(g.commands.at(-1).destination.z > 100);
});
test('res travel cancels on manual control, stop hotkey and explicit walk-back', () => {
  const f = resurrectionTravel(); f.Controller.tick(); f.Manual.lastAt = 100000;
  f.advance(500); f.Controller.tick(); assert.equal(f.Resurrect.trip, null);
  const g = resurrectionTravel(); g.Hunt.stop(); g.advance(1000); g.Controller.tick(); assert.ok(g.Resurrect.trip);
  g.toggleBot(); assert.equal(g.Resurrect.trip, null); assert.equal(g.Hunt.running, false);
  const h = resurrectionTravel(); h.Controller.tick(); h.advance(1000); h.WalkBack.start(); assert.equal(h.Resurrect.trip, null);
});
test('res travel returns if member revives and does not stall on missing collision coverage', () => {
  const f = resurrectionTravel(); f.Controller.tick(); f.World.gp.pose.x = 180;
  f.World.gp.social.members[1].status = 10; f.World.ents.get(50).appearanceState = [0];
  f.advance(1000); f.Controller.tick(); assert.equal(f.Resurrect.trip.phase, 'return'); assert.equal(f.commands.some(c => c.kind === 'skill'), false);
  const g = resurrectionTravel(); g.Navigation.scene = null; g.Controller.tick(); assert.ok(g.Resurrect.trip);
  g.advance(13000); g.Controller.tick(); assert.equal(g.Resurrect.trip, null);
});
function beginnerScroll(f) {
  f.Settings.profile.potion.speedScroll = true;
  f.World.gp.inventory.push({ slot: 15, refObjId: 24198, typeFlags: 3820, quantity: 2 });
  f.Hunt.start();
}
test('beginner speed scroll is opt-in, uses its exact item and waits for buff confirmation', () => {
  const f = fixture(); assert.equal(f.Settings.profile.potion.speedScroll, false); beginnerScroll(f);
  f.Controller.tick(); assert.equal(f.commands.at(-1).kind, 'item-use'); assert.equal(f.commands.at(-1).slot, 15);
  assert.equal(f.Controller.mode, 'speed scroll'); f.advance(1000); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1);
  f.World.gp.buffSlots = [{ state:'active', effect:{gid:1,skill:31107,remainingMs:3600000,receivedAtMs:101000} }];
  f.Controller.tick(); assert.equal(f.SpeedScroll.pending, null); assert.equal(f.SpeedScroll.attempts, 0);
  f.World.gp.buffSlots = []; f.advance(1000); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 2);
});
test('speed scroll does not overwrite an existing speed buff or consume paid items', () => {
  const f = fixture(); beginnerScroll(f);
  f.World.gp.attachedEffects = [{gid:1,skill:5411}]; f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.World.gp.attachedEffects = []; f.World.gp.inventory[0].refObjId = 12345; f.advance(1000); f.Controller.tick();
  assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
  f.World.gp.inventory[0].refObjId = 24198; f.World.rebuildCatalog([{id:123,group:123,speedBuff:{active:true}}]);
  f.World.gp.attachedEffects = [{gid:1,skill:123}]; f.Controller.tick(); assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
});
test('speed scroll activates during continuous combat casts after inventory settles', () => {
  const f = fixture(); beginnerScroll(f);
  f.World.gp.casts = [{ caster: 1, receivedAtMs: 100000, results: [] }];
  f.World.gp.inventoryPending = true;
  f.Controller.tick(); assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
  f.World.gp.inventoryPending = false;
  f.advance(100); f.Controller.tick();
  assert.equal(f.World.isCasting(), true);
  assert.equal(f.commands.filter(c => c.kind === 'item-use' && c.slot === 15).length, 1);
  assert.equal(f.Controller.mode, 'speed scroll');
  f.advance(500); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1);
  f.World.gp.buffSlots = [{ state: 'active', effect: { gid: 1, skill: 31107, remainingMs: 3600000, receivedAtMs: 100600 } }];
  f.Controller.tick(); assert.equal(f.SpeedScroll.pending, null); assert.equal(f.SpeedScroll.attempts, 0);
});
test('emergency potions precede speed scroll without waiting for combat to end', () => {
  const f = fixture(); beginnerScroll(f);
  f.World.gp.casts = [{ caster: 1, receivedAtMs: 100000, results: [] }];
  f.World.gp.inventory.push({ slot: 16, refObjId: 8, typeFlags: 2284, quantity: 50 });
  f.World.gp.vitals = [{ gid: 1, hp: 20, mp: 100, maxHp: 100, maxMp: 100 }];
  f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1);
  assert.equal(f.commands.find(c => c.kind === 'item-use').slot, 16);
  f.advance(300); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'item-use' && c.slot === 15).length, 1);
  assert.equal(f.World.isCasting(), true);
});
test('speed scroll respects idle, manual, busy inventory, return travel and shop gates', () => {
  for (const change of [f=>f.Hunt.stop(),f=>f.Manual.lastAt=100000,f=>f.World.gp.inventoryPending=true,
    f=>f.World.gp.returnScroll={},f=>f.Restock.activeShop=()=>({})]) {
    const f = fixture(); beginnerScroll(f); change(f); f.commands.length=0; f.Controller.tick();
    assert.equal(f.commands.some(c=>c.kind==='item-use'),false);
  }
});
test('speed scroll explains inventory and potion waits and resumes automatically', () => {
  const f = fixture(); beginnerScroll(f); f.World.gp.inventoryPending = true;
  f.Controller.tick(); assert.match(f.SpeedScroll.message, /inventory transaction/);
  f.World.gp.inventoryPending = false; f.Cmd.last['item-use'] = 100000;
  f.Controller.tick(); assert.match(f.SpeedScroll.message, /potions have priority/);
  assert.equal(f.SpeedScroll.attempts, 0);
  f.advance(300); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'item-use' && c.slot === 15).length, 1);
});
test('unconfirmed speed activation has bounded backoff even for unlimited starter stacks', () => {
  const f=fixture(); beginnerScroll(f); f.Controller.tick();
  for(let i=0;i<4;i++) { f.advance(9000); f.Controller.tick(); f.advance(90000); f.Controller.tick(); }
  assert.equal(f.commands.filter(c=>c.kind==='item-use').length,3); assert.match(f.SpeedScroll.message,/3 attempts/);
});
test('speed scroll works during return travel and cannot interrupt a resurrection hold', () => {
  const f=fixture(); beginnerScroll(f); f.Hunt.stop(); f.Settings.profile.hunt.center.x=400;
  f.advance(1000); f.WalkBack.start(); f.Controller.tick(); assert.equal(f.commands.at(-1).kind,'item-use');
  const g=fixture(); beginnerScroll(g); g.Resurrect.holdUntil=110000;
  assert.equal(g.SpeedScroll.tick(),false); assert.equal(g.commands.filter(c=>c.kind==='item-use').length,0);
});
test('res travel returns when radius shrinks and stops hunting if return cannot progress', () => {
  const f=resurrectionTravel(); f.Controller.tick(); f.World.gp.pose.x=270;
  f.Settings.profile.party.resRadius=200; f.advance(1000); f.Controller.tick();
  assert.equal(f.Resurrect.trip.phase,'return'); assert.equal(f.commands.some(c=>c.kind==='skill'),false);
  f.advance(31000); f.Controller.tick(); assert.equal(f.Resurrect.trip,null); assert.equal(f.Hunt.running,false);
});
test('resurrection takes priority over hunting until its cast finishes, then hunting resumes', () => {
  const f = fixture(); resurrection(f); f.Hunt.start(); let hunts = 0;
  f.Hunt.tick = () => { hunts++; };
  f.Controller.tick(); assert.equal(f.commands.at(-1).kind, 'skill');
  assert.equal(hunts, 0); assert.equal(f.Controller.mode, 'resurrect'); assert.equal(f.Hunt.running, true);
  f.advance(1000); f.Controller.tick(); assert.equal(hunts, 0);
  f.advance(6000); f.Controller.tick(); assert.equal(hunts, 1);
});
test('auto-res still works under attack and returns to the existing hunting target', () => {
  const f = fixture(); resurrection(f); f.Hunt.start();
  f.World.ents.set(30, { gid: 30, kind: 'monster', name: 'Mob', regionId: 1, x: 120, z: 100, attackFlags: 16, appearanceState: [0] });
  f.World.attackers.set(30, 100000); f.Hunt.targetGid = 30; f.Hunt.targetSince = 100000; f.World.gp.target = 30;
  f.Controller.tick(); assert.equal(f.commands.at(-1).skillId, 10067); assert.equal(f.Hunt.targetGid, 30);
  f.World.gp.target = 50; f.advance(7000); f.Controller.tick();
  assert.equal(f.commands.at(-1).kind, 'select'); assert.equal(f.commands.at(-1).gid, 30);
});
test('auto-res does not interrupt another cast, empty MP or an inventory transaction', () => {
  for (const change of [f => f.World.isCasting = () => true, f => f.World.gp.inventoryPending = true,
    f => f.World.skill(10067).mp = 101]) {
    const f = fixture(); resurrection(f); change(f); f.Controller.tick(); assert.equal(f.commands.length, 0);
  }
});
test('auto-res yields to shopping and return travel even though it works while idle', () => {
  for (const change of [f => f.Restock.activeShop = () => ({}), f => { f.Restock.recording = true; f.Restock.draft = { route: [{ ...f.World.pose() }] }; },
    f => { f.Settings.profile.hunt.center.x = 400; f.WalkBack.start(); }]) {
    const f = fixture(); resurrection(f); change(f); f.commands.length = 0; f.Controller.tick();
    assert.notEqual(f.Controller.mode, 'error');
    assert.equal(f.commands.some(c => c.kind === 'skill' || c.kind === 'select'), false);
  }
});
test('auto-res holds an observed cast beyond its estimate and walks before an out-of-range cast', () => {
  const f = fixture(); resurrection(f); f.Controller.tick(); f.advance(7000);
  f.World.isCasting = () => true; f.Controller.tick(); assert.equal(f.Controller.mode, 'resurrect');
  const g = fixture(); resurrection(g); g.World.skill(10067).range = 5;
  g.Controller.tick(); assert.equal(g.commands.at(-1).kind, 'move'); assert.equal(g.commands.some(c => c.kind === 'skill'), false);
});
test('auto-resurrect is opt-in and selects the corpse before offering the rebirth', () => {
  const f = fixture(); resurrection(f);
  f.Settings.profile.party.autoRes = false; f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.Settings.profile.party.autoRes = true; f.Controller.tick();
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands)), [
    { kind: 'select', gid: 50 },
    { kind: 'skill', skillId: 10067, gid: 50 },
  ]);
  assert.ok(f.notices.some(n => /Resurrection offered: Mate/.test(n)));
  assert.equal(f.Hunt.running, false);
});
test('auto-resurrect offers once per answer window and rearms after the member revives', () => {
  const f = fixture(), mate = resurrection(f);
  f.Controller.tick(); assert.equal(f.commands.length, 2);
  f.advance(2000); f.Controller.tick(); assert.equal(f.commands.length, 2);
  f.advance(30000); f.Controller.tick(); assert.equal(f.commands.length, 4);
  mate.status = 10; f.advance(7000); f.Controller.tick(); assert.equal(f.commands.length, 4);
  mate.status = 0; f.advance(800); f.Controller.tick(); assert.equal(f.commands.length, 6);
});
test('auto-resurrect needs a fallen party member whose corpse is in view', () => {
  const f = fixture(), mate = resurrection(f);
  f.World.ents.delete(50); f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.World.ents.set(50, { gid: 50, kind: 'player', name: 'Mate', regionId: 1, x: 110, y: 0, z: 100, appearanceState: [0] });
  f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.World.ents.get(50).appearanceState = [2]; f.advance(800); f.Controller.tick();
  assert.equal(f.commands.length, 2);
  mate.status = 10; f.advance(7000); f.Controller.tick(); mate.status = 0;
  f.World.ents.get(50).name = 'Stranger'; f.advance(800); f.Controller.tick(); assert.equal(f.commands.length, 2);
  f.World.ents.get(50).name = 'Mate'; f.advance(800); f.Controller.tick(); assert.equal(f.commands.length, 4);
});
test('auto-resurrect idles without a learned corpse-targeted skill', () => {
  const f = fixture(); resurrection(f);
  f.World.gp.skills = []; f.Controller.tick(); assert.equal(f.commands.length, 0);
  assert.match(f.Resurrect.message, /No learned/);
  f.World.gp.skills = [10256];
  f.World.rebuildCatalog([{ id: 10256, group: 658, level: 1, name: 'Group Rebirth', targetRequired: false, targets: 0, masteries: [] }]);
  f.Controller.tick(); assert.equal(f.commands.length, 0);
});
test('auto-resurrect prefers the highest-tier corpse-targeted row', () => {
  const f = fixture(); resurrection(f);
  f.World.gp.skills = [10067, 10072];
  f.World.rebuildCatalog([
    { id: 10067, group: 638, level: 1, name: 'Rebirth A', targetRequired: true, targets: 178, masteries: [{ ID: 518, Level: 10 }] },
    { id: 10072, group: 639, level: 1, name: 'Rebirth B', targetRequired: true, targets: 178, masteries: [{ ID: 518, Level: 60 }] },
  ]);
  f.Controller.tick(); assert.equal(f.commands.at(-1).skillId, 10072);
});
test('corpse-targeted rows may press on a corpse; ordinary rows still refuse one', () => {
  const f = fixture(); resurrection(f);
  assert.equal(f.Cmd.skill(10067, 50), true);
  f.advance(300);
  f.World.rebuildCatalog([{ id: 10067, group: 638, level: 1, name: 'Rebirth', targetRequired: true, targets: 6, masteries: [] }]);
  assert.equal(f.Cmd.skill(10067, 50), false);
});
test('auto-resurrect waits for a pending target selection', () => {
  const f = fixture(); resurrection(f);
  f.World.gp.targetPending = 30; f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.World.gp.targetPending = 0; f.advance(300); f.Controller.tick(); assert.equal(f.commands.length, 2);
});
test('auto-resurrect yields to fresh manual control', () => {
  const f = fixture(); resurrection(f);
  f.Manual.lastAt = 99000; f.Controller.tick(); assert.equal(f.commands.length, 0);
  f.advance(7000); f.Controller.tick(); assert.equal(f.commands.length, 2);
});
function petFight(f) {
  const pet = pickupPet(f); f.Hunt.start();
  f.World.ents.set(30, { gid: 30, kind: 'monster', name: 'Mob', regionId: 1, x: 120, z: 100, attackFlags: 16, appearanceState: [0] });
  f.Hunt.targetGid = 30; f.Hunt.targetSince = 100000; f.World.gp.target = 30;
  f.World.attackers.set(30, 100000);
  return pet;
}
test('pet picks up during combat and casting even with finish-fight enabled', () => {
  const f = fixture(); petFight(f); f.drop(20, 3436); let fights = 0;
  f.Combat.fight = () => { fights++; }; f.World.isCasting = () => true;
  assert.equal(f.Settings.profile.hunt.pickup.afterKillOnly, true);
  f.Hunt.tick(); assert.equal(f.commands.filter(c => c.kind === 'cos-pickup').length, 1);
  assert.equal(fights, 1); assert.equal(f.Hunt.state, 'fight'); assert.ok(f.Loot.active);
  f.advance(500); f.Hunt.tick(); assert.equal(fights, 2); assert.ok(f.Loot.active);
  assert.equal(f.commands.some(c => c.kind === 'pickup' || c.kind === 'move'), false);
});
test('pet pickup confirmation and retries do not pause combat or move the player', () => {
  const f = fixture(), pet = petFight(f); f.drop(20, 3436); let fights = 0;
  f.Combat.fight = () => { fights++; }; f.Hunt.tick();
  f.advance(9000); f.Hunt.tick(); f.advance(800); f.Hunt.tick();
  assert.equal(f.commands.filter(c => c.kind === 'cos-pickup').length, 2); assert.equal(fights, 3);
  pet.inventory.push({ slot: 0, refObjId: 101, quantity: 1 }); f.Hunt.tick();
  assert.equal(f.Stats.values.loot, 1); assert.equal(fights, 4);
  assert.equal(f.commands.some(c => c.kind === 'move'), false);
});
test('pet waits for inventory and potion priority without holding up combat', () => {
  const f = fixture(); petFight(f); f.drop(20, 3436); let fights = 0;
  f.Combat.fight = () => { fights++; }; f.World.gp.inventoryPending = true;
  f.Hunt.tick(); assert.equal(fights, 1); assert.equal(f.Loot.active, null);
  f.World.gp.inventoryPending = false; f.Potion.lastUse = 100000;
  f.Hunt.tick(); assert.equal(fights, 2); assert.equal(f.Loot.active, null);
});
function townFixture() {
  const f = fixture(), c = f.Town.cfg(), r = f.Restock.cfg(), gp = f.World.gp;
  c.enabled = true; c.arrival = { regionId: 1, x: 100, y: 0, z: 100 }; c.keep = 'favorite';
  for (const [index, role] of ['storage', 'vendor', 'smith', 'gate'].entries()) {
    const npc = { gid: 60 + index, refObjId: 600 + index, kind: role === 'gate' ? 'teleport' : 'npc', name: role, regionId: 1, x: 130 + index * 40, y: 0, z: 100 };
    c[role] = { ...npc }; f.World.ents.set(npc.gid, npc);
  }
  r.hp.on = false; r.mp.refObjId = 15; r.mp.low = 5; r.mp.target = 50;
  gp.inventory = [
    { slot: 6, refObjId: 900, typeFlags: 44 | (6 << 7), durability: 5, variance: '0', magic: [], tooltip: { fields: { canRepair: 1, varianceIntMin1c0: 10, varianceIntMax1c4: 10 } } },
    { slot: 13, refObjId: 200, typeFlags: 0x09ec, quantity: 3 },
    { slot: 14, refObjId: 201, typeFlags: 0x19ec, quantity: 2 },
    { slot: 15, refObjId: 15, typeFlags: 4332, quantity: 1 },
  ];
  const pet = pickupPet(f);
  pet.inventory = [
    { slot: 0, refObjId: 1000, typeFlags: 3436, quantity: 2, name: 'Elixir' },
    { slot: 1, refObjId: 1001, typeFlags: 5484, quantity: 1, name: 'Powder' },
    { slot: 2, refObjId: 1002, typeFlags: 44 | (6 << 7), quantity: 1, name: 'Favorite sword' },
    { slot: 3, refObjId: 15, typeFlags: 4332, quantity: 5, name: 'MP potion' },
    { slot: 4, refObjId: 1003, typeFlags: 108, quantity: 1, name: 'Other item' },
  ];
  gp.pose.x = 700; f.Settings.profile.hunt.center.x = 700;
  f.Hunt.start();
  return { ...f, pet };
}
test('town cycle recalls, confirms pet storage and purchases, repairs, reverses and resumes', () => {
  const f = townFixture(), gp = f.World.gp, commands = f.commands;
  f.UI.mount = f.UI.draw = f.UI.update = f.Ticker.start = () => {}; f.boot();
  const stored = [], sold = [], buys = [], phases = [];
  let handled = 0;
  for (let n = 0; n < 140; n++) {
    f.Controller.tick();
    if (f.Town.trip) phases.push(f.Town.trip.phase);
    while (handled < commands.length) {
      const c = commands[handled++];
      if (c.kind === 'item-use') {
        assert.equal(c.slot, 13); gp.inventory.find(i => i.slot === 13).quantity--;
        f.bus.emit('phase', 'entering-world'); f.bus.emit('reset');
        gp.pose.x = 100; f.Navigation.install(navProduct());
      } else if (c.kind === 'move') gp.pose = { ...c.destination };
      else if (c.kind === 'select') {
        gp.target = c.gid; gp.targetCapabilities = {60:4,61:1,62:9,63:0x20000080}[c.gid];
        if (c.gid === 63) gp.npcConversation = { gid: 63, phase: 'menu' };
      } else if (c.kind === 'storage-open') gp.storage = { npc: c.gid, phase: 'open', capacity: 30, items: [] };
      else if (c.kind === 'cos-transfer') {
        const i = f.pet.inventory.find(i => i.slot === c.source);
        gp.inventory.push({ ...i, slot: c.destination }); f.pet.inventory = f.pet.inventory.filter(i => i.slot !== c.source);
      } else if (c.kind === 'storage-move') {
        const i = gp.inventory.find(i => i.slot === c.move.source);
        stored.push(i.refObjId); gp.storage.items.push({ ...i, slot: c.move.destination });
        gp.inventory = gp.inventory.filter(i => i.slot !== c.move.source);
      } else if (c.kind === 'shop-open') {
        gp.shop = { npc: c.gid, offers: [{ refObjId: 15, name: 'MP', tab: 0, slot: 0, maxStack: 100, price: '10', previews: [{ refObjId: 15, typeFlags: 4332 }] }] };
        gp.shopCompletionRevision++;
      } else if (c.kind === 'cos-shop-sell') {
        assert.equal(gp.shop.npc, 62); assert.equal(c.gid, f.pet.gid);
        const item = f.pet.inventory.find(i => i.slot === c.slot);
        assert.equal(c.quantity, item.quantity ?? 1); sold.push(item.refObjId);
        f.pet.inventory = f.pet.inventory.filter(i => i.slot !== c.slot);
      } else if (c.kind === 'shop-buy') { buys.push(c.quantity); gp.inventory.find(i => i.refObjId === 15).quantity += c.quantity; }
      else if (c.kind === 'shop-repair') gp.inventory.find(i => i.slot === 6).durability = 10;
      else if (c.kind === 'npc-close') { gp.target = 0; gp.shop = null; gp.storage = null; }
      else if (c.kind === 'npc-talk') gp.npcConversation = { gid: gp.target, phase: 'menu' };
      else if (c.kind === 'travel-gate') {
        assert.equal(c.gid, 63); assert.equal(c.type, 5); assert.equal(c.target, 2);
        f.bus.emit('phase', 'entering-world'); f.bus.emit('reset'); gp.pose.x = 700;
      }
    }
    f.advance(600);
    if (!f.Town.trip && phases.includes('reverse-wait')) break;
  }
  assert.equal(f.Town.trip, null, f.Town.message); assert.equal(f.Hunt.running, true, f.Town.message);
  assert.deepEqual(stored, [1000]); assert.deepEqual(sold, [1001, 1003]); assert.deepEqual(buys, [49]);
  assert.equal(f.pet.inventory.length, 2); assert.equal(gp.inventory.find(i => i.slot === 6).durability, 10);
  assert.equal(commands.filter(c => c.kind === 'item-use').length, 1);
  assert.equal(commands.filter(c => c.kind === 'travel-gate').length, 1);
  assert.match(f.Town.message, /complete/);
});
test('abnormal pill restocking uses only the strongest universal pill and preserves existing profiles', () => {
  const f = fixture(), r = f.Restock.cfg();
  assert.equal(r.cure.on, false); assert.equal(r.cure.target, 50);
  f.storage.set('sroAsistan:v7:profile:default', JSON.stringify({ potion: { restock: { mp: { target: 1000 } } } }));
  f.Settings.importOriginal();
  assert.equal(f.Restock.cfg().mp.target, 1000); assert.equal(f.Restock.cfg().cure.on, false);
  assert.equal(f.Restock.cfg().cure.target, 50);
  const current = f.Restock.cfg();
  Object.assign(current.cure, { on: true, low: 10, target: 100 });
  Object.assign(current.cure, { on: true, refObjId: 55, low: 10, target: 100 });
  assert.equal(f.Restock.supplies().find(s => s.kind === 'cure').refObjId, 58);
  assert.equal(f.Town.supplies().find(s => s.kind === 'cure').refObjId, 58);
  const offer = refObjId => ({ refObjId, previews: [{ refObjId, typeFlags: 12652 }] });
  assert.equal(f.Restock.offerKind(offer(58)), 'cure');
  for (const ref of [55, 56, 57, 10371]) assert.equal(f.Restock.offerKind(offer(ref)), '');
  assert.equal(f.Restock.offerKind({ ...offer(58), currency: 2 }), '');
  assert.equal(f.Restock.offerKind({ ...offer(58), contents: [{ refObjId: 58, quantity: 10 }] }), '');
});

test('town refills best abnormal pills by exact missing amount and waits for settlement', () => {
  const f = townFixture(), gp = f.World.gp;
  gp.inventory.find(i => i.refObjId === 15).quantity = 50;
  gp.inventory.push({ slot: 20, refObjId: 58, typeFlags: 12652, quantity: 40 });
  Object.assign(f.Restock.cfg().cure, { on: true, low: 10, target: 50 });
  f.Town.begin(); f.Town.enter('buy'); gp.target = 61;
  gp.shop = { npc: 61, offers: [{ refObjId: 58, tab: 0, slot: 7, maxStack: 50, price: '260', previews: [{ refObjId: 58, typeFlags: 12652 }] }] };
  f.Town.buy(); assert.deepEqual(JSON.parse(JSON.stringify(f.commands.at(-1))), { kind: 'shop-buy', tab: 0, slot: 7, quantity: 10 });
  f.advance(1000); f.Town.buy(); assert.equal(f.commands.filter(c => c.kind === 'shop-buy').length, 1);
  gp.inventory.find(i => i.refObjId === 58).quantity = 50; f.Town.buy();
  assert.equal(f.Town.trip.phase, 'close-vendor'); assert.equal(f.commands.filter(c => c.kind === 'shop-buy').length, 1);
});

test('town refuses cheaper pills and insufficient gold without a substitute purchase', () => {
  for (const cheapOnly of [true, false]) {
    const f = townFixture(), gp = f.World.gp;
    gp.inventory.find(i => i.refObjId === 15).quantity = 50;
    Object.assign(f.Restock.cfg().cure, { on: true, low: 10, target: 50 });
    f.Town.begin(); f.Town.enter('buy'); gp.target = 61;
    const ref = cheapOnly ? 57 : 58;
    gp.shop = { npc: 61, offers: [{ refObjId: ref, tab: 0, slot: 7, maxStack: 50, price: '260', previews: [{ refObjId: ref, typeFlags: 12652 }] }] };
    if (!cheapOnly) gp.progression.gold = '1';
    f.Town.buy(); assert.equal(f.commands.some(c => c.kind === 'shop-buy'), false); assert.equal(f.Town.trip, null);
    assert.match(f.Town.message, cheapOnly ? /Special Universal Pill/ : /gold/);
  }
});

test('walking restock triggers on low best pills and never repeats a partially confirmed purchase', () => {
  const f = fixture(), r = f.Restock.cfg(), gp = f.World.gp;
  r.enabled = true; r.hp.on = r.mp.on = false;
  Object.assign(r.cure, { on: true, low: 10, target: 50 });
  r.vendor = { gid: 7, refObjId: 99, name: 'Merchant', kind: 'npc', regionId: 1, x: 100, y: 0, z: 100 };
  r.route = [{ ...r.vendor }, { ...r.vendor, x: 140 }]; f.World.ents.set(7, r.vendor);
  f.Restock.tick(); assert.ok(f.Restock.trip); assert.equal(f.Restock.trip.supplies[0].refObjId, 58);
  f.Restock.trip.phase = 'buy'; gp.target = 7;
  gp.shop = { npc: 7, offers: [{ refObjId: 58, tab: 0, slot: 7, maxStack: 50, price: '260', previews: [{ refObjId: 58, typeFlags: 12652 }] }] };
  f.Restock.tick(); assert.equal(f.commands.at(-1).quantity, 50);
  gp.inventory = [{ slot: 13, refObjId: 58, typeFlags: 12652, quantity: 1 }];
  f.advance(600); f.Restock.tick(); assert.ok(f.Restock.trip.pending);
  assert.equal(f.commands.filter(c => c.kind === 'shop-buy').length, 1);
  gp.inventory[0].quantity = 50; f.Restock.tick(); assert.equal(f.Restock.trip.phase, 'return');
  assert.equal(f.commands.filter(c => c.kind === 'shop-buy').length, 1);
  assert.equal(f.commands.at(-1).kind, 'npc-close');
});

test('best pills participate in low-stock, full-bag and revival town trips with shared targets', () => {
  for (const mode of ['low', 'full', 'revival']) {
    const f = townFixture(), gp = f.World.gp; f.pet.inventory = [];
    gp.inventory.find(i => i.refObjId === 15).quantity = 50;
    Object.assign(f.Restock.cfg().cure, { on: true, low: 10, target: 100 });
    if (mode === 'full') f.World.freeBagSlots = () => 1;
    assert.equal(f.Town.reason(), mode === 'full' ? 'character bag nearly full' : 'potions running low');
    f.Town.begin(mode === 'revival');
    assert.ok(f.Town.trip); const supply = f.Town.trip.supplies.find(s => s.kind === 'cure');
    assert.equal(supply.refObjId, 58); assert.equal(supply.target, 100);
    f.Restock.cfg().cure.target = 200; assert.equal(supply.target, 100);
    assert.equal(f.Town.disposable({ refObjId: 58, typeFlags: 12652 }), false);
  }
});

test('town preflight stops before consuming scrolls when setup, scrolls or gold are missing', () => {
  for (const change of [f => f.Town.cfg().gate = null, f => f.World.gp.inventory = f.World.gp.inventory.filter(i => i.slot !== 14),
      f => f.World.gp.progression.gold = '0']) {
    const f = townFixture(); change(f); f.Town.tick();
    assert.equal(f.Hunt.running, false); assert.equal(f.Town.trip, null);
    assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
  }
});
test('town cycle is opt-in, hunting-only and overrides walking restock without recording', () => {
  const f = townFixture(); f.Restock.cfg().enabled = true;
  f.Town.cfg().enabled = false; assert.equal(f.Town.tick(), false);
  f.Town.cfg().enabled = true; f.Hunt.stop(); assert.equal(f.Town.tick(), false);
  f.Hunt.start(); f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 50;
  f.pet.inventory = []; f.Hunt.tick(); assert.equal(f.Restock.trip, null); assert.equal(f.Hunt.running, true);
  f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 5;
  f.Town.tick(); f.advance(600); f.Town.tick(); f.advance(100); f.Town.tick();
  assert.equal(f.Town.trip.phase, 'recall-wait');
});
test('pet storage protects supplies, keep names and items with missing metadata', () => {
  const f = townFixture(); f.Town.cfg().store.others = true;
  for (const item of [...f.World.items(), f.pet.inventory[2], f.pet.inventory[3], { name: 'Unknown', refObjId: 123 }]) assert.equal(f.Town.eligible(item), false);
  assert.equal(f.Town.eligible(f.pet.inventory[0]), true);
  assert.equal(f.Town.eligible({ refObjId: 24198, typeFlags: 3820 }), false);
  f.Town.cfg().store.elixirs = false; assert.equal(f.Town.eligible(f.pet.inventory[0]), true, 'Legacy category switches cannot store other items or sell elixirs');
  assert.equal(f.Town.eligible(f.pet.inventory[1]), false);
});
test('town cycle does not repeat unconfirmed pet transfers and stops on full storage', () => {
  const f = townFixture(); f.Town.begin(); f.Town.enter('store');
  f.World.gp.storage = { npc: 60, phase: 'open', capacity: 1, items: [] }; f.World.gp.target = 60;
  f.Town.store(); assert.equal(f.commands.at(-1).kind, 'cos-transfer');
  f.advance(600); f.Town.store(); assert.equal(f.commands.filter(c => c.kind === 'cos-transfer').length, 1);
  f.advance(15000); f.Town.store(); assert.equal(f.Hunt.running, false); assert.equal(f.Town.trip, null);
  const g = townFixture(); g.Town.begin(); g.Town.enter('store');
  g.World.gp.storage = { npc: 60, phase: 'open', capacity: 1, items: [{ slot: 0, refObjId: 999 }] }; g.World.gp.target = 60;
  g.Town.store(); assert.match(g.Town.message, /Storage is full/); assert.equal(g.commands.some(c => c.kind === 'cos-transfer'), false);
});
test('town cycle rejects cached shops and waits for fresh catalogue acknowledgement', () => {
  const f = townFixture(), gp = f.World.gp;
  f.Town.begin(); f.Town.enter('open-vendor'); gp.target = 61; gp.targetCapabilities = 1; gp.shop = { npc: 61, offers: [] };
  f.Town.tick(); f.advance(1000); f.Town.tick(); assert.equal(f.Town.trip.phase, 'open-vendor');
  assert.equal(f.commands.filter(c => c.kind === 'shop-open').length, 1);
  gp.shopCompletionRevision++; f.Town.tick(); assert.equal(f.Town.trip.phase, 'buy');
});
test('town cycle cancels on manual control, F8, disabled settings and unexpected travel', () => {
  for (const change of [f => { f.Manual.lastAt++; f.Town.tick(); }, f => f.toggleBot(),
      f => { f.Town.cfg().enabled = false; f.Town.tick(); }, f => f.Town.phase('reconnecting')]) {
    const f = townFixture(); f.Town.tick(); change(f);
    assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, false);
  }
});
test('town scroll wait times out while outside world and wrong arrival never starts service', () => {
  const f = townFixture(); f.Town.tick(); f.Town.phase('entering-world');
  f.World.gp.pose.x = 1000; f.Town.tick(); assert.equal(f.Town.trip.phase, 'recall-wait');
  f.World.phase = 'entering-world'; f.advance(91000); f.Controller.tick();
  assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, false); assert.match(f.Town.message, /timed out/);
});
test('town movement waits for collision coverage without timing out or blindly crossing obstacles', () => {
  const f = townFixture(); f.Town.begin(); f.Town.enter('walk-storage'); f.Navigation.scene = null;
  const moves = f.commands.filter(c => c.kind === 'move').length;
  f.Town.tick(); assert.equal(f.commands.filter(c => c.kind === 'move').length, moves);
  f.advance(960000); f.Town.tick(); assert.ok(f.Town.trip); assert.equal(f.Hunt.running, true);
  assert.equal(f.commands.filter(c => c.kind === 'move').length, moves);
  f.Navigation.install(navProduct()); f.advance(6000); f.Town.tick();
  assert.ok(f.commands.filter(c => c.kind === 'move').length > moves);
});
test('town movement retries blocked routes at intervals and remains cancellable', () => {
  const f = townFixture(); f.Town.begin(); f.Town.enter('walk-storage');
  let plans = 0;
  f.Navigation.next = () => { plans++; return { error: 'No walkable route found.' }; };
  const moves = f.commands.filter(c => c.kind === 'move').length;
  f.Town.tick();
  for (let i = 0; i < 10; i++) { f.advance(100); f.Town.tick(); }
  assert.equal(plans, 1); assert.ok(f.Town.trip); assert.match(f.Town.message, /waiting/);
  assert.equal(f.commands.filter(c => c.kind === 'move').length, moves);
  f.advance(5000); f.Town.tick(); assert.equal(plans, 2);
  f.Navigation.next = () => ({ point: f.Town.cfg().storage });
  f.advance(5000); f.Town.tick();
  assert.equal(f.commands.filter(c => c.kind === 'move').length, moves + 1);
  f.Town.trip.travel = { stale: true };
  f.advance(21000); f.Town.tick();
  assert.equal(f.Town.trip.travel, null); assert.match(f.Town.message, /blocked route/);
  assert.equal(f.commands.filter(c => c.kind === 'move').length, moves + 1);
  f.advance(5000); f.Town.tick();
  assert.equal(f.commands.filter(c => c.kind === 'move').length, moves + 2);
  f.toggleBot(); assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, false);
});

test('town can use a reachable service approach beside a blocked saved tile without crossing walls', () => {
  const f = townFixture(), blocked = new Uint8Array(9216);
  blocked[5 * 96 + 8] = 1;
  f.Navigation.install(navProduct([], blocked));
  const dest = f.Town.cfg().vendor;
  assert.equal(f.Navigation.plan(f.World.pose(), dest).length, 0);
  f.Town.begin(); f.Town.enter('walk-vendor');
  f.advance(1000);
  const from = f.Navigation.local(f.World.pose());
  f.Town.tick(); const command = f.commands.at(-1);
  assert.equal(command.kind, 'move');
  const end = f.Navigation.local(command.destination);
  assert.equal(f.Navigation.clear(from, end), true);
  assert.ok(Math.hypot(end.x - dest.x, end.z - dest.z) <= 60);
  f.World.gp.pose = { ...command.destination }; f.Town.tick();
  assert.equal(f.Town.trip.phase, 'open-vendor');
});

test('town sells only unprotected non-elixir pet loot and waits for a full sale acknowledgement', () => {
  const f = townFixture(), gp = f.World.gp;
  f.Town.begin(); f.Town.enter('sell'); gp.target = 62; gp.shop = { npc: 62 };
  for (const item of [f.pet.inventory[0], f.pet.inventory[2], f.pet.inventory[3], ...f.World.items(), { refObjId: 999 }])
    assert.equal(f.Town.sellable(item), false);
  assert.equal(f.Town.sellable(f.pet.inventory[1]), true);
  f.pet.inventory[1].quantity = 3;
  f.Town.tick(); assert.equal(f.commands.at(-1).kind, 'cos-shop-sell'); assert.equal(f.commands.at(-1).quantity, 3);
  f.pet.inventory[1].quantity = 1; f.advance(1000); f.Town.tick();
  assert.ok(f.Town.trip.pending); assert.equal(f.commands.filter(c => c.kind === 'cos-shop-sell').length, 1);
  f.advance(15000); f.Town.tick();
  assert.equal(f.Town.trip, null); assert.match(f.Town.message, /not confirmed/);
  assert.equal(f.commands.filter(c => c.kind === 'cos-shop-sell').length, 1);
  assert.equal(f.commands.some(c => c.kind === 'shop-sell'), false);
});

test('town keeps sealed equipment and unknown rarity while allowing plus and blue gear', () => {
  const f = townFixture(), normal = { refObjId: 1100, typeFlags: 44 | (6 << 7), name: 'Sword', plus: 0, magic: [], tooltip: { fields: { rarity: 0 } } };
  assert.equal(f.Town.sellable(normal), true);
  for (const item of [{ ...normal, plus: 12 }, { ...normal, magic: ['123'] }, { ...normal, plus: undefined, magic: undefined }, { ...normal, tooltip: { fields: { rarity: 1 } } }]) assert.equal(f.Town.sellable(item), true);
  for (const item of [
    ...[1, 2, 3].map(itemClass => ({ ...normal, tooltip: { fields: { rarity: 2, itemClass } } })),
    { ...normal, tooltip: undefined }, { ...normal, tooltip: { fields: {} } },
    { ...normal, codename: 'ITEM_CH_SWORD_01_A_RARE' },
  ]) {
    assert.equal(f.Town.sellable(item), false, JSON.stringify(item));
    assert.equal(f.Town.eligible(item), false);
  }
});

test('town sells ordinary pet equipment while leaving valuable equipment in the pet bag', () => {
  const f = townFixture(), gp = f.World.gp;
  const normal = { slot: 5, refObjId: 1100, typeFlags: 44 | (6 << 7), quantity: 1, plus: 12, magic: ['123'], tooltip: { fields: { rarity: 0 } } };
  const rare = { ...normal, slot: 6, refObjId: 1101, tooltip: { fields: { rarity: 2, itemClass: 3 } } };
  f.pet.status = 20; f.pet.inventory = [rare, normal];
  f.Town.begin(); f.Town.enter('sell'); gp.target = 62; gp.shop = { npc: 62 };
  f.Town.tick(); assert.equal(f.commands.at(-1).kind, 'cos-shop-sell'); assert.equal(f.commands.at(-1).slot, 5);
  f.pet.inventory = [rare]; f.advance(1000); f.Town.tick();
  assert.equal(f.Town.trip.phase, 'repair'); assert.equal(f.pet.inventory[0].refObjId, 1101);
  assert.equal(f.commands.filter(c => c.kind === 'cos-shop-sell').length, 1);
});

test('town refuses selling at the wrong merchant or after the pet is replaced', () => {
  const f = townFixture(); f.Town.begin(); f.Town.enter('sell');
  f.World.gp.target = 61; f.World.gp.shop = { npc: 61 };
  f.Town.tick(); assert.equal(f.Town.trip, null); assert.equal(f.commands.some(c => c.kind === 'cos-shop-sell'), false);
  const g = townFixture(); g.Town.begin(); g.Town.enter('sell');
  g.World.gp.target = 62; g.World.gp.shop = { npc: 62 }; g.Town.tick();
  g.Town.trip.salePetGid = 999; g.advance(1000); g.Town.tick();
  assert.equal(g.Town.trip, null); assert.match(g.Town.message, /pet changed/);
});

test('town buys X-Large HP and MP even when the saved potion selections are small', () => {
  const f = townFixture(), r = f.Restock.cfg(), gp = f.World.gp;
  r.hp.on = true; r.hp.refObjId = 101; r.hp.low = 5; r.hp.target = 30; r.mp.refObjId = 102;
  f.Restock.cfg().hp.target = 50;
  f.Town.begin(); f.Town.enter('buy'); gp.target = 61;
  gp.shop = { npc: 61, offers: [101,8,102,15].map((refObjId, slot) => ({ refObjId, slot, tab: 0, maxStack: 100, price: '10', previews: [{ refObjId, typeFlags: slot < 2 ? 2284 : 4332 }] })) };
  f.Town.buy(); assert.equal(f.commands.at(-1).slot, 1); assert.equal(f.commands.at(-1).quantity, 50);
  gp.inventory.push({ slot: 16, refObjId: 8, typeFlags: 2284, quantity: 50 });
  f.advance(1000); f.Town.buy(); assert.equal(f.commands.at(-1).slot, 3); assert.equal(f.commands.at(-1).quantity, 49);
  gp.inventory.find(i => i.refObjId === 15).quantity = 50;
  f.advance(1000); f.Town.buy(); assert.equal(f.Town.trip.phase, 'close-vendor');
  assert.equal(f.commands.filter(c => c.kind === 'shop-buy').length, 2);
  assert.equal(f.commands.some(c => c.kind === 'shop-buy' && [0,2].includes(c.slot)), false);
});

test('shared refill defaults are 100 HP and 300 MP and purchases only the missing potions', () => {
  const defaults = fixture().Town.supplies();
  assert.deepEqual(Array.from(defaults, s => s.target), [100, 300]);
  const f = townFixture(), gp = f.World.gp;
  f.Restock.cfg().hp.on = true; Object.assign(f.Restock.cfg().hp, { target: 100 }); f.Restock.cfg().mp.target = 300;
  gp.inventory.push({ slot: 16, refObjId: 8, typeFlags: 2284, quantity: 72 });
  gp.inventory.find(i => i.refObjId === 15).quantity = 275;
  f.Town.begin(); f.Town.enter('buy'); gp.target = 61;
  gp.shop = { npc: 61, offers: [8,15].map((refObjId, slot) => ({ refObjId, slot, tab: 0, maxStack: 50, price: '10', previews: [{ refObjId, typeFlags: slot ? 4332 : 2284 }] })) };
  f.Town.buy(); assert.equal(f.commands.at(-1).quantity, 28); assert.equal(f.commands.at(-1).slot, 0);
  gp.inventory.find(i => i.refObjId === 8).quantity = 100;
  f.advance(1000); f.Town.buy(); assert.equal(f.commands.at(-1).quantity, 25); assert.equal(f.commands.at(-1).slot, 1);
  gp.inventory.find(i => i.refObjId === 15).quantity = 300;
  f.advance(1000); f.Town.buy(); assert.equal(f.Town.trip.phase, 'close-vendor');
});

test('shared 1000 MP target applies to low supplies, full bags and revival trips', () => {
  for (const reason of ['low', 'full', 'pet', 'revival']) {
    const f = townFixture(), r = f.Restock.cfg(); r.mp.target = 1000; f.Town.cfg().petFull = reason === 'pet';
    if (reason === 'full') {
      f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 250;
      f.World.freeBagSlots = () => 1;
      assert.equal(f.Town.reason(), 'character bag nearly full');
    } else if (reason === 'low') assert.equal(f.Town.reason(), 'potions running low');
    else if (reason === 'pet') assert.equal(f.Town.reason(), 'pickup pet nearly full');
    f.Town.begin(reason === 'revival');
    assert.equal(f.Town.trip.supplies[0].target, 1000);
    assert.equal(f.Restock.supplies()[0].target, 1000);
    // A target is a total: top up 975 to 1000, rather than buy 1000 more.
    f.World.freeBagSlots = () => 25;
    f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 975;
    f.Town.enter('buy'); f.World.gp.target = 61;
    f.World.gp.shop = { npc: 61, offers: [{ refObjId: 15, slot: 0, tab: 0, maxStack: 50, price: '10', previews: [{ refObjId: 15, typeFlags: 4332 }] }] };
    f.Town.buy(); assert.equal(f.commands.at(-1).kind, 'shop-buy'); assert.equal(f.commands.at(-1).quantity, 25);
  }
});

test('legacy town profiles migrate active refill targets once and preserve walking-only targets', () => {
  for (const enabled of [false, true]) {
    const f = fixture();
    f.storage.set('sroAsistan:v7:profile:default', JSON.stringify({ potion: { restock: {
      hp: { target: 400 }, mp: { target: 1000 }, town: { enabled, stacks: { hp: 2, mp: 6 } }
    } } }));
    f.Settings.importOriginal();
    assert.equal(f.Restock.cfg().mp.target, enabled ? 300 : 1000);
    assert.equal(f.Restock.cfg().hp.target, enabled ? 100 : 400);
    assert.equal('stacks' in f.Town.cfg(), false);
    f.Restock.cfg().mp.target = 1000;
    f.storage.set('sroAsistan:v7:profile:default', JSON.stringify(f.Settings.profile));
    f.Settings.importOriginal(); assert.equal(f.Restock.cfg().mp.target, 1000);
  }
});

test('town rejects invalid potion counts and low-stock thresholds at the refill target', () => {
  for (const value of [0, 1.5, 10001, NaN]) {
    const f = townFixture(); f.Restock.cfg().mp.target = value;
    f.Town.begin(); assert.equal(f.Town.trip, null); assert.match(f.Town.message, /low-stock/);
  }
  const f = townFixture(); f.Restock.cfg().mp.low = 50;
  f.Town.begin(); assert.equal(f.Town.trip, null); assert.match(f.Town.message, /low-stock/);
});

test('town never substitutes small potions if X-Large is unavailable', () => {
  const f = townFixture(), gp = f.World.gp;
  f.Restock.cfg().mp.refObjId = 102; f.Town.begin(); f.Town.enter('buy'); gp.target = 61;
  gp.shop = { npc: 61, offers: [{ refObjId: 102, tab: 0, slot: 0, maxStack: 100, price: '10', previews: [{ refObjId: 102, typeFlags: 4332 }] }] };
  f.Town.buy(); assert.equal(f.Town.trip, null); assert.match(f.Town.message, /X-Large MP/);
  assert.equal(f.commands.some(c => c.kind === 'shop-buy'), false);
});

test('town purchase requires exact quantity gain and enough gold, without duplicate buys', () => {
  const f = townFixture(), gp = f.World.gp;
  f.Town.begin(); f.Town.enter('buy'); gp.target = 61;
  gp.shop = { npc: 61, offers: [{ refObjId: 15, tab: 0, slot: 0, maxStack: 100, price: '10', previews: [{ refObjId: 15, typeFlags: 4332 }] }] };
  f.Town.buy(); assert.equal(f.commands.at(-1).quantity, 49);
  gp.inventory.find(i => i.refObjId === 15).quantity++; f.advance(1000); f.Town.buy();
  assert.ok(f.Town.trip.pending); assert.equal(f.commands.filter(c => c.kind === 'shop-buy').length, 1);
  f.advance(15000); f.Town.buy(); assert.equal(f.Town.trip, null);
  const g = townFixture(); g.Town.begin(); g.Town.enter('buy'); g.World.gp.target = 61; g.World.gp.shop = gp.shop; g.World.gp.progression.gold = '1';
  g.Town.buy(); assert.equal(g.commands.some(c => c.kind === 'shop-buy'), false); assert.match(g.Town.message, /gold/);
});
test('town repairs require restored durability and reverse return requires all final checks', () => {
  const f = townFixture(), gp = f.World.gp;
  f.Town.begin(); f.Town.enter('repair'); gp.target = 62; gp.shop = { npc: 62 };
  f.Town.repair(); f.advance(1000); f.Town.repair(); assert.equal(f.Town.trip.phase, 'repair');
  assert.equal(f.commands.filter(c => c.kind === 'shop-repair').length, 1);
  f.advance(15000); f.Town.repair(); assert.equal(f.Town.trip, null);
  const g = townFixture(); g.Town.begin(); g.Town.enter('reverse'); g.World.gp.target = 63; g.World.gp.targetCapabilities = 0x20000000;
  g.Town.tick(); assert.equal(g.commands.some(c => c.kind === 'travel-gate'), false); assert.equal(g.Hunt.running, false);
});
test('town service keeps emergency potions active and prevents scroll actions in the same tick', () => {
  const f = townFixture(); f.Town.begin(); f.World.gp.inventory.push({ slot: 20, refObjId: 101, typeFlags: 2284, quantity: 5 });
  f.World.gp.vitals = [{ gid: 1, hp: 10, mp: 100, maxHp: 100, maxMp: 100 }];
  f.Controller.tick(); assert.equal(f.commands.at(-1).kind, 'item-use'); assert.equal(f.commands.at(-1).slot, 20);
  assert.equal(f.Town.trip.phase, 'recall'); assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1);
});
test('town scroll refill uses gold offers, rejects packages and requires a spare return scroll', () => {
  const f = townFixture(), gp = f.World.gp;
  gp.inventory.find(i => i.refObjId === 15).quantity = 50; gp.inventory = gp.inventory.filter(i => i.slot !== 13);
  // A missing return scroll is detected before leaving a shop, rather than returning unprepared.
  gp.inventory.push({ slot: 13, refObjId: 200, typeFlags: 0x09ec, quantity: 1 });
  f.Town.begin(); f.Town.enter('buy'); gp.inventory = gp.inventory.filter(i => i.slot !== 13); gp.target = 61;
  const offer = { refObjId: 200, tab: 0, slot: 3, maxStack: 50, price: '50', currency: 1, previews: [{ refObjId: 200, typeFlags: 0x09ec }] };
  gp.shop = { npc: 61, offers: [offer] }; f.Town.buy(); assert.equal(f.commands.at(-1).quantity, 2); assert.equal(f.commands.at(-1).slot, 3);
  gp.inventory.push({ slot: 13, refObjId: 200, typeFlags: 0x09ec, quantity: 2 }); f.advance(600); f.Town.buy(); assert.equal(f.Town.trip.phase, 'close-vendor');
  const g = townFixture(); g.Town.begin(); g.Town.enter('buy'); g.World.gp.inventory.find(i => i.refObjId === 15).quantity = 50;
  g.World.gp.inventory = g.World.gp.inventory.filter(i => i.slot !== 13); g.World.gp.target = 61;
  g.World.gp.shop = { npc: 61, offers: [{ ...offer, contents: [{ refObjId: 200, quantity: 10 }] }] };
  g.Town.buy(); assert.equal(g.commands.some(c => c.kind === 'shop-buy'), false); assert.equal(g.Hunt.running, false);
});
test('F8 requests native cancellation for an active town scroll cast', () => {
  const f = townFixture(); f.Town.tick(); f.World.gp.returnScroll = { name: 'Return', startedAtMs: 100000, durationMs: 20000 };
  f.toggleBot(); assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, false);
  assert.equal(f.commands.filter(c => c.kind === 'return-cancel').length, 1);
});
test('town setup records reachable approach points and validates the merchant catalogue', () => {
  const f = townFixture(), gp = f.World.gp;
  f.Hunt.stop(); f.UI.draw = () => {}; gp.pose.x = 100;
  gp.target = 61; gp.targetCapabilities = 1;
  const old = f.Town.cfg().vendor; f.Town.save('vendor'); assert.equal(f.Town.cfg().vendor, old);
  gp.shop = { npc: 61, offers: [{ refObjId: 103, previews: [{ refObjId: 103, typeFlags: 4332 }] }] };
  f.Town.save('vendor'); assert.equal(f.Town.cfg().vendor.x, 100); assert.equal(f.Town.cfg().vendor.npc.x, 170);
  assert.equal(f.Restock.cfg().mp.refObjId, 103); assert.equal(f.Town.npc('vendor').gid, 61);
  gp.target = 60; gp.targetCapabilities = 4; gp.pose.x = 1000;
  const warehouse = f.Town.cfg().storage; f.Town.save('storage'); assert.equal(f.Town.cfg().storage, warehouse);
});
test('unexpected world reset cancels service and independent party work continues during town travel', () => {
  const f = townFixture(); f.UI.mount = f.UI.draw = f.UI.update = f.Ticker.start = () => {}; f.boot();
  let calls = 0; f.Party.tick = () => calls++;
  const g = townFixture(); g.UI.mount = g.UI.draw = g.UI.update = g.Ticker.start = () => {}; g.boot();
  g.Town.begin(); g.Town.enter('walk-storage'); g.bus.emit('reset'); assert.equal(g.Town.trip, null); assert.equal(g.Hunt.running, false);
  f.Town.tick(); f.bus.emit('reset'); assert.ok(f.Town.trip); assert.equal(f.Hunt.running, true);
  f.Controller.tick(); assert.equal(calls, 1);
});
test('full pet latches town departure during combat and pending pickup without starting another fight', () => {
  for (const busy of ['cast', 'inventory']) {
    const f = townFixture(); f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 50;
    let fights = 0; f.Hunt.tick = () => fights++;
    let casting = busy === 'cast'; f.World.isCasting = () => casting;
    f.World.gp.inventoryPending = busy === 'inventory';
    f.Controller.tick();
    assert.ok(f.Town.trip, 'Full pet must own the controller while ' + busy + ' settles');
    assert.equal(fights, 0); assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
    f.Controller.tick(); assert.equal(fights, 0);
    casting = false; f.World.gp.inventoryPending = false; f.advance(600); f.Controller.tick();
    assert.equal(f.Town.trip.phase, 'recall-wait'); assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1);
  }
});
test('reserved town departure times out instead of returning to combat or repeating scrolls', () => {
  const f = townFixture(); f.World.gp.inventoryPending = true; f.Controller.tick();
  assert.ok(f.Town.trip); f.advance(31000); f.Controller.tick();
  assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, false);
  assert.match(f.Town.message, /did not settle/); assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
});
test('town readiness explains disabled automation and missing prerequisites before the pet fills', () => {
  const f = townFixture(); f.Town.cfg().enabled = false; assert.match(f.Town.status(), /chime is an alert/);
  f.Town.cfg().enabled = true; f.Town.cfg().gate = null; assert.match(f.Town.status(), /not ready:.*world statue/);
  f.Town.cfg().gate = { regionId: 1, x: 100, y: 0, z: 100 }; assert.match(f.Town.status(), /ready:/);
});
test('town recognizes the repair service bit and the Hotan teleport statue entity', () => {
  const f = townFixture(), gp = f.World.gp; f.Hunt.stop(); f.UI.draw = () => {}; gp.pose.x = 200;
  gp.target = 62; gp.targetCapabilities = 9; f.Town.cfg().smith = null;
  f.Town.save('smith'); assert.ok(f.Town.cfg().smith, 'Shop + repair merchant must be accepted');
  const statue = f.World.ents.get(63); statue.kind = 'teleport'; gp.target = 63; gp.targetCapabilities = 0x20000080; f.Town.cfg().gate = null;
  f.Town.save('gate'); assert.ok(f.Town.cfg().gate, 'World statue must be accepted');
  assert.equal(f.Town.npc('gate').gid, 63);
  f.Hunt.start(); f.Town.begin(); f.Town.enter('open-smith'); gp.target = 62; gp.targetCapabilities = 9;
  f.Town.tick(); assert.equal(f.commands.at(-1).kind, 'shop-open');
  gp.shop = { npc: 62 }; gp.shopCompletionRevision++; f.Town.tick(); assert.equal(f.Town.trip.phase, 'sell');
  f.Town.enter('open-gate'); gp.target = 63; gp.targetCapabilities = 0x20000080; gp.npcConversation = { gid: 63, phase: 'closed' };
  f.Town.tick(); assert.equal(f.Town.trip.phase, 'open-gate');
  gp.npcConversation = { gid: 63, phase: 'menu' };
  f.Town.tick(); assert.equal(f.Town.trip.phase, 'reverse');
  assert.equal(f.commands.some(c => c.kind === 'npc-talk'), false, 'Statue menu comes from selection, not Talk');
});
test('town rejects special-trade-only merchants as smiths and names only missing services', () => {
  const f = townFixture(), gp = f.World.gp; f.Hunt.stop(); f.UI.draw = () => {}; gp.pose.x = 200;
  gp.target = 62; gp.targetCapabilities = 0x801; f.Town.cfg().smith = null; f.Town.cfg().gate = null;
  f.Town.save('smith'); assert.equal(f.Town.cfg().smith, null);
  assert.equal(f.Town.validate(), 'Save missing town services: repair merchant, world statue / teleport.');
});
test('town recall accepts landing variation around the saved arrival area', () => {
  const f = townFixture(); f.Town.tick(); f.Town.phase('entering-world');
  f.World.gp.pose = { regionId: 1, x: 350, y: 40, z: 180 }; f.Town.tick();
  assert.equal(f.Town.trip.phase, 'walk-storage', 'A nearby landing must start town services');
});
test('town recognizes a native world reset and waits for the fresh local player before services', () => {
  const f = townFixture(); f.UI.mount = f.UI.draw = f.UI.update = f.Ticker.start = () => {}; f.boot(); f.Town.tick();
  f.World.applyEvent({ kind: 'reset', epoch: 2 }); f.World.gp.pose.x = 350;
  f.Town.tick(); assert.equal(f.Town.trip.phase, 'recall-wait');
  f.World.applyEvent({ kind: 'spawn', entity: { gid: 1, kind: 'player', regionId: 1, x: 350, y: 0, z: 100, appearanceState: [0], movementMode: 0 } });
  f.Town.tick(); assert.equal(f.Town.trip.phase, 'walk-storage');
});
test('town arrival still needs travel confirmation, settled state and the configured area', () => {
  const f = townFixture(); f.Town.cfg().arrivalRadius = 100; f.Town.tick(); f.World.gp.pose.x = 100;
  f.Town.tick(); assert.equal(f.Town.trip.phase, 'recall-wait'); assert.match(f.Town.message, /accept the scroll request/);
  f.Town.phase('entering-world'); f.World.gp.pose.x = 350; f.Town.tick();
  assert.equal(f.Town.trip.phase, 'recall-wait'); assert.match(f.Town.message, /25 m.*10 m/);
  f.World.gp.pose.x = 100; f.World.gp.returnScroll = {}; f.Town.tick(); assert.equal(f.Town.trip.phase, 'recall-wait');
  f.World.gp.returnScroll = null; f.Town.tick(); assert.equal(f.Town.trip.phase, 'walk-storage');
});
test('reverse arrival cannot reuse the earlier recall transition', () => {
  const f = townFixture(); f.Town.tick(); f.Town.phase('entering-world'); f.Town.enter('reverse-wait');
  f.Town.tick(); assert.equal(f.Town.trip.phase, 'reverse-wait');
  f.Town.phase('entering-world'); f.Town.tick(); assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, true);
});



test('alternating potion use cannot starve the return scroll', () => {
  const f = townFixture();
  // Model potion dispatch at every eligible 400 ms controller tick.
  let time = 100000;
  f.Potion.tick = () => { f.Potion.lastUse = time; };
  f.Controller.tick(); assert.equal(f.Town.trip.phase, 'recall');
  for (let i = 0; i < 10 && !f.commands.some(c => c.kind === 'item-use'); i++) {
    f.advance(100); time += 100; f.Controller.tick();
  }
  assert.equal(f.commands.filter(c => c.kind === 'item-use' && c.slot === 13).length, 1);
  assert.equal(f.Town.trip.phase, 'recall-wait');
});

test('full character bag recalls before requiring space in town', () => {
  const f = townFixture(); f.pet.inventory = [];
  f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 50;
  f.World.gp.inventorySlotCount = 16;
  f.Settings.profile.hunt.stopInvFull = true;
  f.Controller.tick(); assert.equal(f.Town.trip.phase, 'recall-wait');
  assert.equal(f.commands.some(c => c.kind === 'item-use'), true);
  f.Town.phase('entering-world'); f.World.gp.pose.x = 100;
  f.advance(1000); f.Controller.tick();
  assert.equal(f.Hunt.running, false); assert.match(f.Town.message, /Returned to town; free/);
});

test('protected full pet recalls before asking for manual emptying', () => {
  const f = townFixture(); f.pet.inventory = [f.pet.inventory[2]]; f.pet.status = 1;
  f.Controller.tick(); assert.equal(f.Town.trip.phase, 'recall-wait');
  f.Town.phase('entering-world'); f.World.gp.pose.x = 100;
  f.advance(1000); f.Controller.tick();
  assert.equal(f.Hunt.running, false); assert.match(f.Town.message, /Returned to town; pet is full/);
});

test('town revival overrides stop default and preserves reverse intent through bootstrap', () => {
  const f = townFixture();
  f.UI.mount = f.UI.draw = f.UI.update = f.Ticker.start = () => {}; f.boot();
  f.Settings.profileKey = 'profile:TestHero';
  f.World.local().appearanceState[0] = 2;
  f.Controller.tick(); f.advance(5100); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'rebirth' && c.choice === 1).length, 1);
  f.bus.emit('phase', 'entering-world'); f.bus.emit('reset'); f.bus.emit('character', 'TestHero');
  assert.equal(f.Controller.resumeAfterRevive, true);
  f.World.local().appearanceState[0] = 0; f.World.gp.pose.x = 100;
  f.World.gp.inventoryPending = true; f.Controller.tick(); assert.equal(f.Town.trip, null);
  f.World.gp.inventoryPending = false; f.Controller.tick();
  assert.equal(f.Town.trip.phase, 'walk-storage'); assert.equal(f.Town.trip.origin.x, 700);
  assert.equal(f.Hunt.deathAt, 0); assert.equal(f.WalkBack.active, null);
  assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
  f.pet.inventory = [];
  f.Town.enter('reverse'); f.World.gp.target = 63; f.World.gp.targetCapabilities = 0x20000000;
  f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 50;
  f.World.gp.inventory.find(i => i.slot === 6).durability = 10;
  f.advance(1000); f.Controller.tick();
  const reverse = f.commands.find(c => c.kind === 'travel-gate');
  assert.equal(reverse.type, 5); assert.equal(reverse.target, 2);
  f.bus.emit('phase', 'entering-world'); f.bus.emit('reset'); f.World.gp.pose.x = 700;
  f.advance(1000); f.Controller.tick();
  assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, true);
  f.advance(1000); f.Controller.tick(); assert.equal(f.Town.trip, null);
});

test('death during departure recovers instead of silently stopping hunting', () => {
  const f = townFixture(); f.Controller.tick();
  f.World.local().appearanceState[0] = 2; f.Controller.tick();
  assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, true);
  f.advance(5100); f.Controller.tick();
  assert.equal(f.commands.some(c => c.kind === 'rebirth'), true);
  f.World.local().appearanceState[0] = 0; f.World.gp.pose.x = 100;
  f.Controller.tick(); assert.equal(f.Town.trip.phase, 'walk-storage');
  f.stopAll(); f.Controller.tick(); assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, false);
});

test('disabling town revival preserves explicit stop on death', () => {
  const f = townFixture(); f.Town.cfg().revive = false;
  f.World.local().appearanceState[0] = 2; f.Controller.tick();
  assert.equal(f.Hunt.running, false); assert.equal(f.commands.some(c => c.kind === 'rebirth'), false);
});



test('near-hunt party revival resumes without waiting for town arrival', () => {
  const f = townFixture(); f.pet.inventory = [];
  f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 50;
  f.World.local().appearanceState[0] = 2; f.Controller.tick();
  f.World.local().appearanceState[0] = 0; f.Controller.tick();
  assert.equal(f.Hunt.deathAt, 0); assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, true);
});



test('departure retries a rate-limited stop without needing the bot toggled', () => {
  for (const trigger of ['potions', 'pet']) {
    const f = townFixture();
    if (trigger === 'potions') f.pet.inventory = [];
    else f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 50;
    let fighting = true;
    f.World.isCasting = () => fighting;
    // A hunt move was just dispatched before the inventory update triggers town.
    f.Cmd.move(f.World.pose());
    const post = f.Hook.post;
    f.Hook.post = msg => {
      post(msg);
      if (msg.command.command.kind === 'move') fighting = false;
    };
    f.Controller.tick(); assert.equal(f.Town.trip.phase, 'recall');
    for (let n = 0; n < 20; n++) { f.advance(100); f.Controller.tick(); }
    assert.equal(f.Town.trip.phase, 'recall-wait', 'Must recover automatically for ' + trigger);
    assert.equal(f.Hunt.running, true);
    assert.equal(f.commands.filter(c => c.kind === 'item-use' && c.slot === 13).length, 1);
  }
});

test('enabled town departure takes ownership from a dormant walking-restock trip', () => {
  const f = townFixture();
  f.Restock.trip = { phase: 'vendor', manualAt: f.Manual.lastAt };
  f.Controller.tick();
  assert.equal(f.Restock.trip, null);
  assert.equal(f.Town.trip.phase, 'recall-wait');
  assert.equal(f.commands.filter(c => c.kind === 'item-use' && c.slot === 13).length, 1);
});


test('departure retries an unobserved stop at bounded intervals then recalls once', () => {
  const f = townFixture(); let fighting = true, stops = 0;
  f.World.isCasting = () => fighting;
  const post = f.Hook.post;
  f.Hook.post = msg => {
    post(msg);
    if (msg.command.command.kind === 'move' && ++stops === 2) fighting = false;
  };
  f.Controller.tick();
  for (let n = 0; n < 14; n++) { f.advance(100); f.Controller.tick(); }
  assert.equal(stops, 1); assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
  f.advance(100); f.Controller.tick(); assert.equal(stops, 2);
  f.advance(100); f.Controller.tick(); assert.equal(f.Town.trip.phase, 'recall-wait');
  for (let n = 0; n < 30; n++) { f.advance(100); f.Controller.tick(); }
  assert.equal(stops, 2); assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1);
});

test('a blocked movement queue settles automatically but F8 still cancels departure', () => {
  for (const cancel of [false, true]) {
    const f = townFixture(); f.World.gp.pendingMoves = 25;
    f.Controller.tick(); assert.equal(f.Town.trip.phase, 'recall');
    assert.equal(f.commands.some(c => c.kind === 'item-use'), false);
    if (cancel) f.stopAll();
    f.World.gp.pendingMoves = 0;
    f.advance(600); f.Controller.tick(); f.advance(100); f.Controller.tick();
    if (cancel) { assert.equal(f.Town.trip, null); assert.equal(f.commands.some(c => c.kind === 'item-use'), false); }
    else assert.equal(f.Town.trip.phase, 'recall-wait');
  }
});



test('unaccepted return scroll retries after fresh settled gameplay instead of needing a toggle', () => {
  const f = townFixture(); f.Controller.tick();
  assert.equal(f.Town.trip.phase, 'recall-wait');
  // Native worker rejects before sending when its inventory lane became busy.
  f.World.applyGameplay({ ...f.World.gp, inventoryPending: true, error: 'Inventory is busy' });
  f.advance(6000); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1);
  f.World.applyGameplay({ ...f.World.gp, inventoryPending: false });
  f.Controller.tick();
  for (let i = 0; i < 15; i++) { f.advance(100); f.Controller.tick(); }
  assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 2);
  assert.equal(f.Hunt.running, true);
});


test('scroll acknowledgement prevents retries for active casts, spent stacks and world transitions', () => {
  for (const acceptedBy of ['cast', 'quantity', 'transition', 'last-stack']) {
    const f = townFixture();
    if (acceptedBy === 'last-stack') f.World.gp.inventory.find(i => i.slot === 13).quantity = 1;
    f.Controller.tick();
    const gp = { ...f.World.gp, inventory: f.World.gp.inventory.map(i => ({ ...i })) };
    if (acceptedBy === 'cast') gp.returnScroll = { startedAtMs: 100000, durationMs: 30000 };
    if (acceptedBy === 'quantity') gp.inventory.find(i => i.slot === 13).quantity--;
    if (acceptedBy === 'last-stack') gp.inventory = gp.inventory.filter(i => i.slot !== 13);
    if (acceptedBy === 'transition') f.Town.phase('entering-world');
    f.World.applyGameplay(gp); f.advance(6000); f.Controller.tick();
    assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1, acceptedBy);
    assert.equal(f.Town.trip.scrollRequest.accepted, true, acceptedBy);
  }
});

test('unknown, stale or busy inventory never authorizes a repeated scroll', () => {
  for (const state of ['stale', 'pending', 'missing-pending', 'missing-inventory', 'casting']) {
    const f = townFixture(); f.Controller.tick();
    const gp = { ...f.World.gp };
    if (state === 'pending') gp.inventoryPending = true;
    if (state === 'missing-pending') delete gp.inventoryPending;
    if (state === 'missing-inventory') delete gp.inventory;
    if (state === 'casting') f.World.isCasting = () => true;
    if (state !== 'stale') f.World.applyGameplay(gp);
    f.advance(6000); f.Controller.tick();
    assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1, state);
    assert.equal(f.Town.trip.phase, 'recall-wait', state);
  }
});

test('native inventory timeout stops with resynchronization guidance instead of retrying', () => {
  const f = townFixture(); f.Controller.tick();
  f.World.applyGameplay({ ...f.World.gp, inventoryPending: true, error: 'Inventory transaction timed out; reconnect to resynchronize' });
  f.advance(11000); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1);
  assert.equal(f.Hunt.running, false); assert.match(f.Town.message, /reconnect to resynchronize/);
});

test('unaccepted scroll retries are bounded and retain rejection diagnostics', () => {
  const f = townFixture(); f.Controller.tick();
  for (let attempt = 0; attempt < 3; attempt++) {
    f.World.applyGameplay({ ...f.World.gp, inventoryPending: false, error: 'Inventory rejected: 93' });
    f.advance(6000); f.Controller.tick();
    for (let n = 0; n < 12; n++) { f.advance(100); f.Controller.tick(); }
  }
  assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 3);
  assert.equal(f.Hunt.running, false); assert.match(f.Town.message, /three attempts.*Inventory rejected/);
  assert.ok(f.Town.history.some(row => row.attempts === 3));
  f.toggleBot();
  assert.ok(f.Town.history.some(row => row.error === 'Inventory rejected: 93'));
});

test('reverse return also retries unaccepted requests without duplicating accepted scrolls', () => {
  const f = townFixture(); f.Town.begin(); f.Town.enter('reverse');
  const gp = f.World.gp; gp.target = 63; gp.targetCapabilities = 0x20000000;
  gp.inventory.find(i => i.refObjId === 15).quantity = 50;
  gp.inventory.find(i => i.slot === 6).durability = 10;
  f.Town.tick(); assert.equal(f.Town.trip.phase, 'reverse-wait');
  f.World.applyGameplay({ ...gp }); f.advance(6000); f.Town.tick();
  f.advance(100); f.Town.tick();
  assert.equal(f.commands.filter(c => c.kind === 'travel-gate').length, 2);
  f.World.applyGameplay({ ...f.World.gp, returnScroll: { durationMs: 30000 } });
  f.advance(6000); f.Town.tick();
  assert.equal(f.commands.filter(c => c.kind === 'travel-gate').length, 2);
});

test('F8 cancels an unaccepted scroll retry and status names gating states', () => {
  const f = townFixture(); f.Controller.tick(); f.stopAll();
  f.World.applyGameplay({ ...f.World.gp }); f.advance(6000); f.Controller.tick();
  assert.equal(f.Town.trip, null); assert.equal(f.commands.filter(c => c.kind === 'item-use').length, 1);
  assert.ok(f.Town.history.some(row => row.event === 'stop' && row.phase === 'recall-wait'));
  f.Town.message = ''; assert.match(f.Town.status(), /bot is stopped/);
  f.Hunt.start(); f.WalkBack.active = {}; assert.match(f.Town.status(), /walk-back is active/);
  f.WalkBack.active = null; f.Manual.lastAt = 100000 + 6000; assert.match(f.Town.status(), /manual control/);
});



test('diagnostic sampling cannot prevent manual stop on an inconsistent snapshot', () => {
  const f = townFixture(); f.Controller.tick();
  f.Town.reason = () => { throw Error('incomplete snapshot'); };
  assert.doesNotThrow(() => f.stopAll());
  assert.equal(f.Hunt.running, false); assert.equal(f.Town.trip, null);
});



test('death reverse landing within the hunt area resumes actual combat away from exact center', () => {
  const f = townFixture(); f.Town.lastScrollPoint = null;
  f.World.gp.pose.x = 100; f.Town.begin(true); f.Town.enter('reverse-wait');
  f.Town.phase('entering-world'); f.World.gp.pose.x = 950;
  f.pet.inventory = []; f.World.gp.inventory.find(i => i.refObjId === 15).quantity = 50;
  f.World.ents.set(30, { gid: 30, kind: 'monster', name: 'Mob', regionId: 1, x: 960, z: 100, attackFlags: 16, appearanceState: [0] });
  f.World.gp.target = 30;
  f.Controller.tick(); assert.equal(f.Town.trip, null, f.Town.message);
  f.advance(1000); f.Controller.tick();
  assert.ok(f.commands.some(c => c.kind === 'attack' && c.gid === 30), 'Hunting must issue an attack after returning');
});

test('potions cannot postpone confirmed reverse arrival and hunting handoff', () => {
  const f = townFixture(); f.Town.begin(); f.Town.enter('reverse-wait');
  f.Town.phase('entering-world'); f.World.gp.pose.x = 700;
  f.Potion.tick = () => { f.Potion.lastUse = 100000; };
  f.Controller.tick(); assert.equal(f.Town.trip, null, f.Town.message);
});


test('death return accepts the current hunt area even with an older remembered scroll point', () => {
  const f = townFixture(); f.Town.lastScrollPoint = { ...f.World.pose(), x: 1500 };
  f.World.gp.pose.x = 100; f.Town.begin(true); f.Town.enter('reverse-wait');
  f.Town.phase('entering-world'); f.World.gp.pose.x = 950;
  f.Town.tick(); assert.equal(f.Town.trip, null);
  assert.equal(f.Town.lastScrollPoint.x, 950);
});

test('death arrival still requires settled travel inside the expected destination area', () => {
  for (const blocked of ['no-transition', 'pending', 'scroll', 'no-player', 'outside', 'other-world', 'ordinary-trip']) {
    const f = townFixture(); f.World.gp.pose.x = 100;
    f.Town.begin(blocked !== 'ordinary-trip'); f.Town.enter('reverse-wait');
    if (blocked !== 'no-transition') f.Town.phase('entering-world');
    f.World.gp.pose.x = blocked === 'outside' ? 1500 : 950;
    if (blocked === 'pending') f.World.gp.inventoryPending = true;
    if (blocked === 'scroll') f.World.gp.returnScroll = { durationMs: 30000 };
    if (blocked === 'no-player') f.World.ents.delete(1);
    if (blocked === 'other-world') f.World.gp.pose.regionId = 0x8001;
    f.Town.tick(); assert.ok(f.Town.trip, blocked);
    assert.equal(f.Town.trip.phase, 'reverse-wait', blocked);
  }
});

test('stopping death return before arrival never resumes hunting', () => {
  const f = townFixture(); f.World.gp.pose.x = 100;
  f.Town.begin(true); f.Town.enter('reverse-wait'); f.Town.phase('entering-world');
  f.stopAll(); f.World.gp.pose.x = 950; f.advance(1000); f.Controller.tick();
  assert.equal(f.Town.trip, null); assert.equal(f.Hunt.running, false);
  assert.equal(f.commands.some(c => c.kind === 'attack'), false);
});
function alchemyFixture(powder = false) {
  const f = fixture();
  f.World.gp.alchemy = { visible: true, pending: false, mode: 'reinforce', flags: 0, error: null, slot: null };
  f.World.gp.inventory = [
    { slot: 13, refObjId: 100, typeFlags: 44 | (6 << 7), plus: 0, durability: 100, variance: '123', magic: [], quantity: 1, name: 'Test weapon', tooltip: { fields: { itemClass: 25 } } },
    { slot: 14, refObjId: 3679, typeFlags: 0x0d6c, quantity: 10 },
    { slot: 15, refObjId: 3691, typeFlags: 0x156c, quantity: 10 },
  ];
  Object.assign(f.Settings.profile.alchemy, { target: 3, limit: 20, powder });
  f.Alchemy.select(13);
  f.Alchemy.init();
  function result(flags, plus = 1, extra = {}) {
    const gp = f.World.gp, pending = f.Alchemy.pending;
    const inventory = gp.inventory.map(i => i.slot === 13 ? { ...i, plus } :
      i.slot === 14 || powder && i.slot === 15 ? { ...i, quantity: i.quantity - 1 } : i).filter(i => flags === 0x40 ? i.slot !== 13 : true);
    f.World.applyGameplay({ ...gp, inventory, inventoryPending: false,
      alchemy: { ...gp.alchemy, pending: false, flags, slot: 13, error: null, ...extra } });
    assert.ok(pending);
    f.Controller.tick();
  }
  return { ...f, result };
}

test('alchemy closes its native window on stop without cancelling a sent reinforcement', () => {
  const f = alchemyFixture(); f.Alchemy.start(); f.Controller.tick();
  f.World.applyGameplay({ ...f.World.gp, alchemy: { ...f.World.gp.alchemy, pending: true, slot: 13 } });
  f.Alchemy.stop();
  assert.equal(f.commands.at(-1).kind, 'alchemy-close');
  assert.ok(f.Alchemy.pending); assert.equal(f.Alchemy.run, null);
  f.Alchemy.stop(); assert.equal(f.commands.filter(c => c.kind === 'alchemy-close').length, 1);
  f.result(0x10, 1); assert.equal(f.Alchemy.pending, null);
  f.advance(2000); f.Controller.tick();
  assert.equal(f.commands.filter(c => c.kind === 'alchemy-start').length, 1);
});

test('alchemy closes after reaching its target and orders close after an unfinished open', () => {
  const f = alchemyFixture(); f.Settings.profile.alchemy.target = 1;
  f.Alchemy.start(); f.Controller.tick(); f.result(0x10, 1);
  assert.equal(f.commands.at(-1).kind, 'alchemy-close');
  const opening = alchemyFixture(); opening.World.gp.alchemy.visible = false;
  opening.Alchemy.start(); opening.Controller.tick(); opening.Alchemy.stop();
  assert.deepEqual(Array.from(opening.commands, c => c.kind), ['alchemy-open', 'alchemy-close']);
  opening.World.applyGameplay({ ...opening.World.gp, alchemy: { ...opening.World.gp.alchemy, visible: false } });
  opening.Controller.tick(); assert.equal(opening.commands.length, 2);
});

test('alchemy cleanup leaves unrelated native processes and a new world untouched', () => {
  const idle = alchemyFixture(); idle.Alchemy.stop(); assert.equal(idle.commands.length, 0);
  const f = alchemyFixture(); f.Alchemy.start(); f.Controller.tick();
  f.World.gp.alchemy.mode = 'compound'; f.Alchemy.stop();
  assert.equal(f.commands.some(c => c.kind === 'alchemy-close'), false);
  const r = alchemyFixture(); r.Alchemy.start(); r.Controller.tick(); r.bus.emit('reset');
  assert.equal(r.commands.some(c => c.kind === 'alchemy-close'), false);
});

test('alchemy sends native reinforcement slots and confirms success and failure before continuing', () => {
  const f = alchemyFixture(true); f.Alchemy.start(); f.Controller.tick();
  assert.deepEqual(JSON.parse(JSON.stringify(f.commands[0])), { kind: 'alchemy-start', mode: 'reinforce', slots: [13, 14, 15] });
  for (let n = 0; n < 10; n++) { f.advance(100); f.Controller.tick(); }
  assert.equal(f.commands.length, 1); assert.equal(f.Alchemy.result.elixirs, 0);
  f.result(0x10, 1); assert.equal(f.Alchemy.result.successes, 1); assert.equal(f.Alchemy.result.powders, 1);
  f.Controller.tick(); assert.equal(f.commands.length, 1);
  f.advance(1000); f.Controller.tick(); assert.equal(f.commands.length, 2);
  f.result(0x21, 0); assert.equal(f.Alchemy.result.failures, 1); assert.equal(f.Alchemy.item().plus, 0);
  assert.equal(f.Alchemy.result.elixirs, 2); assert.equal(f.Alchemy.result.powders, 2);
});

test('alchemy stops at target or attempt limit instead of spending further materials', () => {
  for (const target of [true, false]) {
    const f = alchemyFixture(); Object.assign(f.Settings.profile.alchemy, target ? { target: 1 } : { target: 5, limit: 1 });
    f.Alchemy.start(); f.Controller.tick(); f.result(target ? 0x10 : 0x20, target ? 1 : 0);
    assert.equal(f.Alchemy.run, null); assert.match(f.Alchemy.message, target ? /Target reached/ : /Attempt limit/);
    f.advance(30000); f.Controller.tick(); assert.equal(f.commands.filter(c => c.kind === 'alchemy-start').length, 1);
  }
});

test('alchemy requires bag weapons, valid limits, settled state and compatible materials', () => {
  for (const change of [f => { f.World.gp.inventory[0].typeFlags = 44 | (4 << 7); },
    f => { f.World.gp.inventory[0].slot = 6; }, f => { f.World.gp.inventoryPending = true; },
    f => { f.World.gp.alchemy.pending = true; }, f => { f.World.gp.alchemy = undefined; },
    f => { f.World.gp.inventory[1].refObjId = 3678; }, f => { f.Settings.profile.alchemy.target = 0; },
    f => { f.Settings.profile.alchemy.limit = 1.5; }, f => { f.Settings.profile.alchemy.elixir = 3675; },
    f => { f.Settings.profile.alchemy.powder = true; f.World.gp.inventory[2].refObjId = 3683; },
    f => { f.Settings.profile.alchemy.powder = true; delete f.World.gp.inventory[0].tooltip; },
    f => { f.World.gp.stall = { phase: 'owner', mode: 0 }; }, f => { f.Hunt.running = true; }]) {
    const f = alchemyFixture(); change(f); f.Alchemy.start();
    assert.equal(f.Alchemy.run, null); assert.equal(f.commands.length, 0);
  }
});

test('alchemy does not accept stale flags or material consumption alone as a result', () => {
  const f = alchemyFixture(); f.World.gp.alchemy.flags = 0x10; f.World.gp.alchemy.slot = 13;
  f.Alchemy.start(); f.Controller.tick();
  f.World.applyGameplay({ ...f.World.gp, alchemy: { ...f.World.gp.alchemy } });
  f.advance(1000); f.Controller.tick(); assert.ok(f.Alchemy.pending); assert.equal(f.commands.length, 1);
  const items = f.World.gp.inventory.map(i => i.slot === 14 ? { ...i, quantity: 9 } : i);
  f.World.applyGameplay({ ...f.World.gp, inventory: items, alchemy: { ...f.World.gp.alchemy, flags: 0 } });
  f.Controller.tick(); assert.ok(f.Alchemy.pending); assert.equal(f.Alchemy.result.elixirs, 0);
  f.advance(16000); f.Controller.tick(); assert.equal(f.Alchemy.run, null); assert.ok(f.Alchemy.pending);
  assert.match(f.Alchemy.message, /unconfirmed/); f.Alchemy.start(); assert.equal(f.Alchemy.run, null);
  f.Controller.tick(); assert.equal(f.commands.filter(c => c.kind === 'alchemy-start').length, 1);
  assert.equal(f.commands.at(-1).kind, 'alchemy-close');
});

test('alchemy waits for pending inventory to settle even after a matching result', () => {
  const f = alchemyFixture(); f.Alchemy.start(); f.Controller.tick();
  const gp = f.World.gp;
  f.World.applyGameplay({ ...gp, inventoryPending: true,
    inventory: gp.inventory.map(i => i.slot === 13 ? { ...i, plus: 1 } : i.slot === 14 ? { ...i, quantity: 9 } : i),
    alchemy: { ...gp.alchemy, pending: false, flags: 0x10, slot: 13 } });
  f.Controller.tick(); assert.ok(f.Alchemy.pending);
  f.World.applyGameplay({ ...f.World.gp, inventoryPending: false }); f.Controller.tick();
  assert.equal(f.Alchemy.pending, null); assert.equal(f.Alchemy.result.successes, 1);
});

test('alchemy observes native rejection and confirmed destruction without retrying', () => {
  const f = alchemyFixture(); f.Alchemy.start(); f.Controller.tick();
  f.World.applyGameplay({ ...f.World.gp, alchemy: { ...f.World.gp.alchemy, pending: false, error: 9, flags: 0, slot: 0 } });
  f.Controller.tick(); assert.equal(f.Alchemy.run, null); assert.equal(f.Alchemy.pending, null); assert.match(f.Alchemy.message, /refused/);
  const d = alchemyFixture(); d.Alchemy.start(); d.Controller.tick(); d.result(0x40);
  assert.equal(d.Alchemy.run, null); assert.equal(d.Alchemy.selected, null); assert.equal(d.Alchemy.pending, null);
  assert.match(d.Alchemy.message, /destroyed/); assert.equal(d.Alchemy.result.elixirs, 1);
});

test('alchemy freezes the selected item and stops on movement, replacement or edits', () => {
  for (const change of [f => { f.World.gp.inventory[0].slot = 16; },
    f => { f.World.gp.inventory[0].variance = '456'; }, f => { f.World.gp.inventory[0].refObjId = 200; },
    f => { f.World.gp.inventory[0].magic = ['1']; }, f => { f.Settings.profile.alchemy.limit++; },
    f => { f.Manual.lastAt = 100001; }, f => { f.World.charName = 'changed'; }]) {
    const f = alchemyFixture(); f.Alchemy.start(); change(f); f.Controller.tick();
    assert.equal(f.Alchemy.run, null); assert.equal(f.commands.length, 0);
  }
});

test('alchemy stop and F8 never repeat a sent attempt, including a late result', () => {
  const f = alchemyFixture(); f.Alchemy.start(); f.Controller.tick(); f.toggleBot();
  assert.equal(f.Hunt.running, false); assert.equal(f.Alchemy.run, null); assert.ok(f.Alchemy.pending);
  f.toggleBot(); assert.equal(f.Hunt.running, false);
  f.result(0x10, 1); assert.equal(f.Alchemy.pending, null); assert.equal(f.Alchemy.run, null);
  f.advance(2000); f.Controller.tick(); assert.equal(f.commands.filter(c => c.kind === 'alchemy-start').length, 1);
});

test('alchemy stops on native manual commands, death and world reset', () => {
  const f = alchemyFixture(); f.Alchemy.start();
  for (const observer of f.Hook.observers) observer({ kind: 'gameplay', command: { kind: 'inventory-move' } });
  assert.equal(f.Alchemy.run, null); assert.match(f.Alchemy.message, /manual/);
  const d = alchemyFixture(); d.Alchemy.start(); d.World.isDead = () => true; d.Controller.tick(); assert.equal(d.Alchemy.run, null);
  const r = alchemyFixture(); r.Alchemy.start(); r.Controller.tick(); r.bus.emit('reset');
  assert.equal(r.Alchemy.run, null); assert.equal(r.Alchemy.pending, null); assert.equal(r.Alchemy.selected, null);
});

test('alchemy waits for a visible window once and times out without spending', () => {
  const f = alchemyFixture(); f.World.gp.alchemy.visible = false; f.Alchemy.start(); f.Controller.tick();
  assert.equal(f.commands[0].kind, 'alchemy-open');
  f.advance(1000); f.Controller.tick(); assert.equal(f.commands.length, 1);
  f.World.applyGameplay({ ...f.World.gp, alchemy: { ...f.World.gp.alchemy, visible: true } }); f.Controller.tick();
  assert.equal(f.commands.at(-1).kind, 'alchemy-start');
  const t = alchemyFixture(); t.World.gp.alchemy.visible = false; t.Alchemy.start(); t.Controller.tick();
  t.advance(6000); t.Controller.tick(); assert.equal(t.Alchemy.run, null); assert.deepEqual(Array.from(t.commands, c => c.kind), ['alchemy-open', 'alchemy-close']);
});

test('alchemy blocks hunting and travel and stops when supplies run out', () => {
  const f = alchemyFixture(); f.Alchemy.start(); f.Hunt.start(); f.WalkBack.start();
  assert.equal(f.Hunt.running, false); assert.equal(f.WalkBack.active, null);
  f.World.gp.inventory[1].quantity = 0; f.Controller.tick(); assert.equal(f.Alchemy.run, null); assert.equal(f.commands.length, 0);
  const t = alchemyFixture(); t.Alchemy.start(); t.Controller.tick();
  assert.equal(t.Controller.mode, 'alchemy'); assert.equal(t.commands.some(c => c.kind === 'item-use'), false);
});

test('alchemy uses no powder when disabled and rolls over exhausted elixir stacks', () => {
  const f = alchemyFixture(); f.World.gp.inventory[1].quantity = 1;
  f.World.gp.inventory.push({ slot: 16, refObjId: 3679, typeFlags: 0x0d6c, quantity: 5 });
  f.Alchemy.start(); f.Controller.tick();
  assert.deepEqual(Array.from(f.commands[0].slots), [13, 14]);
  f.result(0x10, 1); assert.equal(f.Alchemy.result.powders, 0);
  f.advance(1000); f.Controller.tick(); assert.deepEqual(Array.from(f.commands.at(-1).slots), [13, 16]);
});

test('alchemy rejects mismatched results and unexpected plus changes without another attempt', () => {
  for (const change of [a => { a.slot = 14; }, a => { a.mode = 'magic'; }, a => { a.flags = 0x70; }]) {
    const f = alchemyFixture(); f.Alchemy.start(); f.Controller.tick();
    const gp = f.World.gp, a = { ...gp.alchemy, slot: 13, flags: 0x10 }; change(a);
    f.World.applyGameplay({ ...gp, alchemy: a,
      inventory: gp.inventory.map(i => i.slot === 13 ? { ...i, plus: 1 } : i.slot === 14 ? { ...i, quantity: 9 } : i) });
    f.advance(16000); f.Controller.tick(); assert.equal(f.Alchemy.run, null); assert.ok(f.Alchemy.pending); assert.equal(f.commands.filter(c => c.kind === 'alchemy-start').length, 1);
  }
  const f = alchemyFixture(); f.Alchemy.start(); f.Controller.tick(); f.result(0x10, 5);
  assert.equal(f.Alchemy.run, null); assert.ok(f.Alchemy.pending); assert.match(f.Alchemy.message, /Unexpected enhancement/);
});

test('alchemy dispatch failure spends no attempt and manual refusal stops a pending run', () => {
  const f = alchemyFixture(), raw = f.Cmd.raw;
  f.Cmd.raw = () => false; f.Alchemy.start(); f.Controller.tick(); assert.equal(f.Alchemy.result.attempts, 0); assert.equal(f.Alchemy.pending, null);
  f.Cmd.raw = raw; f.Controller.tick(); assert.equal(f.Alchemy.result.attempts, 1);
  f.bus.emit('game-error', 'Alchemy operation unavailable'); assert.equal(f.Alchemy.run, null); assert.ok(f.Alchemy.pending);
  f.result(0x10, 1); assert.equal(f.Alchemy.pending, null); f.advance(1000); f.Controller.tick(); assert.equal(f.commands.filter(c => c.kind === 'alchemy-start').length, 1);
});

test('diagnostics distinguish native alchemy windows and pending movement without exporting arbitrary modes', () => {
  const f = alchemyFixture(); f.World.gp.pendingMoves = 2; f.World.gp.returnScroll = {};
  let s = f.Diagnostics.snapshot();
  assert.equal(s.alchemyWindowVisible, true); assert.equal(s.nativeAlchemyPending, false);
  assert.equal(s.nativeAlchemyMode, 'reinforce'); assert.equal(s.movementPending, true); assert.equal(s.returnScrollActive, true);
  f.World.gp.alchemy = { visible: false, pending: true, mode: 'private injected text' };
  s = f.Diagnostics.snapshot(); assert.equal(s.nativeAlchemyMode, null);
  assert.equal(s.nativeAlchemyPending, true); assert.equal(s.alchemyWindowVisible, false);
  assert.equal(JSON.stringify(s).includes('private injected text'), false);
});

test('diagnostics identify party acceptance gates without changing party commands', () => {
  const f = fixture(), m = partyApplication(f);
  f.World.gp.social.members = Array.from({ length: 5 }, (_, n) => ({ id: 10 + n }));
  assert.match(f.Diagnostics.party(), /ready for acceptance/);
  m.own = null; assert.match(f.Diagnostics.party(), /listing missing/);
  m.own = { type: 1 }; f.World.gp.social.leader = 99; assert.match(f.Diagnostics.party(), /not the leader/);
  f.World.gp.social.leader = 10; f.World.gp.social.options = 0; assert.match(f.Diagnostics.party(), /party full/);
  f.World.gp.social.options = 1; m.request.expires = 99999; assert.match(f.Diagnostics.party(), /expired/);
  m.request.expires = 110000; f.Controller.tick(); assert.match(f.Diagnostics.party(), /acceptance sent/);
  const count = f.commands.length; f.Diagnostics.report(); assert.equal(f.commands.length, count);
});

test('diagnostics show real pet transaction and potion waits plus town refill progress', () => {
  const f = fixture(); pickupPet(f); f.Hunt.running = true;
  f.World.gp.inventoryPending = true; assert.match(f.Diagnostics.pet(), /inventory transaction/);
  f.World.gp.inventoryPending = false; f.Potion.lastUse = 100000; assert.match(f.Diagnostics.pet(), /potion use/);
  f.advance(500); assert.match(f.Diagnostics.pet(), /eligible drops/);
  const t = townFixture(); t.Restock.cfg().mp.target = 1000; t.Town.begin(); t.Town.enter('buy');
  t.World.gp.inventory.find(i => i.refObjId === 15).quantity = 650;
  assert.equal(t.Diagnostics.main(), 'Refilling MP: 650 / 1000');
  t.Town.trip = null; t.World.gp.inventory = t.World.gp.inventory.filter(i => i.refObjId !== 201);
  assert.match(t.Diagnostics.town(), /reverse scroll missing/);
});

test('diagnostic reports omit names, raw errors, chat, locations and sensitive settings', () => {
  const f = fixture(); partyApplication(f); pickupPet(f);
  const secret = 'PRIVATE_USER_SECRET';
  f.World.charName = secret; f.World.gp.chat = [secret]; f.World.gp.error = secret;
  f.World.gp.partyMatching.request.member.name = secret;
  f.Settings.profile.party.title = secret; f.Settings.profile.hunt.pickup.include = secret;
  f.Town.cfg().keep = secret; f.Town.cfg().vendor = { name: secret, x: 123456789 };
  f.Loot.active = { name: secret, gid: 912345, petGid: 50 };
  f.Diagnostics.start(); f.Diagnostics.start();
  f.bus.emit('game-error', 'Inventory busy: ' + secret);
  f.bus.emit('log', { level: 'warn', text: secret });
  const text = f.Diagnostics.report(), report = JSON.parse(text);
  assert.equal(text.includes(secret), false); assert.equal(text.includes('123456789'), false); assert.equal(text.includes('912345'), false);
  assert.equal(report.current.settings.mpTarget, 300);
  assert.deepEqual(report.recentErrors.map(e => e.code), ['inventory-busy', 'unclassified-error']);
  assert.equal(report.app, 'nixxane bot');
});

test('diagnostic history is bounded, retained across stops and tolerates incomplete state', () => {
  const f = fixture();
  for (let n = 0; n < 50; n++) { f.Settings.profile.potion.restock.mp.target = n; f.advance(1000); f.Diagnostics.sample(); f.Diagnostics.error('error ' + n); }
  assert.equal(f.Diagnostics.history.length, 30); assert.equal(f.Diagnostics.errors.length, 12);
  f.stopAll(); assert.equal(f.Diagnostics.history.length, 30);
  f.World.gp = null; assert.doesNotThrow(() => JSON.parse(f.Diagnostics.report()));
  f.World.simOffset = null; assert.doesNotThrow(() => f.Diagnostics.sample());
});

async function updateTests() {
  async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
  const sha = 'a'.repeat(40), base = 'https://raw.githubusercontent.com/nixxane/opensro-bot-lean/' + sha + '/bot.lean.';
  function updater(f, version = '1.2.100') {
    const calls = [];
    f.win.fetch = async (url, options) => {
      calls.push({ url, options });
      return url.includes('api.github.com') ? { ok: true, json: async () => ({ sha }) } :
        { ok: true, text: async () => '// @version      ' + version + '\n' };
    };
    return calls;
  }
  await check('updates compare numeric version components and ignore malformed versions', async () => {
    const f = fixture();
    for (const v of ['1.2.100', '1.3.0', '2.0.0']) assert.equal(f.Updates.newer(v), true);
    for (const v of ['1.2.9', '1.2.36', '1.1.999', 'bad', '1.2.35-beta', '1.2.999999999999999999999']) assert.equal(f.Updates.newer(v), false);
  });
  await check('updates pin metadata and user-initiated installer to the same trusted commit', async () => {
    const f = fixture(), calls = updater(f); f.UI.updateButton = {};
    await f.Updates.check();
    assert.equal(calls.length, 2); assert.equal(calls[1].url, base + 'meta.js');
    assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(f.UI.updateButton.hidden, false); assert.equal(f.UI.updateButton.textContent, 'Update 1.2.100');
    let opened; f.win.open = (...args) => { opened = args; };
    assert.equal(opened, undefined); f.Updates.open();
    assert.deepEqual(opened, [base + 'user.js', '_blank', 'noopener,noreferrer']);
    assert.equal(f.commands.length, 0); assert.equal(f.Hunt.running, false);
    updater(f, '1.2.34'); await f.Updates.check(); assert.equal(f.Updates.latest, null); assert.equal(f.UI.updateButton.hidden, true);
  });
  await check('offline and invalid update responses never create an install link and release the check lock', async () => {
    for (const response of [null, { ok: false }, { ok: true, json: async () => ({ sha: '../evil' }) }]) {
      const f = fixture(); f.win.fetch = async () => { if (!response) throw Error('offline'); return response; };
      await f.Updates.check(); assert.equal(f.Updates.latest, null); assert.equal(f.Updates.busy, false);
      updater(f); await f.Updates.check(); assert.ok(f.Updates.latest);
      f.win.fetch = async () => { throw Error('offline'); }; await f.Updates.check(); assert.ok(f.Updates.latest);
    }
    const f = fixture(); updater(f, 'javascript:alert(1)'); await f.Updates.check(); assert.equal(f.Updates.latest, null);
  });
  await check('update checks do not overlap and startup schedules one fifteen-minute interval', async () => {
    const f = fixture(); let resolve, calls = 0;
    f.win.fetch = () => { calls++; return new Promise(r => { resolve = r; }); };
    const pending = f.Updates.check(); await f.Updates.check(); assert.equal(calls, 1);
    resolve({ ok: false }); await pending; assert.equal(f.Updates.busy, false);
    let checks = 0; f.Updates.check = async () => { checks++; };
    f.Updates.start(); f.Updates.start(); assert.equal(checks, 1); assert.equal(f.intervals.length, 1);
    assert.equal(f.intervals[0].ms, 900000); f.intervals[0].fn(); assert.equal(checks, 2);
  });
  await check('diagnostics copy only on request and offer selectable fallback when clipboard is blocked', async () => {
    const f = fixture(); let copied = '', fallback = '';
    f.win.navigator = { clipboard: { writeText: async text => { copied = text; } } };
    f.UI.showDiagnostics = text => { fallback = text; };
    assert.equal(copied, ''); await f.Diagnostics.copy(); assert.equal(JSON.parse(copied).app, 'nixxane bot');
    assert.match(f.notices.at(-1), /paste this into your bug report/); assert.equal(fallback, '');
    f.win.navigator.clipboard.writeText = async () => { throw Error('denied'); };
    await f.Diagnostics.copy(); assert.equal(JSON.parse(fallback).app, 'nixxane bot');
    assert.equal(f.commands.length, 0);
  });
  function reporting(f) {
    f.UI.showReport = () => {};
    f.UI.reportStatus = { textContent: '' };
    f.Reports.open();
    return f.Reports;
  }
  await check('report preview freezes redacted diagnostics and sends only on explicit request', async () => {
    const f = fixture(); let calls = [];
    f.World.gp.characterName = 'PRIVATE_NAME';
    f.win.fetch = async (...args) => { calls.push(args); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
    const r = reporting(f), original = r.text();
    assert.equal(calls.length, 0); assert.ok(!original.includes('PRIVATE_NAME'));
    f.World.gp.inventoryPending = true; f.Diagnostics.sample(); assert.equal(r.text(), original);
    r.describe('It stopped after alchemy.');
    const preview = r.text(); await r.send();
    assert.equal(calls.length, 1); const [url, options] = calls[0];
    assert.equal(url, 'https://nixbot.nixxane.workers.dev/report');
    assert.equal(options.body.get('report'), preview); assert.equal(options.body.get('screenshot'), null);
    assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error'); assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(preview).description, 'It stopped after alchemy.');
    assert.equal(r.draft.sent, true); await r.send(); assert.equal(calls.length, 1);
    assert.equal(f.commands.length, 0); assert.equal(f.storage.size, 0);
    r.close(); assert.equal(r.draft, null);
  });
  await check('report uploads do not overlap or retry automatically and retain uncertain drafts', async () => {
    const f = fixture(), r = reporting(f); let reject, calls = 0;
    f.win.fetch = () => { calls++; return new Promise((_, no) => { reject = no; }); };
    const pending = r.send(); const before = r.text();
    await r.send(); r.describe('changed'); r.close(); assert.equal(r.text(), before);
    assert.equal(calls, 1); reject(Error('private error')); await pending;
    assert.equal(r.sending, false); assert.equal(r.draft.sent, false);
    assert.match(f.UI.reportStatus.textContent, /could not be confirmed/);
    assert.ok(!f.UI.reportStatus.textContent.includes('private error')); assert.equal(calls, 1);
    f.win.fetch = async (_, o) => { calls++; assert.equal(o.body.get('report'), before); return {ok:true,status:200,json:async()=>({ok:true})}; };
    await r.send(); assert.equal(calls, 2);
  });
  await check('report rate limits persist across preview closes and expire without automatic sending', async () => {
    for (const header of ['60', null, 'garbage']) {
      const f = fixture(), r = reporting(f); let calls = 0;
      f.win.fetch = async () => { calls++; return {status:429,headers:{get:()=>header}}; };
      await r.send(); assert.equal(r.cooldownUntil, 160000); r.close(); r.open();
      await r.send(); f.advance(59999); await r.send(); assert.equal(calls, 1);
      f.advance(1); assert.equal(calls, 1); await r.send(); assert.equal(calls, 2);
    }
  });
  await check('report timeout aborts once and validation/service failures never trigger retries', async () => {
    const f = fixture(), r = reporting(f); let signal, calls = 0;
    f.win.fetch = (_, options) => { calls++; signal = options.signal; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('timeout')))); };
    const pending = r.send(); const timeout = f.timers.find(t => t.ms === 20000); assert.ok(timeout); timeout.fn(); await pending;
    assert.equal(signal.aborted, true); assert.equal(calls, 1); assert.equal(r.sending, false);
    assert.match(f.UI.reportStatus.textContent, /could not be confirmed/);
    for (const status of [400, 413, 403, 503, 502]) {
      f.win.fetch = async () => ({status,ok:false}); await r.send();
      assert.equal(r.draft.sent, false); assert.equal(r.sending, false);
    }
    f.win.fetch = async () => ({status:200,ok:true,json:async()=>({ok:false})}); await r.send(); assert.equal(r.draft.sent, false);
    r.draft.base.large = 'x'.repeat(128 * 1024); f.win.fetch = () => { throw Error('must not upload'); };
    await r.send(); assert.match(f.UI.reportStatus.textContent, /too large/);
  });
  await check('screenshots require a click, stop every track, and send only the reviewed attachment', async () => {
    const f = fixture(), r = reporting(f); let selected = 0, stopped = 0, uploads = 0;
    const stream = {getTracks:()=>[{stop:()=>stopped++},{stop:()=>stopped++}]};
    f.win.navigator = { mediaDevices: { getDisplayMedia: async options => { selected++; assert.equal(options.audio,false); return stream; } } };
    r.frame = async () => new Blob(['test screenshot'],{type:'image/jpeg'});
    assert.equal(selected,0); await r.capture(); assert.equal(selected,1); assert.equal(stopped,2);
    assert.ok(r.draft.url.startsWith('blob:')); const image = r.draft.image;
    f.win.fetch = async (_, options) => { uploads++; const file=options.body.get('screenshot'); assert.equal(file.name,'screenshot.jpg'); assert.equal(await file.text(),await image.text()); return {ok:true,status:200,json:async()=>({ok:true})}; };
    assert.equal(uploads,0); await r.send(); assert.equal(uploads,1); assert.equal(r.draft.image,null); assert.equal(r.draft.url,'');
    assert.equal(f.commands.length,0);
  });
  await check('cancelled, failed, and closed screenshot captures cannot upload or leave a stream open', async () => {
    const f = fixture(), r = reporting(f); let stopped = 0, resolve;
    f.win.navigator = {mediaDevices:{getDisplayMedia:()=>new Promise(done=>{resolve=done;})}};
    r.frame = async () => { throw Error('capture broke'); };
    let pending = r.capture(); await r.capture(); r.close();
    resolve({getTracks:()=>[{stop:()=>stopped++}]}); await pending;
    assert.equal(stopped,1); assert.equal(r.draft,null); assert.equal(r.capturing,false);
    r.open(); f.win.navigator.mediaDevices.getDisplayMedia=async()=>({getTracks:()=>[{stop:()=>stopped++}]});
    await r.capture(); assert.equal(stopped,2); assert.equal(r.draft.image,null); assert.equal(r.capturing,false);
    f.win.navigator.mediaDevices.getDisplayMedia=async()=>{throw Error('denied');}; await r.capture();
    assert.match(f.UI.reportStatus.textContent,/Nothing was uploaded/);
    delete f.win.navigator.mediaDevices; await r.capture(); assert.match(f.UI.reportStatus.textContent,/unavailable/);
    r.describe('a'.repeat(2000)); assert.equal(r.draft.description.length,1000);
  });
  console.log('Total integration tests: ' + passed);
}
updateTests().catch(error => { console.error(error); process.exitCode = 1; });
