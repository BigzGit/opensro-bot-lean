// Native beta starter scroll: item 24198 -> skill 31107 (+100%, one hour).
// Never choose a paid scroll or infer consumption from a local command dispatch.
const SpeedScroll = {
  pending: null, attempts: 0, nextAt: 0, message: 'Speed scroll off.',
  reset() { this.pending = null; this.attempts = 0; this.nextAt = 0; this.message = 'Waiting for automation.'; },
  active() {
    if (World.buffRemaining(31107) > 0 || World.buffRemaining(5411) > 0) return true;
    const effects = [...(World.gp?.buffSlots || []).filter(b => b.state !== 'departing').map(b => b.effect), ...(World.gp?.attachedEffects || [])];
    return effects.some(e => e?.gid === World.localGid() && World.skill(e.skill)?.speedBuff?.active && World.buffRemaining(e.skill) > 0);
  },
  tick() {
    if (Town.trip) return false;
    if (!Settings.profile.potion.speedScroll) { this.message = 'Speed scroll off.'; return false; }
    if (!World.inWorld() || World.isDead()) return false;
    if (this.active()) {
      this.pending = null; this.attempts = 0; this.nextAt = 0;
      this.message = 'Movement-speed buff active.'; return false;
    }
    if (!(Hunt.running || WalkBack.active || Restock.trip || Resurrect.trip)) { this.message = 'Waiting for hunting or travel.'; return false; }
    if (World.gp.inventoryPending || World.isCasting() || Resurrect.holdUntil > now() || World.isSitting() || World.local()?.mountedOn ||
        Restock.activeShop() || World.gp.storage || Restock.recording || now() - Manual.lastAt < Hunt.cfg().manualPauseS * 1000) return false;
    if (this.pending) {
      if (now() - this.pending.at < 8000) { this.message = 'Waiting for speed-buff confirmation.'; return false; }
      this.pending = null; this.nextAt = now() + 30000 * this.attempts;
      this.message = 'Speed buff was not confirmed. Backing off before retrying.';
      Log.warn(this.message);
    }
    if (this.attempts >= 3) { this.message = 'Speed buff not confirmed after 3 attempts. Check the game and toggle this option to retry.'; return false; }
    if (now() < this.nextAt) return false;
    const item = World.items().find(i => i.refObjId === 24198 && (i.quantity ?? 1) > 0);
    if (!item) { this.message = 'No beginner +100% speed scroll in your bag.'; return false; }
    if (!Cmd.itemUse(item.slot)) return false;
    this.attempts++; this.pending = { at: now() };
    this.message = 'Beginner speed scroll requested; waiting for its buff.';
    return true;
  },
};
