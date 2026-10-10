const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/bot.lean.user.js', 'utf8');
const isolated = source.slice(0, source.lastIndexOf('installWorkerHook();')) +
  'globalThis.bot = {World, Settings, Hook, Cmd, Hunt, Loot, Restock, WalkBack, Navigation, Learned, Display, Wardrobe, WdData, LeanWardrobe, Controller, UI, Stats, Combat, bus, Manual, stopAll, toggleBot, boot, Ticker, Sound};\n})();';
function fixture() {
  let time = 100000;
  const storage = new Map(), commands = [], notices = [];
  const win = { addEventListener() {}, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) } };
  const context = { window: win, performance: { now: () => time }, console,
    setTimeout: () => 1, clearTimeout() {}, setInterval() {}, Map, Set, Date, ArrayBuffer, DataView, atob };
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
  return { ...b, commands, notices, storage, drop, advance: ms => { time += ms; } };
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
test('pet pickup yields to busy inventory, attacks and low potion thresholds', () => {
  const f = fixture(); pickupPet(f); const d = f.drop(20, 3436);
  f.World.gp.inventoryPending = true; assert.equal(f.Loot.begin(d), false);
  f.World.gp.inventoryPending = false; f.World.ents.set(30, { gid: 30, kind: 'monster', appearanceState: [0] });
  f.World.attackers.set(30, 100000); assert.equal(f.Loot.begin(d), false);
  f.World.attackers.clear(); f.World.gp.vitals = [{ gid: 1, hp: 65, mp: 100, maxHp: 100, maxMp: 100 }];
  assert.equal(f.Loot.begin(d), false); assert.equal(f.commands.length, 0);
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
console.log(`${passed} lean integration tests passed.`);
