"""Build the bot-only userscript from reviewed core code and small lean modules."""
from pathlib import Path
import re
import runpy

base = Path(__file__).resolve().parent
runpy.run_path(str(base / 'build-wardrobe.py'))
original_path = base / 'vendor' / 'bot.js'
if not original_path.exists():
    original_path = base / 'bot.js'
original = original_path.read_text(encoding='utf-8-sig')

def section(start, end):
    assert original.count(start) == 1, start
    return original[original.index(start):original.index(end, original.index(start))].rstrip()

utils = section('const now =', '// ---------------------------------------------------------------------------\n// Settings:')
utils = utils.replace("prefix: 'sroAsistan:v7:'", "prefix: 'sroBotLean:v1:'")
geometry = section('const SECTOR =', '// ---------------------------------------------------------------------------\n// Worker hook.')
hook = section('const Hook =', '// ---------------------------------------------------------------------------\n// Display rewriters:')
# Wardrobe rewrites only renderer copies; the mirror retains real items.
hook = hook.replace("          if (!(Hook.probe.passSelect && inner && inner.kind === 'select')) return undefined;", "          return undefined;")
world = section('const TRANSIENT_PHASES =', '// ---------------------------------------------------------------------------\n// Probe:')
display = section('const Display =', '// ---------------------------------------------------------------------------\n// World mirror:')
commands = section('const MIN_GAP =', '// ---------------------------------------------------------------------------\n// Assets.')
# Remove chat, GM actions, and companion item targeting from the compact command layer.
a = commands.index('  // opts (optional):')
b = commands.index('  action(id)', a)
commands = commands[:a] + '''  itemUse(slot) {
    const gp = World.gp;
    const item = gp?.inventory?.find(i => i.slot === slot);
    if (!item || gp.inventoryPending || World.isDead() || !this.spaced('item-use') || ItemType.useTarget(item.typeFlags)) return false;
    return this.raw({ kind: 'item-use', slot }, 'Use: ' + (item.name || item.refObjId));
  },

''' + commands[b:]
a = commands.index('  // The game update removed')
b = commands.index('  rebirth(choice)', a)
commands = commands[:a] + commands[b:]
commands = commands.replace("  chat: 1200,\n  'gm-command': 600,\n", '')
commands = commands.replace('return now() - (this.last[kind] || 0) >= gap;', 'return now() - (this.last[kind] ?? -Infinity) >= gap;')
ticker = section('const Ticker =', '// ---- Potion ')
potion = section('const Potion =', '// Same rule as the client')
combat = section('const Combat =', '// ---- Assist:')
combat = combat.replace('return Assets.skillMeta.get(id) || null;', 'return World.skill(id) || null;')
combat = combat.replace('return !m || !m.mp || m.mp <= me.mp;', 'return !m || (m.mp ?? 0) + Math.trunc(me.maxMp * (m.mpPercent ?? 0) / 100) <= me.mp;')
attackable = section('const isAttackableMob =', '// Automatic potion shopping.')
hunt = section('const Hunt =', '// Independent return command:') if '// Independent return command:' in original else section('const Hunt =', '// Independent return command using')
hunt = hunt.replace('    Assets.skills(this.knownSkillIds());', '')
hunt = hunt[:hunt.index('  lootAllowed(e) {')] + hunt[hunt.index('  playerCheck() {'):]
hunt = hunt[:hunt.index('  tick() {')] + hunt[hunt.index('  currentTarget() {'):]
hunt = hunt.replace("    this.state = 'start';", "    Loot.reset();\n    this.state = 'start';")
hunt = hunt.replace('    this.running = false;', '    Loot.suspend();\n    this.running = false;')
hunt = hunt.replace('if (Restock.trip && World.inWorld() && !World.isDead()) Cmd.move(World.pose());', 'if (World.inWorld() && !World.isDead()) Cmd.move(World.pose());')
restock = (base / 'restock.js').read_text(encoding='utf-8').split('  build() {')[0] + '};'
restock = restock.replace("    if (distance < t.best - 3) { t.best = distance; t.progressAt = now(); }", "    if (!t.lastPose || dist2D(t.lastPose, World.pose()) > 3) { t.lastPose = { ...World.pose() }; t.progressAt = now(); }")
restock = restock.replace("    if (World.isSitting()) {", "    const move = Navigation.next(t, dest, true);\n    if (move.error && !move.waiting) return this.fail(move.error);\n    if (move.waiting) return false;\n    if (World.isSitting()) {")
restock = restock.replace('Cmd.move(dest)', 'Cmd.move(move.point)')
walkback = (base / 'lean-walkback.js').read_text(encoding='utf-8')
# Keep only the original image-pack reader, not its skill/item/wardrobe catalogues.
icon_loader = section('function assetLoaderMain(self)', '\nconst Assets = {')
icon_loader = icon_loader[:icon_loader.index('  // ---- skillData.json')]
icon_loader = icon_loader.replace("const OWN_CACHE = 'sro-asistan-assets-v1';", "const OWN_CACHE = 'sro-lean-icons-v1';")
icon_loader += '''  self.onmessage = async e => {
    const msg = e.data || {};
    if (msg.op === 'init') { ORIGIN = String(msg.origin || ''); self.postMessage({ ready: true }); return; }
    try {
      const allowed = ['/assets/data/skillData.json', '/assets/text/textdataname.en.json', '/assets/data/missionPresentation.json', '/assets/char/roster.json', '/assets/npc/manifest.json'];
      if (msg.op !== 'blob' && !(msg.op === 'json' && allowed.includes(msg.path))) throw fail('op', 'Unsupported asset request');
      const { bytes, mime } = await bytesOf(msg.path);
      const result = msg.op === 'json' ? JSON.parse(new TextDecoder().decode(bytes)) : new Blob([bytes], { type: mime || 'image/png' });
      self.postMessage({ id: msg.id, ok: true, result });
    } catch (e) { self.postMessage({ id: msg.id, ok: false, error: e.message, code: e.code }); }
  };
}'''
skin_source = section('const SKIN = {', '\nconst SKIN_SIZE =')
skin = __import__('json').loads(skin_source[len('const SKIN = '):].rstrip(';'))
skin_keys = ['f_lu','f_mu','f_ru','f_ls','f_rs','f_ld','f_md','f_rd',
             'ib_lu','ib_mu','ib_ru','ib_ls','ib_rs','ib_ld','ib_md','ib_rd',
             'tile_a','btn','btn_f','btn_p','btn_d','tab_on','tab_off','stab_on','stab_off',
             'chk_on','chk_off','scr_bar','scr_btn','scr_btn_f','close','close_f',
             'bar','bar_l','bar_r','bars','bars_l','bars_r','tw_normal','tw_champion',
             'tw_giant','tw_party','tw_elite','tw_unique','ic_attack','ic_recovery','ic_sit','ic_autoget']
