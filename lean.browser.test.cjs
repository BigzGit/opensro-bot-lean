const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const script = fs.readFileSync(__dirname + '/bot.lean.user.js', 'utf8');
const skin = JSON.parse(script.match(/const LEAN_SKIN = (\{[^\n]+\});/)[1]);
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const images = ['ic_attack', 'ic_recovery', 'ic_autoget', 'ic_sit'].map((key, i) => {
  const raw = Buffer.from(skin[key].split(',')[1], 'base64'), compressed = zlib.gzipSync(raw);
  return { raw, compressed, path: `/assets/images/Media_extracted/icon/skill/test/skill${i}.png`, transport: `/assets/test-icons/skill${i}.png.gz` };
});
let offset = 0;
const manifest = { groups: [], assets: images.map((image, i) => {
  const row = { path: image.path, packPath: '/assets/test-icons/icons.pack', offset, length: image.raw.length, sha256: sha(image.raw), mime: 'image/png' };
  offset += image.raw.length;
  // The fourth image deliberately exercises the pack Range fallback.
  if (i !== 3) row.transport = { path: image.transport, sha256: sha(image.compressed) };
  return row;
}) };
const skillRow = Array(79).fill('0');
Object.assign(skillRow, { 0:'3404',1:'334',2:'13',3:'1',18:'skill\\test\\skill3.ddj',19:'SN_THUNDER',24:'0',78:'0' });
const jsonFixtures = {
  '/assets/data/skillData.json': { rows:[skillRow.join('\t')] },
  '/assets/text/textdataname.en.json': { entries: { SN_THUNDER:'Thunderdragon force', SN_ITEM_CH_SWORD_09_A:'Test Sword', SN_ITEM_CH_SWORD_09_C_RARE_HONOR:'Honor Sword' } },
  '/assets/char/roster.json': { dress: { equipment: {
    10:{code:'ITEM_CH_SWORD_09_A',slot:6,bodies:{CH_M:{}}},11:{code:'ITEM_CH_SWORD_09_C_RARE_HONOR',slot:6,bodies:{CH_M:{}}},
    12:{code:'ITEM_CH_SWORD_09_A',slot:6,bodies:{CH_W:{}}}
  } }, models: { 123:{refObjId:123,codename:'CHAR_CH_MAN_TEST'} } },
  '/assets/data/missionPresentation.json': { itemsByRefObjId: {
    10:{codename:'ITEM_CH_SWORD_09_A',iconDdjPath:'icon/skill/test/skill0.ddj'},11:{codename:'ITEM_CH_SWORD_09_C_RARE_HONOR',iconDdjPath:'icon/skill/test/skill2.ddj'}
  } },
  '/assets/npc/manifest.json': { models:{} },
};
for (let n=0;n<55;n++) {
  const id=200+n,code='ITEM_MALL_AVATAR_M_PAID_'+n;
  jsonFixtures['/assets/char/roster.json'].dress.equipment[id]={code,avatarSlot:n%4,bodies:{CH_M:{}}};
  jsonFixtures['/assets/data/missionPresentation.json'].itemsByRefObjId[id]={codename:code,iconDdjPath:'icon/skill/test/skill0.ddj'};
  jsonFixtures['/assets/text/textdataname.en.json'].entries['SN_'+code]='Paid skin '+n;
}
const jsonAssets = Object.entries(jsonFixtures).map(([p, value], i) => {
  const raw = Buffer.from(JSON.stringify(value)), compressed = zlib.gzipSync(raw), transport = `/assets/test-data/${i}.json.gz`;
  manifest.assets.push({path:p,packPath:'/unused.pack',offset:0,length:raw.length,sha256:sha(raw),mime:'application/json',transport:{path:transport,sha256:sha(compressed)}});
  return {transport,compressed};
});
const header = Buffer.alloc(12); header.write('SROPACK1'); header.writeUInt32LE(2, 8);
const pack = Buffer.concat([header, Buffer.from('{}'), ...images.map(i => i.raw)]);
const server = http.createServer((req, res) => {
  if (req.url === '/assets/packs/manifest.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(manifest)); return; }
  const image = [...images,...jsonAssets].find(i => i.transport === req.url);
  if (image) { res.setHeader('Content-Type', 'application/octet-stream'); res.end(image.compressed); return; }
  if (req.url === '/assets/test-icons/icons.pack') {
    const range = req.headers.range?.match(/bytes=(\d+)-(\d+)/);
    if (range) { const a = Number(range[1]), b = Number(range[2]); res.writeHead(206, { 'Content-Range': `bytes ${a}-${b}/${pack.length}` }); res.end(pack.subarray(a, b + 1)); }
    else res.end(pack);
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html><head><title>Lean bot UI test</title></head><body style="background:#0d1420;color:#77869b;font:18px system-ui;margin:28px"><h1>Bot interface test</h1><p>Simulated game state; no game server connected.</p></body></html>');
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launchPersistentContext(__dirname + '/browser-test-profile', { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, viewport: { width: 1200, height: 1000 } });
  try {
    const page = await browser.newPage();
    const errors = [], assets = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/assets/')) assets.push(request.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ content: script });
    await page.getByText('OpenSRO Bot Lean', { exact: true }).waitFor();
    await page.evaluate(() => {
      const code = `onmessage = e => { if(e.data.kind === 'fixture') postMessage(e.data.message); else if(e.data.kind === 'session') postMessage({ kind: 'observed-command', command: e.data.command.command }); };`;
      window.testCommands = [];
      window.testSim = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { name: 'sro-simulation' });
      testSim.addEventListener('message', e => { if (e.data.kind === 'observed-command') testCommands.push(e.data.command); });
      testSim.postMessage({ kind: 'fixture', message: { kind: 'session', state: { phase: 'world', character: 'TestHero' } } });
      testSim.postMessage({ kind: 'fixture', message: { kind: 'world', batch: { events: [
        { kind: 'spawn', entity: { gid: 1, kind: 'local-player', refObjId:123, regionId: 1, x: 100, y: 0, z: 100, appearanceState: [0], movementMode: 0 } },
        { kind: 'gameplay', state: { localGid: 1, target: 0, targetPending: false, inventoryPending: false, pendingMoves: 0,
          pose: { regionId: 1, x: 100, y: 0, z: 100 }, progression: { gold: '5000', stats: { maxHp: 100, maxMp: 100 } },
          inventory: [{slot:6,refObjId:10,typeFlags:(2<<11)|(6<<7)|44,plus:0}], inventorySlotCount: 30, equipmentSlotCount: 13, skills: [5, 6, 7, 8], vitals: [],
          skillCatalog: [
            { id: 5, group: 5, name: 'Test attack', icon: 'skill\\test\\skill0.ddj', level: 1, targetRequired: true, targets: 4, mp: 5, cooldownMs: 1000 },
            { id: 6, group: 6, name: 'Test buff', icon: 'skill\\test\\skill1.ddj', level: 1, targetRequired: false, mp: 5, cooldownMs: 1000 },
            { id: 7, group: 7, name: 'Second attack', icon: 'skill\\test\\skill2.ddj', level: 2, targetRequired: true, targets: 4, mp: 20, cooldownMs: 5000 },
            { id: 8, group: 8, name: 'Weapon imbue', icon: 'skill\\test\\skill3.ddj', level: 3, targetRequired: false, mp: 10, cooldownMs: 2000 },
          ] } },
      ] } } });
    });
    await page.waitForFunction(() => window.SROLean?.world.inWorld());
    await page.getByRole('button', { name: 'Hunt area', exact: true }).click();
    await page.getByRole('button', { name: 'Set hunting spot here', exact: true }).click();
    assert.equal(await page.evaluate(() => SROLean.settings.profile.hunt.center.x), 100);
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await page.getByRole('button', { name: 'Add Test attack', exact: true }).click();
    assert.equal(await page.evaluate(() => SROLean.settings.profile.macro.rotations.normal[0].id), 5);
    await page.getByRole('button', { name: 'Add Second attack', exact: true }).click();
    await page.getByRole('button', { name: 'Move up Second attack', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => SROLean.settings.profile.macro.rotations.normal.map(s => s.id)), [7, 5]);
    await page.waitForFunction(() => [...document.getElementById('sro-bot-lean').shadowRoot.querySelectorAll('.slot')].every(s => s.dataset.iconLoaded === 'true'));
    await page.getByRole('button', { name: 'Unselect Test attack', exact: true }).hover();
    assert.equal(await page.locator('.skill-tip').isVisible(), true);
    assert.match(await page.locator('.skill-tip').innerText(), /Test attack/);
    await page.getByLabel('Search attack skills', { exact: true }).fill('second');
    assert.equal(await page.getByRole('button', { name: 'Unselect Test attack', exact: true }).isVisible(), false);
    await page.getByLabel('Search attack skills', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Buffs & imbue', exact: true }).click();
    await page.getByRole('button', { name: 'Add Test buff', exact: true }).click();
    assert.equal(await page.evaluate(() => SROLean.settings.profile.macro.buffs[0].id), 6);
    await page.getByRole('button', { name: 'Use imbue Weapon imbue', exact: true }).click();
    assert.equal(await page.evaluate(() => SROLean.settings.profile.macro.imbue.id), 8);
    await page.waitForFunction(() => [...document.getElementById('sro-bot-lean').shadowRoot.querySelectorAll('.slot')].every(s => s.dataset.iconLoaded === 'true'));
    for (const tab of ['Loot', 'Supplies', 'Settings', 'Combat']) await page.getByRole('button', { name: tab, exact: true }).click();
    await page.getByRole('button', { name: 'Hunt area', exact: true }).click();
    await page.getByLabel('Hunt radius (m)', { exact: true }).fill('55');
    await page.getByLabel('Hunt radius (m)', { exact: true }).dispatchEvent('change');
    assert.equal(await page.evaluate(() => SROLean.settings.profile.hunt.radius), 550);
    await page.getByRole('button', { name: 'Start / stop · F8', exact: true }).click();
    assert.equal(await page.evaluate(() => SROLean.hunt.running), true);
    await page.keyboard.press('F8');
    assert.equal(await page.evaluate(() => SROLean.hunt.running), false);
    try { await page.waitForFunction(() => testCommands.some(c => c.kind === 'move'), { timeout: 3000 }); }
    catch (e) { console.error(await page.evaluate(() => ({ commands: testCommands, log: SROLean.log.lines.slice(-8), pose: SROLean.world.pose(), time: performance.now() }))); throw e; }
    await page.evaluate(() => { SROLean.world.gp.pose.x = 400; });
    await page.getByRole('button', { name: 'Walk back', exact: true }).click();
    await page.waitForFunction(() => window.SROLean.walkBack.active !== null);
    await page.getByRole('button', { name: 'Stop all', exact: true }).click();
    assert.equal(await page.evaluate(() => SROLean.walkBack.active), null);
    await page.keyboard.press('F7');
    assert.equal(await page.getByRole('button', { name: 'Stop all', exact: true }).isVisible(), false);
    await page.keyboard.press('F7');
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await page.waitForFunction(() => [...document.getElementById('sro-bot-lean').shadowRoot.querySelectorAll('.slot')].every(s => s.dataset.iconLoaded === 'true'));
    await page.screenshot({ path: __dirname + '/lean-skills-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Buffs & imbue', exact: true }).click();
    await page.waitForFunction(() => [...document.getElementById('sro-bot-lean').shadowRoot.querySelectorAll('.slot')].every(s => s.dataset.iconLoaded === 'true'));
    await page.screenshot({ path: __dirname + '/lean-buffs-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Loot', exact: true }).click();
    await page.getByRole('button', { name: 'Pet: elixirs only', exact: true }).click();
    assert.equal(await page.getByLabel('Collector', { exact:true }).inputValue(), 'pet');
    assert.equal(await page.getByLabel('Elixirs', { exact:true }).isChecked(), true);
    assert.equal(await page.getByLabel('Gold', { exact:true }).isChecked(), false);
    await page.getByLabel('Collector', { exact:true }).selectOption('character');
    await page.getByLabel('Always include names',{exact:true}).fill('potion');
    await page.getByLabel('Always include names',{exact:true}).dispatchEvent('change');
    await page.getByRole('button',{name:'Elixirs only',exact:true}).click();
    assert.equal(await page.getByLabel('Elixirs',{exact:true}).isChecked(),true);
    for(const label of ['Gold','Potions and cure pills','Equipment','Lucky powders','Other alchemy items / stones','Other items']) assert.equal(await page.getByLabel(label,{exact:true}).isChecked(),false);
    assert.equal(await page.getByLabel('Always include names',{exact:true}).inputValue(),'');
    await page.getByRole('button',{name:'Elixirs + gold',exact:true}).click();
    assert.equal(await page.getByLabel('Gold',{exact:true}).isChecked(),true);
    await page.getByRole('button',{name:'All items',exact:true}).click();
    assert.equal(await page.getByLabel('Lucky powders',{exact:true}).isChecked(),true);
    await page.screenshot({ path: __dirname + '/lean-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => {
      const r = document.getElementById('sro-bot-lean').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth;
    }), true);
    await page.screenshot({ path: __dirname + '/lean-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    assert.equal(assets.filter(url => url.includes('/assets/packs/manifest.json')).length, 1);
    for (const image of images.slice(0, 3)) assert.equal(assets.filter(url => url.endsWith(image.transport)).length, 1);
    assert.equal(assets.filter(url => url.endsWith('/assets/test-icons/icons.pack')).length, 2); // header + image bytes
    assert.equal(assets.some(url => /skillData|missionPresentation|roster|npc\/manifest/.test(url)), false);
    await page.setViewportSize({ width:1200,height:1000 });
    await page.evaluate(() => { SROLean.world.gp.skills.push(3404); });
    await page.getByRole('button', { name:'Combat',exact:true }).click();
    await page.getByRole('button', { name:'Skills',exact:true }).click();
    await page.getByRole('button', { name:'Use imbue Thunderdragon force',exact:true }).click();
    assert.equal(await page.evaluate(() => SROLean.settings.profile.macro.imbue.id),3404);
    assert.match(await page.locator('fieldset').filter({has:page.locator('legend', {hasText:'Weapon imbue'})}).innerText(),/Lv 13/);
    await page.getByRole('button', {name:'Wardrobe',exact:true}).click();
    await page.getByRole('button', {name:'Wear Honor Sword',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Wear Test Sword',exact:true}).count(),1);
    await page.getByRole('button', {name:'Wear Honor Sword',exact:true}).click();
    await page.waitForFunction(() => SROLean.wardrobe.inv.some(it => it.refObjId === 11));
    assert.equal(await page.evaluate(() => SROLean.world.gp.inventory[0].refObjId),10);
    await page.getByLabel('Weapon / shield glow (+)',{exact:true}).fill('9');
    await page.getByLabel('Weapon / shield glow (+)',{exact:true}).dispatchEvent('change');
    await page.waitForFunction(() => SROLean.wardrobe.inv[0].plus === 9);
    await page.getByLabel('Outfit name',{exact:true}).fill('Honor glow');
    await page.getByRole('button',{name:'Save outfit',exact:true}).click();
    await page.getByRole('button',{name:'Real look',exact:true}).click();
    await page.waitForFunction(() => SROLean.wardrobe.inv[0].refObjId === 10);
    await page.getByLabel('Outfit',{exact:true}).selectOption('Honor glow');
    await page.getByRole('button',{name:'Wear outfit',exact:true}).click();
    await page.waitForFunction(() => SROLean.wardrobe.inv[0].refObjId === 11);
    await page.getByLabel('Search wardrobe',{exact:true}).fill('honor');
    assert.equal(await page.getByRole('button',{name:'Wear Test Sword',exact:true}).count(),0);
    await page.getByLabel('Search wardrobe',{exact:true}).fill('');
    await page.waitForFunction(() => [...document.getElementById('sro-bot-lean').shadowRoot.querySelectorAll('.wardrobe-item .slot')].every(s => s.dataset.iconLoaded === 'true'));
    assert.equal(await page.evaluate(() => [...document.getElementById('sro-bot-lean').shadowRoot.querySelectorAll('.wardrobe-item')].every(b => {const box=b.getBoundingClientRect(),icon=b.querySelector('img').getBoundingClientRect();return icon.left>=box.left&&icon.right<=box.right&&icon.top>=box.top&&icon.bottom<=box.bottom;})),true);
    await page.screenshot({path:__dirname+'/lean-wardrobe-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'Avatars / paid skins',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/^Wear Paid skin /}).count(),48);
    assert.equal(await page.getByLabel('Degree',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Next skins',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/^Wear Paid skin /}).count(),7);
    await page.getByRole('button',{name:'Wear Paid skin 54',exact:true}).click();
    await page.waitForFunction(() => SROLean.wardrobe.av.some(a=>a.refObjId===254));
    assert.equal(await page.evaluate(() => SROLean.world.local().avatars?.length||0),0);
    assert.equal(await page.evaluate(() => SROLean.settings.profile.wardrobe.av[2].ref),254);
    await page.getByLabel('Appearance slot',{exact:true}).selectOption('a1');
    assert.equal(await page.getByRole('button',{name:/^Wear Paid skin /}).count(),14);
    await page.getByLabel('Search wardrobe',{exact:true}).fill('Paid skin 1');
    await page.getByRole('button',{name:'Wear Paid skin 1',exact:true}).click();
    await page.waitForFunction(() => SROLean.wardrobe.av.some(a=>a.refObjId===201));
    await page.getByRole('button',{name:'Avatars / paid skins',exact:true}).click();
    assert.equal(await page.getByLabel('Search wardrobe',{exact:true}).inputValue(),'');
    await page.screenshot({path:__dirname+'/lean-paid-skins-desktop.png',fullPage:true});
    await page.evaluate(() => {
      const base64 = n => btoa(String.fromCharCode(...new Uint8Array(n)));
      testSim.postMessage({kind:'session',command:{kind:'gameplay',command:{kind:'navigation',regionId:1,bundle:{regionId:1,complete:true,
        navmesh:{regionSize:1920,tileSize:20,tilesPerAxis:96,regions:[{dx:0,dz:0,cells:{count:1},blockedTiles:base64(9216),tileCellIds:base64(36864)}]},
        objects:[{x:0,y:0,z:0,yaw:0,mesh:{vertices:[200,0,0,200,0,300],edges:[0,1,0,65535,3,0]}}]}}}});
      testCommands.length=0;
    });
    await page.getByRole('button',{name:'Walk back',exact:true}).click();
    await page.waitForFunction(() => testCommands.some(c => c.kind==='move' && c.destination.z>100));
    await page.getByRole('button',{name:'Stop all',exact:true}).click();
    assert.deepEqual(errors,[]);
    console.log('PASS browser boot, collision routing, skills and missing Thunderdragon metadata; wardrobe honor and paid avatar skins, all-slot browsing, pagination, slot mapping, search, glow, presets and real-inventory isolation; controls and desktop/mobile bounds; zero page errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
