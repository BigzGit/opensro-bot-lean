# Obstacle pursuit and recovery

Implemented on `codex/obstacle-pursuit-recovery`, based on bot 1.2.100.

The bot now checks a selected enemy's approach before sending repeated combat commands. A blocked approach owns character movement until its detour completes or the target is stopped and released. Missing coverage, invalid start, search exhaustion, unreachable route, direct approach and valid detour are distinct outcomes. Unknown coverage waits five seconds and stops hunting without inventing a geometry ban.

Detours keep their route, use short collision-checked moves, replan on meaningful target/collision changes or loss of route progress, and have a bounded retry/episode budget. Arrival needs fresh state and a stability interval. Target HP changes alone never cancel a route. Failed approaches are remembered locally for 15 seconds, scoped to nearby positions, world epoch and collision revision. This is not a permanent obstacle map.

Known ranged skill reach permits one bounded trial before routing. Only positive local result impacts preserve successful ranged offense; local cast sends, party damage and repeated cast publications do not establish new damage. Unknown weapon reach is not fabricated. The bot cannot infer projectile visibility solely from a walking chord.

Escape checks object-wall reachability in addition to terrain admission. Recent breadcrumbs retain world/navigation identity; retreat uses short recent segments instead of a distant shortcut. A blocked terrain departure can leave a contiguous blocked prefix but cannot cross an object wall, reenter blocked terrain or use missing coverage. Every attempt tracks local admission separately from observed movement. Success requires fresh stable arrival and a second legal movement, so a small correction or cast timestamp cannot declare the character free.

The existing detection and detour switches remain available. Two new Settings options default off:

- **Recall to town if legal escape attempts fail:** requires enabled, valid town service and scrolls. It has a five-minute cooldown. The recovery trip completes services and stops in town; it does not reverse into the same trapped origin.
- **Keep detailed escape diagnostics locally:** retains up to 64 escape transition records with position/revision/dispatch context in `SROLean`'s `Trap` owner. They are not added to report uploads. Turning it off or changing world/profile clears the trace.

`SROLean.navigation.setClipQuery(fn)` is an optional synchronous read-only validation adapter. It receives `{ from, to, epoch, revision }` and must return `{ pose, epoch, revision }` matching the requested endpoint and current identity. Null, stale, shortened, incorrect-height or thrown replies reject movement. Without an adapter the existing bundle geometry is used. **No native worker query endpoint has been added to OpenSRO**, so production native-equivalent query integration remains dependent on that separate client API. Ordinary bot movement and server collision remain authoritative.

The implementation does not teleport, reset poses, disable collision or promise escape from a fully enclosed object. Missing or mismatched surface ownership is handled conservatively; use the optional adapter for stronger native validation. Exact tree-interior causes, long-running server corrections and background suspension still require controlled live validation.

Run `python build-lean.py`, `node --check bot.lean.user.js`, and `node lean.test.cjs`. The integration runner includes `lean.obstacle.test.cjs` with generated-script fixtures. Browser validation uses `node lean.browser.test.cjs <directory-containing-playwright>`. Optional game collision comparison uses `node lean.navigation.native.test.mjs <OpenSRO-checkout>` and requires generated game assets. Test results for the delivered branch are reported separately; these commands are not a claim of live-server verification.

## Validation on 2026-10-15

The final fork build and JavaScript syntax check exited 0. `node lean.test.cjs` passed 345 integration tests, including 30 obstacle/recovery regressions. The isolated headless Edge browser suite exited 0 with zero page errors. The local game collision comparison passed 30 legacy routes and 30 pursuit routes, with six enclosed approach pairs remaining unreachable. `git diff --check` exited 0. Rebuilding in the fork reproduced the reviewed userscript bytes.

No live account, production bot session, real scroll consumption or tree-interior recovery was exercised. The optional native clip adapter has behavioral tests and a documented contract, but still needs a separately provided client endpoint for live native-equivalent queries.
