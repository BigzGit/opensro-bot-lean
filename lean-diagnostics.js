// Explicit report fields only: never export raw logs, profiles or game snapshots.
const Diagnostics = {
  history: [], errors: [], last: '', started: false,
  number(value) { return Number.isFinite(value) ? value : null; },
  errorCode(message) {
    const text = String(message || '');
    for (const [pattern, code] of [
      [/Stale party join answer/i, 'stale-party-answer'],
      [/party matching.*pending/i, 'party-matching-pending'],
      [/(inventory|transaction).*pending|inventory.*busy/i, 'inventory-busy'],
      [/(bag|inventory).*(full|space|capacity)/i, 'bag-capacity'],
      [/COS ground|cos.pickup|pickup/i, 'pickup-error'],
      [/gold|money/i, 'insufficient-gold-or-payment'],
      [/scroll|return|travel/i, 'travel-error'],
      [/timeout|timed out/i, 'timeout'],
    ]) if (pattern.test(text)) return code;
    return 'unclassified-error';
  },
  start() {
    if (this.started) return;
    this.started = true;
    bus.on('game-error', text => this.error(text));
    bus.on('log', entry => { if (entry.level === 'error' || entry.level === 'warn') this.error(entry.text); });
  },
  error(text) {
    const code = this.errorCode(text), previous = this.errors[this.errors.length - 1];
    if (previous?.code === code && now() - previous.at < 1000) return;
    this.errors.push({ at: now(), code });
    if (this.errors.length > 12) this.errors.shift();
  },
  party() {
    const c = Settings.profile.party, m = World.gp?.partyMatching, s = World.gp?.social;
    if (!c.autoRecruit && !c.autoAcceptMatching) return 'Party automation off.';
    if (!World.inWorld() || !m || !s || !Array.isArray(s.members)) return 'Party: waiting for game state.';
    if (!m.request) return m.own ? 'Party: waiting for applicants.' : c.autoRecruit ? 'Party: waiting for listing registration.' : 'Party: listing missing.';
    if (!m.own) return 'Party join blocked: listing missing.';
    if (s.leader && (!s.self || s.self !== s.leader) || !s.leader && s.members.length) return 'Party join blocked: you are not the leader.';
    const options = s.leader ? s.options : m.own.type;
    if (!Number.isInteger(options)) return 'Party join blocked: sharing options unknown.';
    if (s.members.length >= ((options & 1) ? 8 : 4)) return 'Party join blocked: party full.';
    const sim = World.simNow(), r = m.request;
    if (!Number.isFinite(sim) || !Number.isFinite(r.expires)) return 'Party join blocked: clock or deadline unknown.';
    if (sim >= r.expires) return 'Party join blocked: request expired.';
    if (![r.a, r.b].every(id => Number.isInteger(id) && id > 0 && id <= 0xffffffff)) return 'Party join blocked: invalid request.';
    if (Party.answered === `${r.a}:${r.b}:${r.expires}`) return 'Party: acceptance sent; waiting for confirmation.';
    return 'Party: application ready for acceptance.';
  },
  pet() {
    if (!Hunt.cfg().pickup.enabled || !Loot.petMode()) return '';
    if (!Hunt.running) return 'Pet collection paused: bot stopped.';
    const pet = Loot.pet();
    if (!pet) return 'Pet waiting: summon a pickup pet.';
    if (!Number.isInteger(pet.rec.commandMode)) return 'Pet waiting for settings.';
    if (pet.rec.commandMode & 128) return 'Pet waiting for broad auto-grab to turn off.';
    if (World.gp?.inventoryPending) return 'Pet waiting for inventory transaction.';
    if (Loot.pressed()) return 'Pet waiting briefly for potion use.';
    if (Loot.active?.petGid) return Loot.active.retryAt ? 'Pet pickup: retry pending.' : 'Pet pickup: waiting for collection confirmation.';
    if (pet.rec.inventory.length >= pet.rec.status) return 'Pet bag full; only compatible stacks can merge.';
    return 'Pet ready; waiting for eligible drops.';
  },
  town() {
    if (!Town.cfg().enabled) return '';
    if (Town.trip) return '';
    if (!Hunt.running) return '';
    const blocked = Town.blocked();
    if (blocked) return 'Town return blocked: ' + blocked + '.';
    const c = Town.cfg();
    if (['arrival', 'vendor', 'smith', 'gate', ...(c.petFull ? ['storage'] : [])].some(role => !c[role])) return 'Town return blocked: save missing service points in Supplies.';
    if (!Town.scroll(0x09ec)) return 'Town return blocked: return scroll missing.';
    if (!Town.scroll(0x19ec)) return 'Town return blocked: reverse scroll missing.';
    if (Town.validate()) return 'Town return blocked: check refill targets, low-stock thresholds and gold.';
    return Town.reason() ? 'Town return: preparing departure.' : '';
  },
  main() {
    if (BuffGear.run) return BuffGear.run.restoring ? 'Buff gear: restoring combat equipment.' : 'Buff gear: swapping or casting.';
    if (BuffGear.recovery) return 'Buff gear: manual equipment review needed.';
    if (Alchemy.pending) return Alchemy.run ? 'Alchemy: waiting for the server result.' : 'Alchemy stopped; outstanding result unconfirmed.';
    if (Alchemy.run) return 'Alchemy: preparing the next attempt.';
    if (!World.inWorld()) return 'Waiting for game world.';
    if (World.isDead()) return 'Character dead; waiting for recovery.';
    if (Town.trip) {
      if (Town.trip.phase === 'buy') return Town.trip.supplies.map(s => `Refilling ${s.kind === 'hp' ? 'HP' : s.kind === 'mp' ? 'MP' : 'abnormal pills'}: ${Restock.count(s.refObjId)} / ${s.target}`).join(' · ');
      if (World.gp?.inventoryPending) return 'Town services: waiting for inventory transaction.';
      const phases = { recall: 'stopping combat for recall', 'recall-wait': 'waiting for recall arrival', 'reverse-wait': 'waiting for reverse arrival', 'revive-arrival': 'waiting for town revival', store: 'depositing loot', sell: 'selling pet loot', repair: 'repairing equipment', reverse: 'opening reverse return' };
      return 'Town services: ' + (phases[Town.trip.phase] || 'travelling between or opening services') + '.';
    }
    if (WalkBack.active || Restock.trip || Resurrect.trip) return 'Travelling; waiting to reach the destination.';
    if (!Hunt.running) return 'Bot stopped.';
    if (now() - Manual.lastAt < Hunt.cfg().manualPauseS * 1000) return 'Hunting paused after manual control.';
    if (Restock.activeShop() || World.gp?.storage) return 'Hunting paused: close shop or storage.';
    if (Hunt.state === 'resting' || Hunt.state === 'standing') return 'Recovering HP / MP.';
    if (Hunt.state === 'player') return 'Hunting paused by nearby-player setting.';
    if (Hunt.state === 'loot') return 'Character collecting; waiting for pickup confirmation.';
    if (World.isCasting()) return 'Combat: waiting for the current cast.';
    if (Hunt.targetGid) return 'Combat: approaching or attacking the target.';
    return 'Hunting: searching for an eligible target.';
  },
  snapshot() {
    const gp = World.gp, c = Settings.profile, pet = Loot.pet(), social = gp?.social, matching = gp?.partyMatching;
    return {
      action: this.main(), partyStatus: this.party(), petStatus: this.pet(), townStatus: this.town(),
      buffGearActive: !!BuffGear.run, buffGearRestoring: !!BuffGear.run?.restoring, buffGearMovePending: !!BuffGear.run?.pending, buffGearRecovery: !!BuffGear.recovery,
      alchemyActive: !!Alchemy.run, alchemyPending: !!Alchemy.pending, alchemyAttempts: this.number(Alchemy.result?.attempts),
      alchemyTarget: this.number(Alchemy.run?.cfg.target), alchemySuccesses: this.number(Alchemy.result?.successes),
      alchemyFailures: this.number(Alchemy.result?.failures), alchemyElixirsUsed: this.number(Alchemy.result?.elixirs),
      alchemyPowdersUsed: this.number(Alchemy.result?.powders), alchemyResultFlags: this.number(gp?.alchemy?.flags),
      alchemyError: this.number(gp?.alchemy?.error), alchemyWindowVisible: !!gp?.alchemy?.visible,
      nativeAlchemyPending: !!gp?.alchemy?.pending,
      nativeAlchemyMode: ['reinforce', 'attribute', 'magic', 'compound', 'advanced', 'dissolve'].includes(gp?.alchemy?.mode) ? gp.alchemy.mode : null,
      movementPending: !!gp?.pendingMoves, returnScrollActive: !!gp?.returnScroll,
      running: !!Hunt.running, inWorld: World.inWorld(), dead: World.isDead(),
      inventoryPending: !!gp?.inventoryPending, casting: World.isCasting(),
      curePills: Restock.count(58), freeBagSlots: this.number(World.freeBagSlots()), hpPotions: Potion.count('hp'), mpPotions: Potion.count('mp'),
      petFreeSlots: pet ? this.number(pet.rec.status - pet.rec.inventory.length) : null,
      pickupPending: !!Loot.active, pickupRetry: !!Loot.active?.retryAt, pickupAttempts: this.number(Loot.active?.attempts),
      petSetupAttempts: this.number(Loot.petSetup?.attempts), speedScrollPending: !!SpeedScroll.pending,
      speedScrollAttempts: this.number(SpeedScroll.attempts),
      partyMembers: this.number(social?.members?.length), partyOptions: this.number(social?.options),
      partyLeader: !!social?.self && social.self === social.leader, ownListing: !!matching?.own,
      matchingStateKnown: !!matching, simulationClockKnown: Number.isFinite(World.simNow()),
      matchingPending: ['page', 'join', 'register', 'modify', 'delete'].includes(matching?.pending) ? matching.pending : null,
      matchingResult: this.number(matching?.result), registrationPending: !!Party.registration,
      joinRequest: !!matching?.request, acceptanceSent: !!matching?.request && Party.answered === `${matching.request.a}:${matching.request.b}:${matching.request.expires}`,
      requestRemainingMs: Number.isFinite(World.simNow()) && Number.isFinite(matching?.request?.expires) ? Math.max(0, matching.request.expires - World.simNow()) : null,
      townActive: !!Town.trip,
      townPhase: ['recall', 'recall-wait', 'revive-arrival', 'walk-storage', 'open-storage', 'store', 'close-storage', 'walk-vendor', 'open-vendor', 'buy', 'close-vendor', 'walk-smith', 'open-smith', 'sell', 'repair', 'close-smith', 'walk-gate', 'open-gate', 'reverse', 'reverse-wait'].includes(Town.trip?.phase) ? Town.trip.phase : null,
      scrollAttempts: this.number(Town.trip?.scrollAttempts), scrollAccepted: !!Town.trip?.scrollRequest?.accepted,
      returnScroll: !!Town.scroll(0x09ec), reverseScroll: !!Town.scroll(0x19ec),
      settings: { autoRecruit: !!c.party.autoRecruit, autoAccept: !!c.party.autoAcceptMatching,
        townCycle: !!Town.cfg().enabled, revive: !!Town.cfg().revive, petFullReturn: !!Town.cfg().petFull,
        walkingRestock: !!Restock.cfg().enabled, buyHP: !!Restock.cfg().hp.on, buyMP: !!Restock.cfg().mp.on,
        hpTarget: this.number(Restock.cfg().hp.target), mpTarget: this.number(Restock.cfg().mp.target),
        buyCure: !!Restock.cfg().cure.on, cureTarget: this.number(Restock.cfg().cure.target), cureLow: this.number(Restock.cfg().cure.low),
        hpLow: this.number(Restock.cfg().hp.low), mpLow: this.number(Restock.cfg().mp.low),
        collectDrops: !!c.hunt.pickup.enabled, petCollector: Loot.petMode(), pickupRadius: this.number(c.hunt.pickup.radius / 10),
        finishFight: !!c.hunt.pickup.afterKillOnly, speedScroll: !!c.potion.speedScroll }
    };
  },
  sample() {
    try {
      const state = this.snapshot();
      // Deadline countdown alone is not a new state transition.
      const key = JSON.stringify({ ...state, requestRemainingMs: null });
      if (key !== this.last) { this.last = key; this.history.push({ at: now(), state }); }
      if (this.history.length > 30) this.history.shift();
      return state;
    } catch { return { action: 'Waiting for complete game state.' }; }
  },
  lines(state) {
    return [state.action, Settings.profile.party.autoRecruit || Settings.profile.party.autoAcceptMatching ? state.partyStatus : '', state.petStatus,
      state.townStatus].filter(Boolean).join('\n');
  },
  report() {
    const current = this.sample(), relative = entries => entries.map(({ at, ...entry }) => ({ secondsAgo: Math.max(0, Math.round((now() - at) / 1000)), ...entry }));
    return JSON.stringify({ app: 'nixxane bot', version: VERSION,
      privacy: 'Names, chat, account details, locations and raw logs are omitted. Error categories replace original messages.',
      current, recentStates: relative(this.history), recentErrors: relative(this.errors) }, null, 2);
  },
  async copy() {
    const text = this.report();
    try {
      await W.navigator.clipboard.writeText(text);
      UI.toast('Copied—paste this into your bug report.');
    } catch { UI.showDiagnostics(text); }
  },
};
