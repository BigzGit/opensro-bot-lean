// Independent return command using the saved hunt centre and native movement.
const WalkBack = {
  active: null,
  start(resume = false) {
    if (BuffGear.run || BuffGear.recovery) return UI.toast('Restore or review combat gear before travelling.', 'warn');
    if (Alchemy.run || Alchemy.pending) return UI.toast('Stop alchemy and wait for its result before travelling.', 'warn');
    if (Town.trip) return UI.toast('Stop the town cycle before starting walk-back.', 'warn');
    if (!World.inWorld() || World.isDead()) return UI.toast('Enter the world with a living character first.', 'warn');
    const dest = Settings.profile.hunt.center, pose = World.pose();
    if (!dest || !pose) return UI.toast('Save a hunting spot first using Set here in Hunt → Area.', 'warn');
    if (!Number.isFinite(dist2D(pose, dest))) return UI.toast('Return to the same world or dungeon before walking back.', 'warn');
    if (World.gp?.inventoryPending) return UI.toast('Wait for the inventory transaction to finish.', 'warn');
    Resurrect.cancelTrip('', true); Resurrect.holdUntil = 0;
    const shouldResume = resume || Hunt.running || !!this.active?.resume;
    this.cancel();
    Restock.cancelRecording();
    if (Hunt.running) Hunt.stop();
    if (Restock.activeShop() || World.gp?.storage) Cmd.raw({ kind: 'npc-close' }, 'Walk back: close merchant');
    const recorded = Restock.cfg().route;
    let route = [], nearest = -1, best = 500;
    if (recorded.length && dist2D(recorded[recorded.length - 1], dest) <= 500) {
      recorded.forEach((p, i) => { const d = dist2D(pose, p); if (d <= best) { nearest = i; best = d; } });
      if (nearest >= 0) route = recorded.slice(nearest).map(p => ({ ...p }));
    }
    route.push({ ...dest });
    this.active = { route, recorded: route.length > 1, index: 0, resume: shouldResume, manualAt: Manual.lastAt, at: now(), progressAt: now(), lastPose: { ...pose }, best: Infinity, sentAt: -Infinity, replans: 0 };
    UI.toast('Walking back to the hunting spot.', 'info', 2500);
  },
  cancel(reason = '', halt = true) {
    if (!this.active) return;
    this.active = null;
    if (halt && World.inWorld() && !World.isDead()) Cmd.move(World.pose());
    if (reason) UI.toast(reason, 'warn', 4000);
  },
  tick() {
    const a = this.active;
    if (!a) return;
    if (!World.inWorld() || World.isDead()) return this.cancel('Walk back interrupted.', false);
    if (Manual.lastAt !== a.manualAt) return this.cancel('Manual control: walk back cancelled.', false);
    const dest = a.route[a.index], distance = dist2D(World.pose(), dest);
    if (!Number.isFinite(distance)) return this.cancel('Cannot walk to the saved hunting spot.');
    if (distance <= 12) {
      a.index++; a.best = Infinity; a.progressAt = now();
      if (a.index < a.route.length) return;
      this.active = null;
      UI.toast('Back at the hunting spot.', 'info', 2500);
      if (a.resume) Hunt.start();
      return;
    }
    if (dist2D(a.lastPose, World.pose()) > 3) { a.lastPose = { ...World.pose() }; a.progressAt = now(); a.replans = 0; }
    if (now() - a.progressAt > 20000 || now() - a.at > 600000) return this.cancel('Walk back stopped: path blocked or travel timed out.');
    if (now() - a.progressAt > 6000 && a.travel && a.replans < 2) { a.travel = null; a.replans++; a.sentAt = -Infinity; }
    const move = Navigation.next(a, dest, a.recorded);
    if (move.error && !move.waiting) return this.cancel(move.error);
    if (move.waiting) {
      if (move.error && a.navMessage !== move.error) { a.navMessage = move.error; UI.toast(move.error, 'warn'); }
      return;
    }
    if (World.isSitting()) {
      if (now() - a.sentAt >= 2500 && Cmd.action(1000)) a.sentAt = now();
    } else if (now() - a.sentAt >= 900 && Cmd.move(move.point)) a.sentAt = now();
  },
};
