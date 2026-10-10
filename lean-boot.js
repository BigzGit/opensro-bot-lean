function toggleBot() {
  if (Hunt.running || Town.trip || WalkBack.active || Restock.trip || Resurrect.trip || Controller.resumeAfterRevive) stopAll();
  else if (Restock.recording) UI.toast('Finish or cancel route recording before starting the bot.', 'warn');
  else Hunt.start();
}

function boot() {
  UI.mount();
  const unlockSound = e => {
    if (e.isTrusted && Settings.profile.hunt.pickup.petFullSound) Sound.unlock();
  };
  W.addEventListener('pointerdown', unlockSound, true);
  W.addEventListener('keydown', unlockSound, true);
  // The game listens globally and prevents bound keys even when a shadow-DOM
  // field owns focus. Stop propagation early, but retain native editing defaults.
  const protectEditing = e => {
    const path = e.composedPath(), target = path[0];
    if (path.includes(UI.root?.host) && (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || ''))) {
      e.stopImmediatePropagation();
    }
  };
  for (const type of ['keydown', 'keypress', 'keyup']) W.addEventListener(type, protectEditing, true);
  Combat.init(); Loot.init();
  bus.on('character', name => {
    const key = name ? 'profile:' + name : 'profile:default';
    if (key !== Settings.profileKey) { Town.lastScrollPoint = null; stopAll(); Settings.useCharacter(name); }
  });
  bus.on('profile', () => { Town.lastScrollPoint = null; SpeedScroll.reset(); Party.reset(); Resurrect.reset(); stopAll(); Restock.cancelRecording(); Loot.reset(); Wardrobe.applyNow(); UI.draw(); });
  bus.on('phase', phase => {
    if (phase !== 'world') {
      Party.reset();
      SpeedScroll.reset();
      Resurrect.reset();
      if (Town.phase(phase)) { Loot.reset(); return; }
      const revival = phase === 'entering-world' && Hunt.running && (Town.autoRevive() || Hunt.cfg().onDeath === 'revive') && (Hunt.state === 'dead' || Hunt.revived);
      stopAll(); Restock.cancelRecording(); Loot.reset();
      Controller.resumeAfterRevive = revival;
    }
  });
  bus.on('failure', () => { stopAll(); Restock.cancelRecording(); UI.toast('Game connection failed; bot stopped.', 'warn'); });
  bus.on('reset', () => {
    if (Town.trip) {
      if (['recall-wait', 'reverse-wait'].includes(Town.trip.phase)) Town.trip.transition = true;
      else Town.fail('Unexpected world reset during town service.');
    }
    SpeedScroll.reset(); Party.reset(); Resurrect.reset(); Loot.reset(); Navigation.scene = null; Wardrobe.inv = Wardrobe.baseInv = Wardrobe.av = Wardrobe.baseAv = null; Wardrobe.body = '';
  });
  bus.on('attached', ({ late }) => { if (late) UI.toast('Attached after the game started. Reload for complete character data.', 'warn'); });
  bus.on('potion-empty', kind => UI.toast('Out of ' + kind.toUpperCase() + ' potions.', 'warn'));
  W.addEventListener('keydown', e => {
    if (!e.isTrusted || e.repeat || e.isComposing) return;
    const target = e.composedPath()[0];
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return;
    if (e.code === 'F8') { e.preventDefault(); e.stopImmediatePropagation(); toggleBot(); }
    else if (e.code === 'F7') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.shiftKey) UI.toggleVisibility();
      else UI.body.hidden = !UI.body.hidden;
    }
  }, true);
  Ticker.start(() => Controller.tick(), 100);
  setInterval(() => { Wardrobe.tick(); UI.update(); }, 500);
  W.SROLean = { version: VERSION, world: World, settings: Settings, hunt: Hunt, loot: Loot, speedScroll: SpeedScroll, resurrect: Resurrect,
    restock: Restock, town: Town, walkBack: WalkBack, navigation: Navigation, wardrobe: Wardrobe, wardrobeData: WdData, learned: Learned, controller: Controller, stop: stopAll, log: Log };
  Log.info('OpenSRO Bot Lean ready. F8 starts/stops; F7 folds; Shift+F7 hides/shows the window.');
}

installWorkerHook();
if (document.documentElement) boot();
else document.addEventListener('DOMContentLoaded', boot, { once: true });
