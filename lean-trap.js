// A character that cannot move: it should be walking (chasing, returning, picking up) but its position has not changed
// and nothing is being damaged. Seen in the live game as a character stuck inside a tree that even a manual click
// could not free. The route planner cannot help from inside an obstacle, so this tries two cheap things once each,
// a step back to where the character just was and a walk to the nearest open tile, and then stops hunting loudly
// instead of standing there for minutes. It also records what the collision data says about the character's tile.
const Trap = {
  crumbs: [], idle: null, stage: 0, at: 0, from: null, tile: 'unknown', message: '', lastBreadcrumbAt: 0,
  cfg() { return Settings.profile.hunt.trap; },
  // Only intents that need the character to walk: not searching, resting, casting or standing in a fight it is winning.
  walking() { return ['fight', 'return', 'loot'].includes(Hunt.state) && !World.isCasting() && !World.isSitting(); },
  busy() { return !!(Town.trip || WalkBack.active || Resurrect.trip || Restock.trip || Alchemy.run || World.gp?.storage || Restock.activeShop()); },
  reset(clearCrumbs = false) { this.idle = null; this.stage = 0; this.from = null; if (clearCrumbs) this.crumbs = []; },
  // What the collision data says about a position's tile: 'yes' (blocked), 'no' (open) or 'unknown' (no data).
  blockedAt(pose) {
    if (!Navigation.scene || (pose.regionId & DUNGEON)) return 'unknown';
    const local = Navigation.local(pose);
    return local ? (Navigation.open(local.x, local.z) ? 'no' : 'yes') : 'unknown';
  },
  // The nearest open tile centre within 240 units, as a pose, or null.
  nearestOpen(pose) {
    const start = Navigation.scene && Navigation.local(pose);
    if (!start) return null;
    const tx = Math.floor(start.x / 20), tz = Math.floor(start.z / 20);
    let best = null, bestDistance = Infinity;
    for (let r = 1; r <= 12; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = (tx + dx) * 20 + 10, z = (tz + dz) * 20 + 10;
        if (!Navigation.open(x, z)) continue;
        const d = Math.hypot(x - start.x, z - start.z);
        if (d < bestDistance) { best = { x, z }; bestDistance = d; }
      }
      if (best) break;
    }
    return best && Navigation.pose(best, pose.y);
  },
  // The newest remembered position that is far enough behind to be clear of whatever holds the character.
  stepBack(pose) {
    for (let i = this.crumbs.length - 1; i >= 0; i--) {
      const d = dist2D(pose, this.crumbs[i]);
      if (d >= 30 && d <= 600) return this.crumbs[i];
    }
    return null;
  },
  status() {
    return this.stage ? this.message : '';
  },
  // True while an escape attempt owns movement this tick.
  tick() {
    const c = this.cfg(), t = now();
    if (!c?.enabled || !Hunt.running || !World.inWorld() || World.isDead() || this.busy()) { this.reset(); return false; }
    const pose = World.pose();
    if (!pose) return false;
    if (this.stage === 0 && (!this.crumbs.length || dist2D(this.crumbs.at(-1), pose) >= 8) && t - this.lastBreadcrumbAt >= 1000) {
      this.crumbs.push({ ...pose }); this.lastBreadcrumbAt = t;
      if (this.crumbs.length > 16) this.crumbs.shift();
    }
    const gid = Hunt.targetGid, sim = World.simNow() ?? 0;
    const damaging = gid && sim - (World.hitByUs.get(gid) ?? -Infinity) < 8000;
    if (this.stage) {
      // An attempt is running. Moving away from where it got stuck, or hitting something, means it worked.
      if (dist2D(this.from, pose) > 15 || damaging) { this.free(); return false; }
    } else {
      // Not stuck unless it should be walking, is not hurting its target and has not moved for the set time.
      if (!this.walking() || damaging || !this.idle || dist2D(this.idle.pose, pose) > 3) { this.idle = { pose: { ...pose }, since: t }; return false; }
      if (t - this.idle.since < c.seconds * 1000) return false;
      this.tile = this.blockedAt(pose); this.from = { ...pose }; this.stage = 1; this.at = 0;
      Log.warn(`Character cannot move: no change for ${c.seconds} s. Collision data says its tile is blocked: ${this.tile}.`);
    }
    if (this.stage === 1) {
      if (!this.at) {
        this.at = t; const crumb = this.stepBack(pose);
        this.message = crumb ? 'Cannot move: stepping back to where it just was.' : 'Cannot move: no earlier position to step back to.';
        if (crumb) { Cmd.move(crumb); Log.info(this.message); }
      } else if (t - this.at >= 6000) { this.stage = 2; this.at = 0; }
      return true;
    }
    if (this.stage === 2) {
      if (!this.at) {
        this.at = t; const open = this.nearestOpen(pose);
        this.message = open ? 'Cannot move: walking to the nearest open ground.' : 'Cannot move: no open ground found nearby.';
        if (open) { Cmd.move(open); Log.info(this.message); }
      } else if (t - this.at >= 6000) { this.stage = 3; }
      return true;
    }
    this.message = `Trapped: the character could not move for ${c.seconds} s and two escape attempts failed. Free it by hand (return scroll), then start again.`;
    Log.warn(this.message);
    Sound.play('pet-full');
    Hunt.stop('character cannot move (trapped)');
    this.reset(true);
    return true;
  },
  free() {
    Log.info('Free again after the escape attempt.');
    if (Hunt.targetGid) { Hunt.ban.set(Hunt.targetGid, now() + 60000); Hunt.targetGid = 0; }
    this.reset();
  },
};
const huntTickBeforeTrap = Hunt.tick;
Hunt.tick = function () {
  if (Trap.tick()) return;
  return huntTickBeforeTrap.apply(this, arguments);
};
bus.on('hunt', () => Trap.reset(true));
