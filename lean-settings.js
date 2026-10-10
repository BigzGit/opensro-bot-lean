const CLASS_KEYS = ['normal', 'champion', 'giant', 'party', 'elite', 'unique'];
const DEFAULT_PROFILE = {
  party: { autoAcceptMatching: false, autoRecruit: false, autoRes: false, title: 'Hunting party', min: 1, max: 90, purpose: 0, expShare: true, itemShare: true },
  wardrobe: { on: true, phantom: true, realAnim: true, hideAvatars: false,
    eq: {}, av: {}, pet: { atk: 0, pick: 0, mount: 0 }, presets: {}, undo: null },
  macro: {
    rotations: { normal: [], champion: [], giant: [], party: [], elite: [], unique: [] },
    fallbackToNormal: true, normalAttack: true, buffs: [], imbue: null,
    imbueBeforeAttack: true, berserk: 'strong', minMpPct: 0, castGapMs: 350,
  },
  potion: {
    enabled: true, hp: { on: true, pct: 60 }, mp: { on: true, pct: 40 },
    vigor: { on: true, hpPct: 30, mpPct: 15 }, cure: { on: true },
    prefer: { hp: 0, mp: 0, vigor: 0, cure: 0 }, delayMs: 350,
    restock: {
      enabled: false, vendor: null, route: [], offers: [],
      hp: { on: true, refObjId: 0, low: 20, target: 200 },
      mp: { on: true, refObjId: 0, low: 20, target: 200 },
    },
  },
  hunt: {
    center: null, radius: 400, chase: 700, returnToCenter: true,
    classes: { normal: true, champion: true, giant: true, party: false, elite: false, unique: false, titan: false },
    levelMin: 0, levelMax: 0, include: '', exclude: '', priority: 'attackers', avoidKs: true,
    targetTimeoutS: 25,
    pickup: { enabled: true, gold: true, potions: true, equipment: true, elixirs: true, powders: true, alchemy: true, others: true,
      collector: 'character', petFullSound: true, include: '', exclude: '', radius: 300, afterKillOnly: true, retries: 2 },
    sit: { enabled: true, hpBelow: 35, mpBelow: 20, resumeAt: 90 },
    onDeath: 'stop', stopNoHpPotion: false, stopInvFull: false,
    playerAlert: { enabled: false, radius: 250, pause: false }, manualPauseS: 6,
  },
};
// Preserve only bot settings. The original assistant's settings are never changed.
function botProfile(input) {
  const result = deepMerge(DEFAULT_PROFILE, {});
  if (!input || typeof input !== 'object') return result;
  for (const key of ['macro', 'potion', 'hunt', 'wardrobe', 'party']) {
    if (!input[key] || typeof input[key] !== 'object') continue;
    for (const field of Object.keys(DEFAULT_PROFILE[key])) {
      if (field in input[key]) result[key][field] = deepMerge(DEFAULT_PROFILE[key][field], input[key][field]);
    }
  }
  // New categories inherit the old Other items switch, preserving existing selection.
  const pickup = input.hunt?.pickup;
  for (const key of ['elixirs', 'powders', 'alchemy']) {
    if (pickup && !(key in pickup)) result.hunt.pickup[key] = pickup.others ?? true;
  }
  return result;
}
const Settings = {
  profileKey: 'profile:default',
  profile: botProfile(Store.get('profile:default', null)),
  saveProfile: debounce(() => Store.set(Settings.profileKey, Settings.profile), 250),
  useCharacter(name) {
    const key = name ? 'profile:' + name : 'profile:default';
    if (key === this.profileKey) return;
    Store.set(this.profileKey, this.profile);
    this.profileKey = key;
    this.profile = botProfile(Store.get(key, null));
    bus.emit('profile');
  },
  importOriginal() {
    try {
      const raw = W.localStorage.getItem('sroAsistan:v7:' + this.profileKey)
        || W.localStorage.getItem('sroAsistan:v7:profile:default');
      if (!raw) return UI.toast('No original bot profile was found.', 'warn');
      stopAll();
      this.profile = botProfile(JSON.parse(raw));
      // The improved loot controller defaults to finishing its fight first.
      this.profile.hunt.pickup.afterKillOnly = true;
      this.saveProfile();
      bus.emit('profile');
      UI.toast('Imported combat, potion and hunting settings. Review them before starting.');
    } catch (e) { UI.toast('Could not import profile: ' + e.message, 'warn'); }
  },
};
const Stats = {
  values: { loot: 0, casts: 0, potions: 0, deaths: 0 },
  count(kind) { if (kind in this.values) this.values[kind]++; },
  huntStart() {}, huntStop() {},
};
// Only the pet-full alert is audible; existing combat/UI calls stay silent.
const Sound = {
  ctx: null,
  unlock() {
    try {
      this.ctx ||= new (W.AudioContext || W.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch {}
  },
  play(kind) {
    if (kind !== 'pet-full') return false;
    try {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return false;
      [659.25, 830.61, 987.77].forEach((frequency, i) => {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        const at = ctx.currentTime + i * 0.18;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.12, at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
        oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at); oscillator.stop(at + 0.6);
      });
      return true;
    } catch { return false; }
  },
  async test() {
    this.unlock();
    try { if (this.ctx?.state === 'suspended') await this.ctx.resume(); } catch {}
    if (!this.play('pet-full')) UI.toast('Sound is blocked by the browser. Allow audio for this site and try again.', 'warn');
  },
};
