// Check trusted repository metadata; never execute downloaded update code.
const Updates = {
  latest: null, busy: false, started: false,
  newer(version) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
    const current = VERSION.split('.').map(Number), candidate = version.split('.').map(Number);
    if (!candidate.every(Number.isSafeInteger)) return false;
    for (let i = 0; i < 3; i++) {
      if (candidate[i] !== current[i]) return candidate[i] > current[i];
    }
    return false;
  },
  async check() {
    if (this.busy) return;
    this.busy = true;
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
    try {
      const options = { signal: abort.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };
      const response = await W.fetch('https://api.github.com/repos/nixxane/opensro-bot-lean/commits/main', options);
      if (!response.ok) return;
      const { sha } = await response.json();
      if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) return;
      const base = 'https://raw.githubusercontent.com/nixxane/opensro-bot-lean/' + sha + '/bot.lean.';
      const metadata = await W.fetch(base + 'meta.js', options);
      if (!metadata.ok) return;
      const match = (await metadata.text()).match(/^\/\/ @version\s+(\d+\.\d+\.\d+)\s*$/m);
      if (match && this.newer(match[1])) this.latest = { version: match[1], url: base + 'user.js' };
      else if (match) this.latest = null;
    } catch {
      // Offline, rate limits and blocked requests are silent; try next interval.
    } finally {
      clearTimeout(timer); this.busy = false; this.render();
    }
  },
  render() {
    if (!UI.updateButton) return;
    UI.updateButton.hidden = !this.latest;
    UI.updateButton.textContent = this.latest ? 'Update ' + this.latest.version : 'Update';
    UI.updateButton.title = 'Open Tampermonkey to install, then reload the game when ready.';
  },
  open() {
    if (this.latest) W.open(this.latest.url, '_blank', 'noopener,noreferrer');
  },
  start() {
    if (this.started) return;
    this.started = true;
    void this.check();
    setInterval(() => { void this.check(); }, 15 * 60 * 1000);
  },
};
