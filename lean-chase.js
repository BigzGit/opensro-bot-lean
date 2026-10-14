// Detour around an obstacle while chasing a target. The game walks a character straight at its target, so a tree or
// a wall in between stops it dead until the no-damage timeout drops the mob. When the character has stood still for
// a few seconds without hurting the target, and the collision data says the straight line is blocked, it walks the
// planned route until the straight line is clear again, then the normal attack takes over.
const Chase = {
  s: null, detour: null, message: '', detours: 0,
  cfg() { return Settings.profile.hunt.detour; },
  reset() { this.s = null; this.detour = null; },
  // True when a detour moved the character this tick, so the normal engage must not send an attack that walks back.
  drive(target) {
    const c = this.cfg();
    if (!c?.enabled || !Hunt.running) { this.reset(); return false; }
    const t = now(), pose = World.pose(), gap = dist2D(pose, target);
    if (!Number.isFinite(gap)) { this.reset(); return false; }
    let s = this.s;
    if (!s || s.gid !== target.gid) { s = this.s = { gid: target.gid, at: t, pose: { ...pose }, hp: World.hpOf(target.gid), detours: 0 }; this.detour = null; }
    const moved = dist2D(s.pose, pose) > 3, hp = World.hpOf(target.gid);
    if (hp !== s.hp) { s.hp = hp; s.at = t; this.detour = null; return false; }
    if (World.gp.target !== target.gid || World.isCasting()) { s.at = t; s.pose = { ...pose }; return !!this.detour && this.step(target, t); }
    if (this.detour) return this.step(target, t);
    if (moved) { s.pose = { ...pose }; s.at = t; return false; }
    if (t - s.at < c.stallMs || gap <= 15) return false;
    // Stalled and not adjacent: act only when the planner says the straight line is blocked.
    s.at = t;
    const route = Navigation.plan(pose, target);
    if (!route?.length || route.length === 1 && route[0] === target) return false;
    if (s.detours >= 3) {
      Hunt.ban.set(target.gid, t + 60000); Hunt.targetGid = 0;
      this.message = `Gave up on ${target.name || target.gid}: three detours did not get there.`; Log.warn(this.message);
      this.reset(); return true;
    }
    s.detours++; this.detours++;
    this.detour = { at: t, sentAt: -Infinity, pose: { ...pose }, movedAt: t };
    this.message = `Walking around an obstacle to reach ${target.name || target.gid}.`; Log.info(this.message);
    return this.step(target, t);
  },
  step(target, t) {
    const d = this.detour, pose = World.pose();
    const end = why => { this.detour = null; this.s.at = t; this.s.pose = { ...pose }; if (why) Log.info('Detour ended: ' + why); return false; };
    if (t - d.at > 15000) return end('took too long');
    if (dist2D(d.pose, pose) > 3) { d.pose = { ...pose }; d.movedAt = t; } else if (t - d.movedAt > 3000) return end('not moving');
    const route = Navigation.plan(pose, target);
    if (!route?.length) return end('no route');
    if (route.length === 1 && route[0] === target) return end('straight line is clear');
    if (t - d.sentAt >= 900) {
      const move = Navigation.next(d, target);
      if (move.point && Cmd.move(move.point)) d.sentAt = t; else if (move.error) return end(move.error);
    }
    return true;
  },
};
const engageBeforeChase = Hunt.engage;
Hunt.engage = function (target) {
  if (Chase.drive(target)) return;
  return engageBeforeChase.apply(this, arguments);
};
bus.on('hunt', () => Chase.reset());
