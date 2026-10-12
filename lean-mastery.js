// Raises the chosen masteries with skill points, one confirmed level at a time. Uses the game's own
// rules: a mastery cannot pass the character level or 120, level 0 is free, otherwise the cost is the
// table price of the CURRENT mastery level. Works while hunting is stopped; never touches skills.
const MASTERY_NAMES = { 257: 'Bicheon', 258: 'Heuksal', 259: 'Pacheon', 273: 'Cold', 274: 'Lightning', 275: 'Fire', 276: 'Force',
  513: 'Warrior', 514: 'Wizard', 515: 'Rogue', 516: 'Warlock', 517: 'Bard', 518: 'Cleric' };
const AutoMastery = {
  pending: null, blocked: new Map(), message: 'Auto mastery off.', lastAt: -Infinity, note: null,
  cfg() { return Settings.profile.mastery; },
  name(id) { return MASTERY_NAMES[id] || 'Mastery #' + id; },
  reset() { this.pending = null; this.blocked.clear(); this.message = this.cfg().enabled ? 'Waiting for character data.' : 'Auto mastery off.'; },
  rows() { return (World.gp?.progression?.masteries || []).filter(m => m && Number.isInteger(m.id) && Number.isInteger(m.level)); },
  // Why a mastery cannot be raised right now, or '' when it can.
  reason(row, progression) {
    if (row.level >= 120 || !Number.isInteger(progression.level) || row.level >= progression.level) return 'at the character level limit';
    if (row.level === 0) return '';
    const cost = Stats.levels?.[row.level]?.masteryTrainSpCost;
    if (!Number.isInteger(cost)) return 'price unknown';
    return !Number.isInteger(progression.skillPoints) || progression.skillPoints < cost ? 'needs ' + cost + ' skill points' : '';
  },
  tick() {
    const c = this.cfg(), gp = World.gp;
    if (!c.enabled) { this.pending = null; this.message = 'Auto mastery off.'; return; }
    const progression = gp?.progression;
    if (!World.inWorld() || World.isDead() || !progression || !Array.isArray(progression.masteries)) { this.message = 'Waiting for a living character.'; return; }
    if (!Stats.levels) { Stats.loadLevels(); this.message = 'Loading mastery prices.'; return; }
    const p = this.pending;
    if (p) {
      const row = this.rows().find(m => m.id === p.id);
      if (row && row.level > p.level) {
        this.pending = null; this.blocked.delete(p.id);
        UI.toast(this.name(p.id) + ' mastery raised to ' + row.level + '.', 'info', 4000);
        this.message = this.name(p.id) + ' raised to ' + row.level + '.';
      } else if (now() - p.at > 10000) {
        // The server may have refused (for example its total mastery limit). Never resend blindly.
        this.pending = null; this.blocked.set(p.id, now() + 60000);
        this.message = this.name(p.id) + ' was not raised; trying again in a minute. ' + (gp.trainingError || '');
      } else return;
    }
    if (gp.trainingPending || gp.trainingError) {
      this.message = gp.trainingError || 'Waiting for the previous training to finish.'; return;
    }
    if (now() - this.lastAt < 1500 || !Cmd.spaced('mastery-train')) return;
    const skipped = [];
    for (const id of c.ids) {
      const row = this.rows().find(m => m.id === id);
      if (!row) continue;
      if ((this.blocked.get(id) ?? 0) > now()) { skipped.push(this.name(id) + ': recently refused'); continue; }
      const why = this.reason(row, progression);
      if (why) { skipped.push(this.name(id) + ': ' + why); continue; }
      if (Cmd.raw({ kind: 'mastery-train', id }, 'Raise mastery: ' + this.name(id))) {
        this.pending = { id, level: row.level, at: now() }; this.lastAt = now();
        this.message = 'Raising ' + this.name(id) + ' from ' + row.level + '.';
      }
      return;
    }
    this.message = c.ids.length ? 'Nothing to raise (' + (skipped.join('; ') || 'selected masteries not found') + ').' : 'Choose which masteries to raise.';
  },
  status() { return this.message; },
  draw(parent) {
    const box = UI.group('Auto mastery', UI.check('Raise selected masteries automatically', () => this.cfg().enabled, v => { this.cfg().enabled = v; this.pending = null; this.blocked.clear(); }));
    const rows = this.rows();
    if (!rows.length) box.append(el('p', 'Enter the game with a character to choose masteries.', 'muted'));
    for (const row of [...rows].sort((a, b) => a.id - b.id)) {
      box.append(UI.check(this.name(row.id) + ' (Lv ' + row.level + ')', () => this.cfg().ids.includes(row.id), v => {
        const ids = this.cfg().ids.filter(id => id !== row.id);
        if (v) ids.push(row.id);
        this.cfg().ids = ids;
      }));
    }
    this.note = el('p', this.message, 'muted');
    box.append(this.note, el('p', 'Raises one level at a time using skill points, in the order you tick them, and moves on when a mastery reaches your character level (or 120). Level 0 masteries are free; otherwise the price is the table cost of its current level. It works while hunting is stopped and does nothing while you are dead. If the server refuses a level (for example its mastery total limit) the bot waits a minute before trying that mastery again.', 'muted'));
    parent.append(box);
  },
};
