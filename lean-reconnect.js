// Always-on reconnect. When the connection to the game is lost (a server restart, a network drop) the bot waits for the
// game's own retries, then re-enters the world with the login the page already holds, as the Enter button would.
// It never types or stores credentials: if the login itself is gone it says so and waits for you. Hunting that was
// running resumes once the character is back at the hunting spot. Choosing logout, disconnect, exit or restart yourself
// cancels everything, and so does logging in or entering a character by hand.
// When the game itself fails to load ("Unable to finish loading") the page is reloaded after a short wait. The character
// and whether hunting was running are kept in localStorage across the reload; the game restores the login from its own
// session cookie, then the same reconnect steps below enter the world and resume hunting. At most 3 reloads per 30 minutes.
const Reconnect = {
  intent: null, attempts: 0, nextAt: 0, waitUntil: 0, backAt: 0, message: '',
  DELAYS: [4000, 10000, 20000, 30000], GIVE_UP_MS: 12 * 3600 * 1000,
  STORE_KEY: 'sro-lean-reload', LOAD_WAIT_MS: 15000, MAX_RELOADS: 3, RELOAD_WINDOW_MS: 30 * 60000, PENDING_MS: 10 * 60000, LOGIN_GRACE_MS: 60000,
  restored: false, failedAt: 0, expiredAt: 0, EXPIRED_WAIT_MS: 30000, snapAt: 0, gaveUp: false,
  // What survives a page reload: the last in-world snapshot, the reload times and the one reload waiting to be resumed.
  load() { try { return JSON.parse(window.localStorage.getItem(this.STORE_KEY)) || {}; } catch { return {}; } },
  save(data) { try { window.localStorage.setItem(this.STORE_KEY, JSON.stringify(data)); } catch {} },
  // The game's own loading screen says when it gave up; its label is only changed to this text on a failure.
  loadFailure() {
    if (typeof document === 'undefined') return '';
    const box = document.getElementById('startup-loading');
    if (!box || box.dataset.error !== 'true' || !/Unable to finish loading/.test(box.querySelector('.sro-boot-loading__label')?.textContent || '')) return '';
    return box.querySelector('.sro-boot-loading__detail')?.textContent || 'Unable to finish loading';
  },
  doReload() { window.location.reload(); },
  snapshot() {
    if (!World.inWorld() || !World.charName || now() - this.snapAt < 5000) return;
    this.snapAt = now();
    const data = this.load();
    this.save({ ...data, snap: { character: World.charName, hunting: !!(Hunt.running || Town.trip || WalkBack.active || this.intent?.hunting), at: Date.now() } });
  },
  // Right after a reload: pick the character up again exactly as after a lost connection.
  restore() {
    this.restored = true;
    const data = this.load(), p = data.pending;
    if (!p) return;
    this.save({ ...data, pending: null });
    if (!p.character || Date.now() - p.at > this.PENDING_MS) return;
    this.intent = { character: p.character, hunting: !!p.hunting, since: now(), reloaded: true };
    this.attempts = 1; this.nextAt = now() + 3000; this.backAt = 0;
    this.message = 'The page was reloaded; restoring ' + p.character + '.';
    Log.warn('The game failed to load earlier; page reloaded, restoring ' + p.character + '.');
  },
  // Save what to resume, then reload. Shared by a failed load and an expired session; limited to 3 per 30 minutes.
  reloadPage() {
    const data = this.load(), times = (data.times || []).filter(t => Date.now() - t < this.RELOAD_WINDOW_MS);
    if (times.length >= this.MAX_RELOADS) {
      if (!this.gaveUp) {
        this.gaveUp = true; this.message = 'Reloaded the page ' + this.MAX_RELOADS + ' times in 30 minutes; not reloading again. Reload it yourself.';
        Log.warn(this.message); UI.toast(this.message, 'warn', 8000);
      }
      return false;
    }
    const known = this.intent ? { character: this.intent.character, hunting: this.intent.hunting } : data.snap && Date.now() - data.snap.at < this.RELOAD_WINDOW_MS ? data.snap : null;
    this.save({ snap: data.snap, times: [...times, Date.now()], pending: known ? { character: known.character, hunting: !!known.hunting, at: Date.now() } : null });
    this.doReload();
    return true;
  },
  watchLoad() {
    const text = this.loadFailure();
    if (!text) { this.failedAt = 0; return; }
    if (!this.failedAt) { this.failedAt = now(); this.gaveUp = false; Log.warn('The game failed to load (' + text + '); reloading the page shortly.'); }
    if (this.gaveUp) return;
    if (now() - this.failedAt < this.LOAD_WAIT_MS) { this.message = 'The game failed to load; reloading the page shortly.'; return; }
    this.reloadPage();
  },

  active() { return !!this.intent; },
  clear(message = '') { this.intent = null; this.attempts = 0; this.nextAt = this.waitUntil = this.backAt = this.expiredAt = 0; this.message = message; },
  // The connection was lost while the bot may have been working: remember what to restore.
  lost() {
    if (!World.charName) return;
    const busy = !!(Hunt.running || Town.trip || WalkBack.active);
    if (!this.intent) { this.intent = { character: World.charName, hunting: busy, since: now() }; this.attempts = 0; this.nextAt = now() + 2000; this.message = 'Connection lost; waiting for the game to reconnect.'; Log.warn('Connection lost; reconnecting automatically.'); }
    else if (busy) this.intent.hunting = true;
    this.backAt = 0;
  },
  // The player took over: never fight their choice.
  manual(kind) {
    if (this.intent && ['logout', 'disconnect', 'exit', 'restart', 'login', 'enter-world'].includes(kind)) this.clear('Automatic reconnect cancelled.');
  },
  send(command) {
    if (!Hook.post) return false;
    try { Hook.post({ kind: 'session', command }); return true; } catch (e) { Log.warn('Reconnect command failed: ' + (e?.message || e)); return false; }
  },
  tick() {
    if (!this.restored) this.restore();
    this.watchLoad();
    this.snapshot();
    const i = this.intent;
    if (!i) return;
    if (now() - i.since > this.GIVE_UP_MS) return this.clear('Gave up reconnecting after 12 hours.');
    if (World.inWorld()) return this.back(i);
    this.backAt = 0;
    const phase = World.phase, error = String(World.session?.error || '');
    if (['connecting', 'entering-world', 'reconnecting'].includes(phase)) { this.message = 'Reconnecting…'; return; }
    if (['signed-out', 'listing-servers', 'loading-roster', 'authenticating'].includes(phase) || /authentication required/i.test(error)) {
      if (i.reloaded && now() - i.since < this.LOGIN_GRACE_MS) { this.message = 'The page was reloaded; waiting for the game to restore your login.'; return; }
      this.message = 'The login is gone (server restart?). Log in and enter your character again; the bot resumes when you are back.';
      return;
    }
    // "Your session ended while the connection was gone": the server dropped the world session (its resume window is 30 s),
    // so resuming can never work. Enter the character afresh; if that does not bring it back, reload the page, which
    // restores the login from the game's session cookie. The window's Confirm button would log out, so it is never pressed.
    const expired = phase === 'disconnected' && /session ended while the connection was gone|could not resume/i.test(String(World.session?.disconnectMessage || '') + ' ' + error);
    if (expired) {
      if (!this.expiredAt) { this.expiredAt = now(); Log.warn('The game session ended while the connection was gone; entering the character again.'); }
      else if (now() - this.expiredAt > this.EXPIRED_WAIT_MS && !this.gaveUp) { this.message = 'Still not back; reloading the page.'; if (this.reloadPage()) return; }
    }
    if (now() < this.nextAt || now() < this.waitUntil) return;
    const n = this.attempts++;
    // First the game's own resume, then a fresh entry with the held login.
    const sent = this.send(n === 0 && !expired ? { kind: 'reconnect' } : { kind: 'enter-world', character: i.character });
    this.nextAt = now() + this.DELAYS[Math.min(n, this.DELAYS.length - 1)];
    this.waitUntil = now() + (sent ? 8000 : 0);
    this.message = 'Reconnecting (attempt ' + (n + 1) + ')…';
    if (sent && n === 0) UI.toast('Disconnected from the game; reconnecting automatically.', 'warn', 5000);
  },
  // Back in the world: resume only what was running, and only when that is safe.
  back(i) {
    if (World.charName !== i.character) return this.clear();
    if (!this.backAt) { this.backAt = now(); this.attempts = 0; this.message = 'Back in the game; settling.'; return; }
    if (now() - this.backAt < 3000 || !World.local() || World.gp?.inventoryPending) return;
    if (!i.hunting || Hunt.running || World.isDead()) {
      this.clear(i.hunting && World.isDead() ? 'Back in the game, but the character is dead; hunting was not resumed.' : 'Back in the game.');
      return UI.toast(this.message, 'info', 4000);
    }
    const outcome = Controller.resumeHunting('Back in the game');
    this.clear(outcome === 'stopped' ? 'Back in the game, but not at the hunting spot. Use Return & hunt when ready.' : '');
  },
};
bus.on('phase', phase => {
  if (['disconnected', 'failed', 'reconnecting'].includes(phase)) Reconnect.lost();
});
Hook.observers.push(command => Reconnect.manual(command?.kind));
