// Approve only correlated applications to the local player's matching listing.
const Party = {
  answered: '',
  reset() { this.answered = ''; },
  tick() {
    if (!Settings.profile.party.autoAcceptMatching || !World.inWorld()) return;
    const gp = World.gp, matching = gp?.partyMatching, request = matching?.request, social = gp?.social;
    if (!request) { this.reset(); return; }
    if (!matching.own || !social || !Array.isArray(social.members)) return;
    // An owned listing can exist before the first applicant forms the party.
    if (social.leader && (!social.self || social.self !== social.leader)) return;
    if (!social.leader && social.members.length) return;
    const options = social.leader ? social.options : matching.own.type;
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
