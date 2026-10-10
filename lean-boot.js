function toggleBot() {
  if (Hunt.running || WalkBack.active || Restock.trip) stopAll();
  else if (Restock.recording) UI.toast('Finish or cancel route recording before starting the bot.', 'warn');
  else Hunt.start();
}

function boot() {
  UI.mount();
  Combat.init(); Loot.init();
  bus.on('character', name => {
    const key = name ? 'profile:' + name : 'profile:default';
    if (key !== Settings.profileKey) { stopAll(); Settings.useCharacter(name); }
  });
  bus.on('profile', () => { stopAll(); Restock.cancelRecording(); Loot.reset(); Wardrobe.applyNow(); UI.draw(); });
  bus.on('phase', phase => {
    if (phase !== 'world') {
      const revival = phase === 'entering-world' && Hunt.running && Hunt.cfg().onDeath === 'revive' && (Hunt.state === 'dead' || Hunt.revived);
      stopAll(); Restock.cancelRecording(); Loot.reset();
      Controller.resumeAfterRevive = revival;
    }
  });
  bus.on('failure', () => { stopAll(); Restock.cancelRecording(); UI.toast('Game connection failed; bot stopped.', 'warn'); });
  bus.on('reset', () => { Loot.reset(); Navigation.scene = null; Wardrobe.inv = Wardrobe.baseInv = Wardrobe.av = Wardrobe.baseAv = null; Wardrobe.body = ''; });
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
  W.SROLean = { version: VERSION, world: World, settings: Settings, hunt: Hunt, loot: Loot,
    restock: Restock, walkBack: WalkBack, navigation: Navigation, wardrobe: Wardrobe, wardrobeData: WdData, learned: Learned, controller: Controller, stop: stopAll, log: Log };
  Log.info('OpenSRO Bot Lean ready. F8 starts/stops; F7 folds; Shift+F7 hides/shows the window.');
}

installWorkerHook();
if (document.documentElement) boot();
else document.addEventListener('DOMContentLoaded', boot, { once: true });
