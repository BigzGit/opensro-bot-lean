function el(tag, text, className = '') {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  node.className = className;
  return node;
}
const UI = {
  root: null, body: null, pane: null, status: null, feedback: null,
  current: 'Combat', combatTab: 'Skills', refreshers: [], lastSkillKey: '',
  toast(message, level = 'info', ms = 5000) {
    Log.add(level, message);
    if (!this.feedback) return;
    this.feedback.textContent = message;
    this.feedback.style.color = level === 'warn' || level === 'error' ? '#ffc67a' : '#b5e5bd';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { if (this.feedback) this.feedback.textContent = ''; }, ms);
  },
  showDiagnostics(text) {
    if (!this.diagnosticBox) {
      this.diagnosticBox = this.group('Bug report', el('p', 'Clipboard unavailable. Select and copy this report, then send it with a description of the problem.', 'muted'));
      this.diagnosticText = el('textarea'); this.diagnosticText.readOnly = true; this.diagnosticText.rows = 8;
      this.diagnosticText.setAttribute('aria-label', 'Bug report diagnostics');
      this.diagnosticBox.append(this.diagnosticText, this.button('Close report', () => { this.diagnosticBox.hidden = true; }));
      this.body.insertBefore(this.diagnosticBox, this.waitNote.nextSibling);
    }
    this.diagnosticBox.hidden = false; this.diagnosticText.value = text;
    this.diagnosticText.focus(); this.diagnosticText.select();
    this.toast('Clipboard unavailable—copy the selected report.');
  },
  showReport() {
    if (!this.reportBox) {
      this.reportText = el('textarea'); this.reportText.readOnly = true; this.reportText.rows = 6;
      this.reportText.setAttribute('aria-label', 'Report preview');
      this.reportDescription = el('textarea'); this.reportDescription.rows = 2; this.reportDescription.maxLength = 1000;
      this.reportDescription.setAttribute('aria-label', 'What happened? (optional)');
      this.reportDescription.addEventListener('input', () => Reports.describe(this.reportDescription.value));
      this.reportCapture = this.button('Add screenshot (optional)', () => { void Reports.capture(); });
      this.reportRemove = this.button('Remove screenshot', () => Reports.removeImage());
      this.reportSend = this.button('Send to developer', () => { void Reports.send(); });
      this.reportClose = this.button('Close', () => Reports.close());
      this.reportImage = el('img'); this.reportImage.alt = 'Screenshot preview'; this.reportImage.className = 'report-image'; this.reportImage.hidden = true;
      this.reportStatus = el('p', '', 'muted'); this.reportStatus.setAttribute('role', 'status');
      this.reportBox = this.windowFrame('Bug report', () => Reports.close(),
        el('p', 'Only Send to developer uploads this preview through Cloudflare to the developer’s Discord. Diagnostics omit names, chat and locations. Your explanation and screenshot may show private details; check them first. Nothing is sent automatically.', 'muted'),
        this.field('What happened? (optional)', this.reportDescription), this.reportText,
        this.row(this.reportCapture, this.reportRemove), this.reportImage, this.reportStatus,
        this.row(this.reportSend, this.reportClose));
      this.reportBox.classList.add('report-preview');
      this.root.append(this.reportBox);
      const width = Math.min(430, innerWidth - 8);
      this.reportBox.style.left = Math.max(4, (innerWidth - width) / 2) + 'px';
      this.reportBox.style.top = Math.max(4, Math.min(80, innerHeight - 320)) + 'px';
    }
    this.reportBox.hidden = false; this.fitWindow(this.reportBox);
    this.reportDescription.value = Reports.draft.description;
    this.reportStatus.textContent = Reports.draft.sent ? 'Report already sent. Close this preview to prepare another.' : 'Review the report before sending. Screenshot is optional.';
  },
  // A draggable in-page window in the panel's skin. Lives in the same shadow root, so typing is protected like the panel.
  windowFrame(title, onClose, ...children) {
    const win = el('section', null, 'panel dialog'), header = el('header');
    const close = this.button('×', onClose); close.className = 'fold'; close.setAttribute('aria-label', 'Close ' + title.toLowerCase());
    header.append(el('strong', title), close);
    const body = el('div', null, 'body dialog-body'); body.append(...children);
    for (const corner of ['lu', 'mu', 'ru', 'ls', 'rs', 'ld', 'md', 'rd']) win.append(el('div', null, 'frame ' + corner));
    win.append(header, body);
    this.dragBy(header, win);
    return win;
  },
  // Keep a floating window fully on screen after a resize or when it is re-shown.
  fitWindow(win) {
    if (!win || win.hidden) return;
    const r = win.getBoundingClientRect();
    win.style.left = clamp(r.left, 0, Math.max(0, innerWidth - r.width)) + 'px';
    win.style.top = clamp(r.top, 0, Math.max(0, innerHeight - r.height)) + 'px';
  },
  dragBy(header, target) {
    header.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const start = target.getBoundingClientRect(), origin = { x: e.clientX, y: e.clientY };
      header.setPointerCapture(e.pointerId);
      const move = event => {
        target.style.right = 'auto';
        target.style.left = clamp(start.left + event.clientX - origin.x, 0, Math.max(0, innerWidth - start.width)) + 'px';
        target.style.top = clamp(start.top + event.clientY - origin.y, 0, Math.max(0, innerHeight - 34)) + 'px';
      };
      const done = () => { header.removeEventListener('pointermove', move); header.removeEventListener('pointerup', done); header.removeEventListener('pointercancel', done); };
      header.addEventListener('pointermove', move); header.addEventListener('pointerup', done); header.addEventListener('pointercancel', done);
    });
  },
  button(text, action) {
    const b = el('button', text);
    b.type = 'button';
    b.addEventListener('click', () => { try { action(); } catch (e) { this.toast(e.message, 'warn'); } });
    return b;
  },
  row(...nodes) { const r = el('div', null, 'row'); r.append(...nodes); return r; },
  field(title, input) { const label = el('label', null, 'field'); input.setAttribute('aria-label', title); label.append(el('span', title), input); return label; },
  check(title, get, set) {
    const input = el('input'); input.type = 'checkbox'; input.checked = !!get();
    input.addEventListener('change', () => { set(input.checked); Settings.saveProfile(); });
    this.refreshers.push(() => { if (this.root?.activeElement !== input) input.checked = !!get(); });
    return this.field(title, input);
  },
  number(title, get, set, min, max, step = 1) {
    const input = el('input'); input.type = 'number'; input.min = min; input.max = max; input.step = step; input.value = get();
    input.addEventListener('change', () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) { input.value = get(); return; }
      const valid = clamp(Math.round(value / step) * step, min, max);
      input.value = valid; set(valid); Settings.saveProfile();
    });
    return this.field(title, input);
  },
  text(title, get, set) {
    const input = el('input'); input.type = 'text'; input.value = get(); input.placeholder = 'comma-separated names';
    input.addEventListener('change', () => { set(input.value); Settings.saveProfile(); });
    return this.field(title, input);
  },
  select(title, options, get, set) {
    const input = el('select');
    const refresh = () => {
      if (this.root?.activeElement === input) return;
      const rows = typeof options === 'function' ? options() : options;
      const signature = JSON.stringify(rows);
      if (input.dataset.options !== signature) {
        input.replaceChildren(...rows.map(([value, text]) => { const o = el('option', text); o.value = value; return o; }));
        input.dataset.options = signature;
      }
      input.value = String(get());
    };
    refresh(); this.refreshers.push(refresh);
    input.addEventListener('change', () => { set(input.value); Settings.saveProfile(); });
    return this.field(title, input);
  },
  group(title, ...children) { const b = el('fieldset'); b.append(el('legend', title), ...children); return b; },
  toggleVisibility() {
    const host = this.root?.host;
    if (host) host.hidden = !host.hidden;
  },
  mount() {
    const host = el('div'); host.id = 'sro-bot-lean';
    document.documentElement.append(host);
    this.root = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = ':host{' + Object.entries(LEAN_SKIN).map(([key, data]) => `--s-${key}:url("${data}");`).join('') + '}\n' + LEAN_CSS + '\n:host([hidden]){display:none!important}';
    const panel = el('section', null, 'panel'), header = el('header');
    const fold = this.button('−', () => { this.body.hidden = !this.body.hidden; fold.textContent = this.body.hidden ? '+' : '−'; });
    fold.className = 'fold'; fold.setAttribute('aria-label', 'Fold or unfold bot window');
    header.title = 'Shift+F7 hides or shows the whole window; F7 folds it.';
    this.updateButton = this.button('Update', () => Updates.open());
    this.updateButton.className = 'update'; this.updateButton.hidden = true;
    header.append(el('strong', 'nixxane bot ' + VERSION), this.updateButton, fold);
    Updates.render();
    this.body = el('div', null, 'body'); this.status = el('div', 'Waiting for game…', 'status'); this.status.setAttribute('role', 'status');
    const controls = this.row(this.button('Start / stop · F8', () => toggleBot()), this.button('Return & hunt', () => WalkBack.start(true)), this.button('Stop all', () => stopAll()));
    controls.classList.add('controls');
    this.nav = el('nav'); this.nav.setAttribute('aria-label', 'Bot settings');
    for (const name of ['Combat', 'Loot', 'Supplies', 'Alchemy', 'Wardrobe', 'Settings']) this.nav.append(this.button(name, () => { this.current = name; this.draw(); }));
    this.pane = el('div', null, 'pane'); this.feedback = el('div', null, 'feedback'); this.feedback.setAttribute('role', 'status');
    this.waitNote = el('div', '', 'waiting'); this.waitNote.setAttribute('role', 'status');
    this.body.append(this.status, this.waitNote, controls, this.nav, this.pane, this.feedback);
    for (const corner of ['lu', 'mu', 'ru', 'ls', 'rs', 'ld', 'md', 'rd']) panel.append(el('div', null, 'frame ' + corner));
    panel.append(header, this.body); this.root.append(style, panel);
    this.tip = el('div', null, 'skill-tip'); this.tip.hidden = true; this.root.append(this.tip);
    this.dragBy(header, host);
    W.addEventListener('resize', () => this.fitWindow(this.reportBox));
    this.draw(); this.update();
  },
  skillOptions() {
    return [[0, 'Choose a learned skill'], ...(World.gp?.skills || []).map(id => World.skill(id)).filter(s => s && !s.groundTarget).map(s => [s.id, s.name || '#' + s.id])];
  },
  skillDetails(id) {
    const s = World.skill(id);
    if (!s) return 'Skill #' + id;
    return `Lv ${s.level ?? '?'} · MP ${s.mp ?? 0}${s.mpPercent ? ' + ' + s.mpPercent + '%' : ''} · CD ${((s.cooldownMs || 0) / 1000).toFixed(1)}s`;
  },
  skillTip(id, event) {
    const s = World.skill(id);
    if (!s || !this.tip) return;
    this.tip.replaceChildren(el('strong', s.name || '#' + id), el('div', this.skillDetails(id)), el('div', s.targetRequired ? 'Target skill' : 'Self skill', 'muted'));
    this.tip.hidden = false;
    const rect = event.currentTarget.getBoundingClientRect();
    this.tip.style.left = clamp(event.clientX || rect.left, 4, Math.max(4, innerWidth - 274)) + 'px';
    this.tip.style.top = clamp((event.clientY || rect.bottom) + 16, 4, Math.max(4, innerHeight - 100)) + 'px';
  },
  skillSlot(id, action, label, selected = false, order = '') {
    const s = World.skill(id);
    const slot = this.button('', action); slot.className = 'slot' + (selected ? ' on' : '');
    slot.dataset.skill = String(id); slot.setAttribute('aria-label', label || World.skillName(id));
    slot.setAttribute('aria-pressed', String(selected));
    slot.title = `${World.skillName(id)}\n${this.skillDetails(id)}`;
    slot.append(el('span', (s?.name || '#' + id).slice(0, 3), 'fallback'), el('span', '', 'cd'), el('span', '', 'seconds'));
    if (order !== '') slot.append(el('span', order, 'order'));
    Icons.paint(slot, s?.icon);
    slot.addEventListener('pointerenter', e => this.skillTip(id, e));
    slot.addEventListener('focus', e => this.skillTip(id, e));
    slot.addEventListener('pointerleave', () => { this.tip.hidden = true; });
    slot.addEventListener('blur', () => { this.tip.hidden = true; });
    return slot;
  },
  learnedSkills(buff) {
    const best = new Map();
    for (const s of Learned.rows()) {
      if (s.missing || s.active === false || s.groundTarget || (buff ? s.targetRequired : !s.targetRequired || (s.targets !== undefined && !(s.targets & 4)))) continue;
      const group = s.group ?? s.id, previous = best.get(group);
      if (!previous || (s.level ?? 0) > (previous.level ?? 0)) best.set(group, s);
    }
    return [...best.values()];
  },
  skillList(parent, list, buff = false) {
    const strip = el('div', null, 'grid');
    list.forEach((entry, i) => {
      const id = World.bestOfGroup(entry.group, entry.id) || entry.id;
      strip.append(this.skillSlot(id, () => { list.splice(i, 1); Settings.saveProfile(); this.draw(); }, 'Remove ' + World.skillName(id), true, String(i + 1)));
    });
    parent.append(el('div', buff ? 'Active buffs — click a slot to remove' : 'Attack order — click a slot to remove', 'muted'), strip);
    if (!list.length) parent.append(el('div', buff ? 'No buffs selected. Choose from the icons below.' : 'No skills selected. Choose from the icons below.', 'empty'));
    list.forEach((entry, i) => {
      const id = World.bestOfGroup(entry.group, entry.id) || entry.id;
      const info = el('div', null, 'skill-info'); info.append(el('span', World.skillName(id), 'skill-name'), el('span', this.skillDetails(id), 'skill-detail'));
      const row = el('div', null, 'skill-row');
      const up = this.button('↑', () => { if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; Settings.saveProfile(); this.draw(); } });
      const down = this.button('↓', () => { if (i + 1 < list.length) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; Settings.saveProfile(); this.draw(); } });
      const remove = this.button('×', () => { list.splice(i, 1); Settings.saveProfile(); this.draw(); });
      up.className = down.className = remove.className = 'mini';
      up.setAttribute('aria-label', 'Move up ' + World.skillName(id)); down.setAttribute('aria-label', 'Move down ' + World.skillName(id)); remove.setAttribute('aria-label', 'Delete ' + World.skillName(id));
      row.append(this.skillSlot(id, () => {}, World.skillName(id)), info, up, down, remove); parent.append(row);
      if (buff) parent.append(this.select('Gear for ' + World.skillName(id),
        () => [[0, 'Current combat gear'], ...Settings.profile.macro.buffSets.map(s => [s.id, s.name])],
        () => entry.gearSet || 0, value => entry.gearSet = Number(value)));
    });
    const search = el('input'); search.type = 'search'; search.placeholder = 'Find a skill…'; search.setAttribute('aria-label', buff ? 'Search buff skills' : 'Search attack skills');
    const title = el('div', null, 'picker-title'); title.append(el('span', buff ? 'Learned self buffs' : 'Learned attack skills'), search);
    const grid = el('div', null, 'grid'); grid.setAttribute('aria-label', buff ? 'Buff skill icons' : 'Attack skill icons');
    for (const s of this.learnedSkills(buff)) {
      const selected = list.some(entry => entry.group === (s.group ?? s.id));
      const slot = this.skillSlot(s.id, () => {
        const index = list.findIndex(entry => entry.group === (s.group ?? s.id));
        if (index >= 0) list.splice(index, 1);
        else list.push({ id: s.id, group: s.group ?? s.id, ...(buff ? { enabled: true, mode: 'hunt', refreshS: 3 } : {}) });
        Settings.saveProfile(); this.draw();
      }, (selected ? 'Unselect ' : 'Add ') + World.skillName(s.id), selected);
      slot.dataset.search = ((s.name || '') + ' ' + s.level).toLowerCase(); grid.append(slot);
    }
    search.addEventListener('input', () => { for (const slot of grid.children) slot.hidden = !slot.dataset.search.includes(search.value.toLowerCase()); });
    parent.append(title, grid, el('p', 'Hover an icon for its name, level, MP and cooldown. Click to select; gold borders mark selected skills.', 'muted'));
    if (!grid.children.length) parent.append(el('div', 'No matching learned skills yet. Enter the game or reload if attached late.', 'empty'));
  },
  imbuePicker(parent) {
    const current = Settings.profile.macro.imbue;
    const grid = el('div', null, 'grid');
    const selected = current && (World.bestOfGroup(current.group, current.id) || current.id);
    parent.append(el('p', selected ? 'Selected: ' + World.skillName(selected) + ' · ' + this.skillDetails(selected) : 'No weapon imbue selected.', 'muted'));
    parent.append(this.button('No imbue', () => { Settings.profile.macro.imbue = null; Settings.saveProfile(); this.draw(); }));
    for (const s of this.learnedSkills(true)) grid.append(this.skillSlot(s.id, () => {
      Settings.profile.macro.imbue = { id: s.id, group: s.group ?? s.id };
      Settings.saveProfile(); this.draw();
    }, 'Use imbue ' + World.skillName(s.id), current?.group === (s.group ?? s.id)));
    parent.append(grid, el('p', 'Choose your weapon imbue here (for example Thunderdragon Force). The highest learned level in each group is shown and used automatically.', 'muted'));
  },
  draw() {
    if (!this.pane) return;
    if (this.tip) this.tip.hidden = true;
    this.lastSkillKey = this.skillKey();
    // Rebuilding the pane resets scrolling; keep the position when redrawing the same view.
    const view = [this.current, this.combatTab, this.rotationClass].join('|'), scroll = view === this.drawnView ? this.pane.scrollTop : 0;
    this.drawnView = view;
    this.refreshers = []; this.pane.replaceChildren();
    [...this.nav.children].forEach(b => b.setAttribute('aria-selected', String(b.textContent === this.current)));
    const H = () => Settings.profile.hunt, M = () => Settings.profile.macro, P = () => Settings.profile.potion, C = () => Restock.cfg();
    if (this.current === 'Combat') {
      const subtabs = el('div', null, 'subtabs');
      for (const name of ['Skills', 'Buffs & imbue', 'Hunt area']) {
        const tab = this.button(name, () => { this.combatTab = name; this.draw(); });
        tab.setAttribute('aria-selected', String(name === this.combatTab)); subtabs.append(tab);
      }
      this.pane.append(subtabs);
      if (this.combatTab === 'Hunt area') {
      this.pane.append(this.group('Hunting area',
        this.button('Set hunting spot here', () => { if (World.inWorld() && Hunt.setCenter()) this.toast('Hunting spot saved.'); }),
        this.number('Hunt radius (m)', () => H().radius / 10, v => H().radius = v * 10, 5, 200),
        this.number('Chase distance (m)', () => H().chase / 10, v => H().chase = v * 10, 10, 300),
        this.check('Return when idle', () => H().returnToCenter, v => H().returnToCenter = v),
        this.check('Avoid other players’ targets', () => H().avoidKs, v => H().avoidKs = v),
        this.number('Minimum mob level (0 = any)', () => H().levelMin, v => H().levelMin = v, 0, 140),
        this.number('Maximum mob level (0 = any)', () => H().levelMax, v => H().levelMax = v, 0, 140),
        this.text('Only these mobs', () => H().include, v => H().include = v),
        this.text('Skip these mobs', () => H().exclude, v => H().exclude = v)
      ));
      const classes = this.group('Monster classes');
      for (const key of Object.keys(H().classes)) classes.append(this.check(key === 'titan' ? 'titan (uses Unique rotation)' : key, () => H().classes[key], v => H().classes[key] = v));
      this.pane.append(classes);
      }
      if (this.combatTab === 'Skills') {
      this.rotationClass ||= 'normal';
      const classes = el('div', null, 'class-tabs');
      for (const key of CLASS_KEYS) {
        const tab = this.button('', () => { this.rotationClass = key; this.draw(); });
        tab.setAttribute('aria-label', 'Rotation for ' + key); tab.setAttribute('aria-selected', String(key === this.rotationClass));
        const icon = el('i'); icon.style.backgroundImage = `var(--s-tw_${key})`;
        tab.append(icon, el('span', key)); classes.append(tab);
      }
      const rotation = this.group('Attack rotation', classes,
        this.check('Empty classes use Normal rotation', () => M().fallbackToNormal, v => M().fallbackToNormal = v),
        this.check('Use normal attacks', () => M().normalAttack, v => M().normalAttack = v));
      this.skillList(rotation, M().rotations[this.rotationClass]); this.pane.append(rotation);
      this.pane.append(this.group('Combat options',
        this.select('Berserk', [['off', 'Off'], ['strong', 'Champion and above'], ['always', 'Whenever full']], () => M().berserk, v => M().berserk = v),
        this.number('Skill gap (ms)', () => M().castGapMs, v => M().castGapMs = v, 150, 2000, 50)));
      }
      if (this.combatTab === 'Buffs & imbue') {
      BuffGear.draw(this.pane);
      const buffs = this.group('Buffs'); this.skillList(buffs, M().buffs, true);
      this.pane.append(buffs);
      const imbue = this.group('Weapon imbue'); this.imbuePicker(imbue); this.pane.append(imbue);
      }
    } else if (this.current === 'Loot') {
      const L = () => H().pickup;
      const options = this.group('Collection');
      options.append(this.select('Collector', [['character', 'Character'], ['pet', 'Pickup pet']], () => L().collector, v => { L().collector = v; Loot.reset(); }),
);
      options.append(this.check('Chime when pet bag is full', () => L().petFullSound, v => { L().petFullSound = v; Loot.fullAlert = null; }), this.button('Test pet chime', () => Sound.test()),
        this.check('Chime and notice when a SoX item is picked up', () => L().soxSound, v => L().soxSound = v), this.button('Test SoX chime', () => Sound.test('sox')));
      this.petNote = el('p', '', 'muted'); options.append(this.petNote);
      options.append(this.row(...[['Elixirs only','elixirs'],['Elixirs + gold','elixirs-gold'],['All items','all']].map(([label,mode]) => this.button(label, () => { Loot.preset(mode); this.draw(); }))));
      for (const [key, label] of [['enabled', 'Collect drops'], ['soxOnly', 'Equipment: only SoX (Star / Moon / Sun)'], ['gold', 'Gold'], ['potions', 'Potions and cure pills'], ['equipment', 'Equipment'], ['elixirs', 'Elixirs'], ['powders', 'Lucky powders'], ['alchemy', 'Other alchemy items / stones'], ['others', 'Other items'], ['afterKillOnly', 'Finish current fight before character pickup']]) options.append(this.check(label, () => L()[key], v => L()[key] = v));
      options.append(this.number('Pickup radius (m)', () => L().radius / 10, v => L().radius = v * 10, 3, 100),
        this.number('Retries after first attempt', () => L().retries, v => L().retries = v, 0, 3),
        this.text('Always include names', () => L().include, v => L().include = v),
        this.text('Exclude names', () => L().exclude, v => L().exclude = v),
        el('p', 'Pets collect during combat regardless of the finish-fight setting. Inventory transactions and potion priority can briefly delay pet requests. Equipment: only SoX takes Star, Moon and Sun gear and leaves plain equipment, even when Equipment or an Always include name matches it; other items follow their own switches. It needs the item catalogue, which loads automatically. Presets clear Always include names; exclusions still apply. Other items excludes the separate categories above. Ownership and bag capacity always apply. Failed pickups use a backoff.', 'muted'));
      this.pane.append(options);
    } else if (this.current === 'Supplies') {
      const pots = this.group('Automatic potion use', this.check('Use potions automatically', () => P().enabled, v => P().enabled = v));
      this.speedNote = el('p', '', 'muted');
      pots.append(this.check('Use beginner +100% speed scroll automatically', () => P().speedScroll, v => { P().speedScroll = v; SpeedScroll.reset(); }),
        el('p', 'Uses only the beginner scroll during hunting or travel when no movement-speed buff is active. Works during combat casts; potions have priority. Waits for buff confirmation and stops retrying after three unconfirmed attempts.', 'muted'), this.speedNote);
      for (const kind of ['hp', 'mp']) pots.append(this.check('Use ' + kind.toUpperCase(), () => P()[kind].on, v => P()[kind].on = v), this.number(kind.toUpperCase() + ' below (%)', () => P()[kind].pct, v => P()[kind].pct = v, 5, 95));
      pots.append(this.check('Use vigor potions', () => P().vigor.on, v => P().vigor.on = v), this.check('Use cure pills', () => P().cure.on, v => P().cure.on = v));
      this.pane.append(pots);
      const townOn = Town.cfg().enabled;
      const shop = this.group('Potion restock');
      if (townOn) shop.append(el('p', 'The town cycle is on: every trip buys X-Large potions at the saved merchant, so walking-route restock and merchant recording are hidden. Low-stock and refill amounts below still apply.', 'muted'));
      else shop.append(this.check('Auto buy while hunting', () => C().enabled, v => C().enabled = v),
        this.row(this.button('Record from merchant', () => Restock.beginRecording()), this.button('Finish at hunt spot', () => Restock.finishRecording()), this.button('Cancel route', () => Restock.cancelRecording())),
        el('p', 'Open the potion shop, start recording, close the shop, walk to your hunting spot, then finish recording. Do not teleport while recording.', 'muted'));
      for (const kind of ['hp', 'mp']) {
        shop.append(this.check('Buy ' + kind.toUpperCase(), () => C()[kind].on, v => C()[kind].on = v));
        if (!townOn) shop.append(this.select(kind.toUpperCase() + ' potion', () => [[0, 'Record a merchant route first'], ...C().offers.filter(o => o.kind === kind).map(o => [o.refObjId, o.name])], () => C()[kind].refObjId, v => C()[kind].refObjId = Number(v)));
        shop.append(this.number('Low stock ≤', () => C()[kind].low, v => C()[kind].low = v, 0, 9999), this.number(kind.toUpperCase() + ' refill to', () => C()[kind].target, v => C()[kind].target = v, 1, 10000));
      }
      shop.append(this.check('Buy abnormal pills (best)', () => C().cure.on, v => C().cure.on = v),
        this.number('Pills low stock ≤', () => C().cure.low, v => C().cure.low = v, 0, 9999),
        this.number('Pills refill to', () => C().cure.target, v => C().cure.target = v, 1, 10000),
        el('p', 'Buys only Special Universal Pill (small), the strongest universal cure. No cheaper substitute. Uses the same refill trips as HP/MP. Use cure pills above controls automatic use.', 'muted'));
      shop.append(el('p', 'Refill targets are total potion counts, including what is already in your bag. Used for low-supply, full-bag and revival trips, and walking-route restock when the town cycle is off. Set MP refill to 1000 for 1,000 MP potions. Changes apply to the next trip.', 'muted'));
      this.pane.append(shop);
      const town = () => Town.cfg();
      const services = this.group('Hotan scroll town cycle',
        this.check('Use return scroll → town services → reverse return', () => town().enabled, v => { town().enabled = v; this.draw(); }),
        this.check('Revive in town and reverse to last scroll point', () => town().revive, v => town().revive = v),
        this.check('Deposit SoX gear in the warehouse (character and pet bags)', () => town().storeSox, v => town().storeSox = v),
        this.check('Return when pickup pet is nearly full', () => town().petFull, v => town().petFull = v),
        this.number('Pet free slots ≤', () => town().petFree, v => town().petFree = v, 0, 10),
        this.number('Town arrival tolerance (m)', () => town().arrivalRadius / 10, v => town().arrivalRadius = v * 10, 10, 150),
        el('p', 'Bind your recall to Hotan in the game. While stopped, save the arrival point where a return scroll places you. Stand near, select and save the warehouse, potion merchant, repair merchant and world statue / teleport. Open the potion shop before saving its merchant. Saves your standing position for each approach. Uses collision-aware walking between services. Overrides the recorded walking restock while enabled.', 'muted'));
      for (const [role, label] of [['arrival', 'Arrival point'], ['storage', 'Warehouse'], ['vendor', 'Potion merchant'], ['smith', 'Repair merchant'], ['gate', 'World statue / teleport']]) services.append(
        this.row(this.button('Save ' + label.toLowerCase(), () => Town.save(role)), el('span', town()[role]?.name || (town()[role] ? 'Saved' : 'Not saved'), 'muted')));
      services.append(el('p', 'Pet loot: store elixirs, and Star / Moon / Sun gear when SoX deposit is on (needs the saved warehouse; SoX gear in your own bag goes in too, all other character items stay). Nothing is deposited right after pickup, only on the next town trip. Sell other unprotected pet items at the saved weapon / repair merchant before repairing. Other seal/rare equipment and equipment with unknown rarity stays in the pet. Ordinary equipment is sold regardless of + or blue options. Existing character bag items are never sold.', 'muted'));
      services.append(this.text('Keep in pet (names)', () => town().keep, v => town().keep = v),
        el('p', 'Town buys X-Large potions using the Buy HP/MP switches, low-stock thresholds and refill counts above. Keep each low-stock threshold below its refill target. Potion selections apply to walking-route restock. Returns when the character bag has at most one free slot. Free at least two slots before hunting again; existing character items stay protected. Revival uses the saved town services and a reverse scroll, without using a return scroll in town. Pet loot passes through one reserved character bag slot. Potions, return/reverse scrolls, beginner speed scrolls and matching Keep names are protected. Refills travel scrolls to two where sold for gold; otherwise carry spares. F8 cancels.', 'muted'));
      this.townNote = el('p', Town.status(), 'muted'); services.append(this.townNote); this.pane.append(services);
    } else if (this.current === 'Alchemy') {
      Alchemy.draw();
    } else if (this.current === 'Wardrobe') {
      LeanWardrobe.draw(this.pane);
    } else {
      Stats.draw(this.pane);
      this.pane.append(this.group('Behaviour',
        ...(Town.autoRevive() ? [el('p', 'On death: the town cycle revives you in town and reverses back (Supplies → Hotan scroll town cycle).', 'muted')]
          : [this.select('On death', [['stop', 'Stop'], ['wait', 'Wait'], ['revive', 'Revive and walk back']], () => H().onDeath, v => H().onDeath = v)]),
        this.check('Rest when low', () => H().sit.enabled, v => { H().sit.enabled = v; this.draw(); }),
        ...(H().sit.enabled ? [
          this.number('Rest below HP (%)', () => H().sit.hpBelow, v => H().sit.hpBelow = v, 0, 95),
          this.number('Rest below MP (%)', () => H().sit.mpBelow, v => H().sit.mpBelow = v, 0, 95),
          this.number('Stand up at (%)', () => H().sit.resumeAt, v => H().sit.resumeAt = v, 30, 100)] : []),
        this.check('Stop when HP potions run out', () => H().stopNoHpPotion, v => H().stopNoHpPotion = v),
        this.check('Stop when bag is full', () => H().stopInvFull, v => H().stopInvFull = v),
        this.number('Manual control pause (s)', () => H().manualPauseS, v => H().manualPauseS = v, 1, 30)));
      this.stuckNote = el('p', AntiStuck.status(), 'muted');
      this.pane.append(this.group('Anti-stuck',
        this.check('Recover when hunting makes no progress', () => H().antiStuck.enabled, v => H().antiStuck.enabled = v),
        this.number('No progress for (minutes)', () => H().antiStuck.minutes, v => H().antiStuck.minutes = v, 1, 30),
        this.number('Stop after failed recoveries', () => H().antiStuck.maxRecoveries, v => H().antiStuck.maxRecoveries = v, 1, 10),
        this.stuckNote,
        el('p', 'Progress means a confirmed kill, XP, gold, a pickup, or damage to your target. Resting, buffing, looting, shopping and town trips do not count against you. First recovery drops the current target; the next ones walk back to the saved hunting spot; after the last one hunting stops.', 'muted')));
      const party = () => Settings.profile.party;
      this.partyNote = el('p', '', 'muted');
      this.pane.append(this.group('Party',
        this.check('Auto-recruit', () => party().autoRecruit, v => { party().autoRecruit = v; Party.reset(); }),
        this.text('Party listing title', () => party().title, v => party().title = v),
        this.number('Party minimum level', () => party().min, v => party().min = v, 1, 90),
        this.number('Party maximum level', () => party().max, v => party().max = v, 1, 90),
        this.select('Party purpose', [[0, 'Hunting'], [1, 'Quest'], [2, 'Trade'], [3, 'Thief']], () => party().purpose, v => party().purpose = Number(v)),
        this.check('Share EXP in new parties', () => party().expShare, v => party().expShare = v),
        this.check('Share items in new parties', () => party().itemShare, v => party().itemShare = v),
        this.partyNote,
        el('p', 'Auto-recruit registers your saved listing and accepts applicants whenever enabled, even with hunting stopped. Restores missing listings when space opens and retries unconfirmed registrations after fresh idle state, at most once every 30 seconds. Existing listings and party sharing settings are preserved; edits apply to the next new listing. Turning this off leaves the current listing in place.', 'muted'),
        this.check('Auto-accept party-matching joins', () => Settings.profile.party.autoAcceptMatching, v => Settings.profile.party.autoAcceptMatching = v),
        el('p', 'Accepts applications to your own listing while you are the leader or forming a new party. Works while hunting is stopped; turn this switch off to stop accepting. Ordinary invitations are left to you.', 'muted'),
        this.check('Accept resurrection from party members', () => party().acceptRes, v => party().acceptRes = v),
        el('p', 'When you are dead and a party member casts Rebirth on you, the bot answers Yes. Works during hunting and while stopped; resurrection offers from other players are left to you.', 'muted'),
        this.check('Auto-resurrect party members', () => party().autoRes, v => { party().autoRes = v; Resurrect.reset(); }),
        this.number('Maximum res distance from hunt spot (m)', () => party().resRadius / 10, v => party().resRadius = v * 10, 1, 100),
        el('p', 'Works during hunting and while stopped. Walks into skill range for visible dead members within the maximum radius, casts Rebirth, then returns. During hunting the radius is measured from the saved hunt spot; while stopped it uses your starting position. Collision data is required for walking. Travel stops after 30 seconds or 12 seconds without progress per leg. The member must accept the revival. Travel, shopping and manual control take priority.', 'muted')));
      AutoMastery.draw(this.pane);
      this.pane.append(this.group('Profiles', el('p', 'Settings are saved separately for each character.', 'muted'),
        this.button('Export nixxane bot settings', () => {
          const url = URL.createObjectURL(new Blob([JSON.stringify({ app: 'sro-bot-lean', version: VERSION, profile: Settings.profile }, null, 2)], { type: 'application/json' }));
          const link = el('a'); link.href = url; link.download = 'nixxane-bot-settings.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        })));
      this.pane.append(this.group('Bug reports', el('p', 'Preview diagnostics and optionally a screenshot, then send them to the developer. Nothing sends automatically.', 'muted'), this.button('Send bug report', () => Reports.open())));
      this.logs = el('pre'); this.pane.append(this.group('Recent activity', this.logs));
    }
    this.update();
    this.pane.scrollTop = scroll;
  },
  skillKey() {
    return (World.gp?.skills || []).map(id => { const s = World.skill(id); return `${id}:${s?.name}:${s?.icon}:${s?.level}`; }).join('|');
  },
  update() {
    Stats.sample(); Stats.render();
    Alchemy.refresh();
    if (this.current === 'Combat' && this.combatTab === 'Buffs & imbue' && BuffGear.note) BuffGear.note.textContent = BuffGear.status();
    Reports.render();
    const diagnosticState = Diagnostics.sample();
    if (this.waitNote) this.waitNote.textContent = Diagnostics.lines(diagnosticState);
    if (this.townNote) this.townNote.textContent = Town.status();
    if (this.current === 'Settings' && AutoMastery.note) AutoMastery.note.textContent = AutoMastery.status();
    if (this.current === 'Settings' && this.stuckNote) this.stuckNote.textContent = AntiStuck.status();
    if (this.current === 'Settings' && this.partyNote) {
      const notes = [Settings.profile.party.autoRecruit ? Party.message : 'Auto-recruit off.'];
      if (Settings.profile.party.autoRes) notes.push(Resurrect.message);
      this.partyNote.textContent = notes.join(' ');
    }
    if (!this.status) return;
    if (this.current === 'Supplies' && this.speedNote) this.speedNote.textContent = SpeedScroll.message;
    if (this.current === 'Loot' && this.petNote) { this.petNote.hidden = !Loot.petMode(); this.petNote.textContent = Loot.petStatus(); }
    Learned.repair();
    if (this.current === 'Combat' && this.lastSkillKey !== this.skillKey()) { this.draw(); return; }
    const me = World.me(), center = Settings.profile.hunt.center;
    const distance = center ? dist2D(World.pose(), center) : Infinity;
    this.status.textContent = `${World.charName || 'No character'} · ${World.inWorld() ? Controller.mode : World.phase}\nHP ${Math.round(me.hpPct)}% · MP ${Math.round(me.mpPct)}% · Potions ${Potion.count('hp')}/${Potion.count('mp')} · Pickups ${Stats.values.loot}\nHunting spot: ${Number.isFinite(distance) ? Math.round(distance / 10) + ' m away' : center ? 'another region' : 'not saved'}${Restock.recording ? '\nRecording route: ' + Restock.draft.route.length + ' points' : ''}`;
    if (Town.cfg().enabled) this.status.textContent += '\n' + Town.status();
    this.refreshers.forEach(refresh => refresh());
    for (const slot of this.pane.querySelectorAll('.slot[data-skill]')) {
      const id = Number(slot.dataset.skill), left = World.cooldownLeft(id), total = World.skill(id)?.cooldownMs || 0;
      slot.querySelector('.cd').style.setProperty('--p', total && left > 0 ? Math.min(100, left / total * 100) + '%' : '0%');
      slot.querySelector('.seconds').textContent = left > 0 ? String(Math.ceil(left / 1000)) : '';
    }
    if (this.current === 'Settings' && this.logs) this.logs.textContent = Log.lines.slice(-12).map(l => l.text).join('\n');
  },
};
