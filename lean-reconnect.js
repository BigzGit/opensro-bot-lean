// Always-on reconnect. When the connection to the game is lost (a server restart, a network drop) the bot waits for the
// game's own retries, then re-enters the world with the login the page already holds, as the Enter button would.
// It never types or stores credentials: if the login itself is gone it says so and waits for you. Hunting that was
// running resumes once the character is back at the hunting spot. Choosing logout, disconnect, exit or restart yourself
// cancels everything, and so does logging in or entering a character by hand.
const Reconnect = {
  intent: null, attempts: 0, nextAt: 0, waitUntil: 0, backAt: 0, message: '',
  DELAYS: [4000, 10000, 20000, 30000], GIVE_UP_MS: 12 * 3600 * 1000,
  active() { return !!this.intent; },
  clear(message = '') { this.intent = null; this.attempts = 0; this.nextAt = this.waitUntil = this.backAt = 0; this.message = message; },
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
    const i = this.intent;
    if (!i) return;
    if (now() - i.since > this.GIVE_UP_MS) return this.clear('Gave up reconnecting after 12 hours.');
    if (World.inWorld()) return this.back(i);
    this.backAt = 0;
    const phase = World.phase, error = String(World.session?.error || '');
    if (['connecting', 'entering-world', 'reconnecting'].includes(phase)) { this.message = 'Reconnecting…'; return; }
    if (['signed-out', 'listing-servers', 'loading-roster', 'authenticating'].includes(phase) || /authentication required/i.test(error)) {
      this.message = 'The login is gone (server restart?). Log in and enter your character again; the bot resumes when you are back.';
      return;
    }
    if (now() < this.nextAt || now() < this.waitUntil) return;
    const n = this.attempts++;
    // First the game's own resume, then a fresh entry with the held login.
    const sent = this.send(n === 0 ? { kind: 'reconnect' } : { kind: 'enter-world', character: i.character });
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
    const H = Hunt.cfg(), pose = World.pose(), distance = H.center && pose ? dist2D(pose, H.center) : Infinity;
    if (Number.isFinite(distance) && distance <= Math.max(H.radius * 1.5, 600)) { this.clear(); UI.toast('Back in the game; resuming hunting.', 'info', 4000); Hunt.start(); }
    else if (Number.isFinite(distance)) { this.clear(); UI.toast('Back in the game; walking back to the hunting spot.', 'info', 4000); WalkBack.start(true); }
    else { this.clear('Back in the game, but not at the hunting spot. Use Return & hunt when ready.'); UI.toast(this.message, 'warn', 6000); }
  },
};
bus.on('phase', phase => {
  if (['disconnected', 'failed', 'reconnecting'].includes(phase)) Reconnect.lost();
});
Hook.observers.push(command => Reconnect.manual(command?.kind));