skin = 'const LEAN_SKIN = ' + __import__('json').dumps({k: skin[k] for k in skin_keys}, separators=(',', ':')) + ';'
skin += '\nconst LEAN_CSS = ' + __import__('json').dumps((base / 'lean-skin.css').read_text(encoding='utf-8')) + ';'
header = '''// ==UserScript==
// @name         OpenSRO Bot Lean
// @namespace    https://opensro.online/
// @version      1.2.4
// @updateURL    https://raw.githubusercontent.com/nixxane/opensro-bot-lean/main/bot.lean.meta.js
// @downloadURL  https://raw.githubusercontent.com/nixxane/opensro-bot-lean/main/bot.lean.user.js
// @description  Combat, reliable looting, potions, restocking and walk-back in one compact panel.
// @author       Adapted from TSK's OpenSRO Assistant
// @match        https://opensro.online/play*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @inject-into  page
// @noframes
// ==/UserScript==

(function () {
'use strict';
const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
if (W.__SRO_ASISTAN__ || W.__SRO_LEAN__) {
  console.warn('[SRO Lean] Another SRO assistant is active. Disable it and reload to use Lean.');
  return;
}
const VERSION = '1.2.4';
const APP = { version: VERSION };
Object.defineProperty(W, '__SRO_LEAN__', { value: APP });
Object.defineProperty(W, '__SRO_ASISTAN__', { value: APP });
const T = (tr, en) => en ?? tr;
'''
parts = [header, utils, (base / 'lean-settings.js').read_text(encoding='utf-8'), geometry,
         hook, display, world, commands, ticker, potion, attackable, combat, restock, hunt,
         (base / 'lean-navigation.js').read_text(encoding='utf-8'), walkback,
         (base / 'lean-loot.js').read_text(encoding='utf-8'),
         (base / 'lean-controller.js').read_text(encoding='utf-8'),
         skin, icon_loader, (base / 'lean-icons.js').read_text(encoding='utf-8'),
         (base / 'lean-skills.js').read_text(encoding='utf-8'),
         (base / 'lean-wardrobe-core.js').read_text(encoding='utf-8'),
         (base / 'lean-wardrobe.js').read_text(encoding='utf-8'),
         (base / 'lean-ui.js').read_text(encoding='utf-8'),
         (base / 'lean-boot.js').read_text(encoding='utf-8'), '})();\n']
output = '\n\n'.join(parts)
(base / 'bot.lean.user.js').write_text(output, encoding='utf-8', newline='\n')
(base / 'bot.lean.meta.js').write_text(header[:header.index('// ==/UserScript==') + len('// ==/UserScript==')] + '\n', encoding='utf-8', newline='\n')
print(f'Built bot.lean.user.js: {len(output.encode("utf-8")):,} bytes, {len(output.splitlines()):,} lines')
