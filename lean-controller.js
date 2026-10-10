// Single owner for movement/combat/pickup. Potion use remains a separate emergency lane.
Hunt.lootAllowed = e => Loot.allowed(e);
Hunt.chooseLoot = () => Loot.choose();
Hunt.tick = function () {
  if (!this.running) return;
  if (Restock.tick()) { Loot.suspend(); return; }
  const H = this.cfg(), gp = World.gp;
  if (!World.inWorld()) { this.state = 'waiting'; return; }
  if (World.isDead()) {
    Loot.suspend();
    this.state = 'dead';
    if (!this.deathAt) { this.deathAt = now(); Stats.count('deaths'); }
    if (H.onDeath === 'revive' && !this.revived && now() - this.deathAt > 5000) {
      if (Cmd.rebirth(1)) this.revived = true;
    } else if (H.onDeath === 'stop') this.stop('character died');
    return;
  }
  if (this.deathAt) {
    this.deathAt = 0; this.revived = false; this.targetGid = 0;
    // Town revival returns along the walking route before hunting can acquire targets.
    if (H.center && dist2D(World.pose(), H.center) > H.radius) { WalkBack.start(true); return; }
  }
  if (Restock.activeShop() || gp.storage || now() - Manual.lastAt < H.manualPauseS * 1000) {
    Loot.suspend(); this.state = 'manual'; return;
  }
  if (this.playerCheck()) { Loot.suspend(); this.state = 'player'; return; }
  if (H.stopNoHpPotion && Potion.count('hp') + Potion.count('vigor') === 0) return this.stop('out of HP potions');
  if (H.stopInvFull && World.freeBagSlots() === 0) return this.stop('inventory full');
  const attacked = this.underAttack(), current = this.currentTarget();
  if (attacked) Loot.suspend();
  // An active pickup owns the tick until done, failed or interrupted by an attacker.
  if (!attacked && Loot.active && Loot.tick()) return;
  if (H.pickup.enabled && !attacked && (!current || !H.pickup.afterKillOnly) && !World.isSitting()) {
    const drop = Loot.choose();
    if (drop && Loot.begin(drop)) { this.state = 'loot'; return; }
  }
  const me = World.me();
  if (World.isSitting()) {
    const done = !H.sit.enabled || me.hpPct >= H.sit.resumeAt && me.mpPct >= H.sit.resumeAt;
    this.state = done || attacked ? 'standing' : 'resting';
    if ((done || attacked) && now() - this.sitToggleAt > 2500 && Cmd.action(1000)) this.sitToggleAt = now();
    return;
  }
  if (H.sit.enabled && !attacked && !current && (me.hpPct < H.sit.hpBelow || me.mpPct < H.sit.mpBelow)) {
    if (now() - this.sitToggleAt > 2500 && Cmd.action(1000)) this.sitToggleAt = now();
    this.state = 'resting'; return;
  }
  if (Combat.buffs(true)) { this.state = 'buff'; return; }
  const target = current || this.chooseTarget();
  if (target) { this.engage(target); return; }
  this.targetGid = 0; this.state = 'search';
  if (H.returnToCenter && H.center && dist2D(World.pose(), H.center) > Math.max(40, H.radius * 0.5) && now() - this.lastMoveAt > 2500) {
    if (!Number.isFinite(dist2D(World.pose(), H.center))) return this.stop('hunt area is in another region');
    if (Cmd.move(H.center)) this.lastMoveAt = now();
    this.state = 'return';
  }
};

function stopAll() {
  Controller.resumeAfterRevive = false;
  const active = Hunt.running || Restock.trip || WalkBack.active || Loot.active;
  WalkBack.cancel('', false);
  if (Hunt.running) Hunt.stop();
  Restock.trip = null;
  Loot.suspend();
  if (active && World.inWorld() && !World.isDead()) Cmd.move(World.pose());
}

const Controller = {
  mode: 'idle', lastErrorAt: -Infinity, resumeAfterRevive: false,
  tick() {
    try {
      Restock.sample();
      if (!World.inWorld()) { this.mode = 'waiting'; return; }
      Potion.tick();
      Loot.preparePet();
      if (this.resumeAfterRevive && !World.isDead()) {
        this.resumeAfterRevive = false;
        if (Settings.profile.hunt.center) WalkBack.start(true);
        else Hunt.stop('No saved hunting spot for revival return.');
      }
      if (WalkBack.active) { this.mode = 'returning'; WalkBack.tick(); }
      else if (Restock.recording) this.mode = 'recording';
      else if (Hunt.running) { Hunt.tick(); this.mode = Restock.trip ? 'shopping' : Hunt.state; }
      else this.mode = 'idle';
    } catch (e) {
      stopAll();
      if (now() - this.lastErrorAt > 5000) { this.lastErrorAt = now(); Log.error(e.message || String(e)); UI.toast('Bot stopped: ' + e.message, 'warn'); }
      this.mode = 'error';
    }
  },
};
