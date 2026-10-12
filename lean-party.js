// Approve only correlated applications to the local player's matching listing.
const Party = {
  answered: '',
  registration: null,
  lastRegisterAt: -Infinity,
  message: 'Auto-recruit off.',
  reset() { this.answered = ''; this.registration = null; this.lastRegisterAt = -Infinity; this.message = 'Waiting for party state.'; },
  // Party sharing options: the party's own once formed, else the listing's, else the saved new-party choice.
  options(matching, social) {
    const c = Settings.profile.party;
    return social.leader ? social.options : matching.own?.type ?? ((c.expShare ? 1 : 0) | (c.itemShare ? 2 : 0));
  },
  recruit(matching, social) {
    const c = Settings.profile.party;
    if (!c.autoRecruit) { this.message = 'Auto-recruit off.'; return; }
    if (matching.own) {
      this.registration = null;
      this.message = social.leader && social.self !== social.leader ? 'Listing present; only the leader can auto-accept.' : social.members.length >= (((social.leader ? social.options : matching.own.type) & 1) ? 8 : 4) ? 'Party full; waiting for a free slot.' : 'Listing active; accepting applicants when space is available.';
      return;
    }
    if (this.registration) {
      if (now() - this.registration.at < 15000) { this.message = 'Waiting for registration confirmation.'; return; }
      // A local send can be refused before registration starts. Retry only
      // after a newer native snapshot explicitly confirms no listing or request.
      if (World.gp === this.registration.state) { this.message = 'Registration unconfirmed; waiting for fresh party state before retrying.'; return; }
      if (matching.own !== null || matching.pending !== null || matching.request || matching.joining) {
        this.message = 'Waiting for party matching before retrying registration.'; return;
      }
      this.registration = null;
    }
    if (matching.own !== null || matching.pending !== null || matching.request || matching.joining) { this.message = 'Waiting for party matching.'; return; }
    if (social.leader && (!social.self || social.self !== social.leader) || !social.leader && social.members.length) {
      this.message = 'Waiting until you are solo or party leader.'; return;
    }
    const type = social.leader ? social.options : (c.expShare ? 1 : 0) | (c.itemShare ? 2 : 0);
    if (!Number.isInteger(type) || type < 0 || type > 7) { this.message = 'Waiting for party options.'; return; }
    if (social.members.length >= ((type & 1) ? 8 : 4)) { this.message = 'Party full; waiting for a free slot.'; return; }
    if (!social.leader && !(World.gp?.progression?.level >= 5)) { this.message = 'Level 5 is required to form a listing.'; return; }
    const title = String(c.title || '').trim();
    if (!title || title.length > 50 || !Number.isInteger(c.min) || !Number.isInteger(c.max) || c.min < 1 || c.max > 90 || c.min > c.max) {
      this.message = 'Set a title (1-50 characters) and a level range within 1-90.'; return;
    }
    // Match the client party-matching purpose matrix for the equipped job suit.
    const flags = World.gp.inventory?.find(i => i.slot === 8)?.typeFlags ?? 0, suit = flags >>> 11;
    const job = (flags & 0x7fe) === 0x3ac && suit >= 1 && suit <= 3 ? suit : 4;
    const validPurpose = Number.isInteger(c.purpose) && (job === 1 || job === 3 ? c.purpose === 2 : job === 2 ? c.purpose === 3 : c.purpose >= 0 && c.purpose < 2);
    if (!validPurpose) { this.message = 'Listing purpose does not match your equipped job suit.'; return; }
    if (now() - this.lastRegisterAt < 30000 || !Cmd.spaced('party-match-register')) { this.message = 'Waiting before restoring the listing.'; return; }
    const registration = { party: 0, type, purpose: c.purpose, min: c.min, max: c.max, title };
    if (Cmd.raw({ kind: 'party-match-register', registration }, 'Auto-recruit: register party listing')) {
      this.registration = { at: now(), state: World.gp }; this.lastRegisterAt = now();
      this.message = 'Waiting for registration confirmation.';
    }
  },
  // A dead character gets a Yes/No resurrection question from a caster's Rebirth skill. Only party members
  // are answered, and only while dead; other questions (including mutation proposals) are left to the player.
  acceptResurrection() {
    const c = Settings.profile.party, social = World.gp?.social, question = social?.resurrection;
    if (!c.acceptRes || !question || question.mutation || !World.inWorld() || !World.isDead() || !Array.isArray(social.members)) return;
    const caster = World.ents.get(question.gid);
    if (!caster?.name || !social.members.some(m => m?.name === caster.name && m.name !== social.localName)) return;
    if (!Cmd.spaced('resurrection-consent')) return;
    if (Cmd.raw({ kind: 'resurrection-consent', accept: true }, 'Accept resurrection from ' + caster.name)) {
      UI.toast('Accepted resurrection from ' + caster.name, 'info', 3000);
    }
  },
  tick() {
    this.acceptResurrection();
    const c = Settings.profile.party;
    if (!World.inWorld() || (!c.autoAcceptMatching && !c.autoRecruit)) return;
    const gp = World.gp, matching = gp?.partyMatching, request = matching?.request, social = gp?.social;
    if (!matching || !social || !Array.isArray(social.members)) return;
    this.recruit(matching, social);
    if (!request) { this.answered = ''; return; }
    if (!social || !Array.isArray(social.members)) return;
    // An owned listing can exist before the first applicant forms the party.
    // The game only routes applications to the listing's owner, and the local listing record can be
    // missing while the server's still exists (it is wiped on world entry and after a party dissolves),
    // so a live application is enough; the leader, capacity and deadline checks below still apply.
    if (social.leader && (!social.self || social.self !== social.leader)) return;
    if (!social.leader && social.members.length) return;
    const options = this.options(matching, social);
    if (!Number.isInteger(options) || social.members.length >= ((options & 1) ? 8 : 4)) return;
    const sim = World.simNow();
    if (!Number.isFinite(sim) || !Number.isFinite(request.expires) || sim >= request.expires) return;
    if (![request.a, request.b].every(id => Number.isInteger(id) && id > 0 && id <= 0xffffffff)) return;
    const key = `${request.a}:${request.b}:${request.expires}`;
    if (key === this.answered || !Cmd.spaced('party-match-answer')) return;
    // Same correlation and accept value as the game's matching approval button.
    if (Cmd.raw({ kind: 'party-match-answer', a: request.a, b: request.b, answer: 1 }, 'Auto-accept party-matching application')) {
      this.answered = key;
      UI.toast('Party join acceptance sent: ' + (request.member?.name || 'Applicant'), 'info', 3000);
    }
  },
};
