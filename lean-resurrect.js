// Auto-resurrect dead party members with a learned corpse-targeted skill.
// The sim worker replaces a skill press's gid with the newest selection intent
// (core.ts), so the corpse is selected immediately before the press. The server
// walks the caster into reach and proposes the revival, which the dead member
// answers inside a 30 second window; the offer repeats after that window.
const Resurrect = {
  sent: {},           // member id -> time of the unanswered proposal
  nextAt: -Infinity,  // earliest next attempt
  windowMs: 31000,    // the server's answer window plus one tick
  message: 'No fallen party member.',
  reset() { this.sent = {}; this.nextAt = -Infinity; this.message = 'No fallen party member.'; },
  // The highest-tier learned corpse-targeted row: the Rebirth family marks
  // itself with the DeadBody target bit, and later tiers carry the higher
  // mastery requirement.
  skill() {
    let best = null;
    for (const id of World.gp?.skills || []) {
      const s = World.skill(id);
      if (!s || !s.targetRequired || !((s.targets ?? 0) & 128)) continue;
      if (!best || this.rank(s) > this.rank(best)) best = s;
    }
    return best;
  },
  rank(s) {
    const mastery = Math.max(0, ...(s.masteries || []).map(m => m.Level || 0));
    return mastery * 1000 + (s.level ?? 0);
  },
  tick() {
    const c = Settings.profile.party;
    if (!c.autoRes) { this.message = 'Auto-resurrect off.'; return; }
    if (!World.inWorld() || World.isDead()) { this.message = 'Waiting for a living character.'; return; }
    const social = World.gp?.social, members = social?.members;
    if (!Array.isArray(members)) return;
    const party = members.filter(m => m && m.id && m.name && m.name !== social.localName);
    const t = now();
    for (const id of Object.keys(this.sent)) {
      const m = party.find(x => x.id === Number(id));
      if (!m || (m.status & 15) !== 0) delete this.sent[id];
    }
    const offered = party.find(m => this.sent[m.id]);
    this.message = offered ? 'Resurrection offered: ' + offered.name + '; waiting for the answer.' : 'Watching for fallen party members.';
    const skill = this.skill();
    if (!skill) { this.message = 'No learned resurrection skill (Rebirth) was found.'; return; }
    if (t < this.nextAt || World.gp.targetPending || !Cmd.canCast(skill.id)) return;
    if (t - Manual.lastAt < Hunt.cfg().manualPauseS * 1000) return;
    for (const m of party) {
      if ((m.status & 15) !== 0 || this.sent[m.id] && t - this.sent[m.id] < this.windowMs) continue;
      // The corpse must be in view as an entity to aim the select at.
      const e = [...World.ents.values()].find(x => x && x.kind === 'player' && x.name === m.name);
      if (!e || e.appearanceState?.[0] !== 2) continue;
      if (!Cmd.select(e.gid)) return;
      if (!Cmd.skill(skill.id, e.gid)) return;
      this.nextAt = t + 700;
      const first = this.sent[m.id] === undefined;
      this.sent[m.id] = t;
      this.message = 'Resurrection offered: ' + m.name + '; waiting for the answer.';
      if (first) UI.toast('Resurrection offered: ' + m.name, 'info', 3000);
      return;
    }
  },
};
