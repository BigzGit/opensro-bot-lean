# OpenSRO Bot Lean: project context and working guide

This is a handoff for DeepSeek or another coding assistant. Read this first, then inspect the current repository. This document is a snapshot, not a substitute for checking Git and the code.

## Current baseline

- Snapshot date: 2026-10-10.
- Authoritative repository: `C:\sroserver\opensro-bot-lean`.
- GitHub: https://github.com/nixxane/opensro-bot-lean
- Branch: `main`.
- Latest userscript release at this snapshot: **1.2.11**.
- Release commit: **`1b91c56`**, pushed to `main`.
- Install/download: https://raw.githubusercontent.com/nixxane/opensro-bot-lean/main/bot.lean.user.js
- Update metadata: https://raw.githubusercontent.com/nixxane/opensro-bot-lean/main/bot.lean.meta.js
- Latest validation: **59 integration tests**, JavaScript syntax check and headless browser checks pass.
- No active unfinished implementation at this handoff. The latest discussion diagnosed stale GitHub update metadata.

Check `git status --short`, `git log -5 --oneline` and the generated metadata before assuming these facts are still current. A documentation-only commit may follow the release commit without changing the userscript version.

## What the project is

A compact Tampermonkey userscript for `https://opensro.online/play*`. It adapts a supplied full OpenSRO Assistant into a lean bot with a Silkroad-style interface. It runs in the page context at document start and observes the game's simulation worker through a retained worker hook.

It is not the game server or the main game client. Do not edit those projects to implement bot features. The original full bot remains unchanged; its reviewed source is retained in `vendor/bot.js` as build input.

The panel lives inside an open shadow root on `#sro-bot-lean`. Runtime diagnostics are exposed through `window.SROLean`. The script detects another running SRO assistant and refuses to initialize a second copy.

## Architecture and files

| File | Responsibility |
| --- | --- |
| `build-lean.py` | Extracts selected original core code, applies Lean adaptations, assembles modules and emits release files. Runs the wardrobe generator first. |
| `vendor/bot.js` | Original reviewed assistant; preserve it. Contains retained world, commands, combat, potion and utility code. |
| `build-wardrobe.py` | Generates the retained wardrobe core. |
| `lean-settings.js` | Defaults, per-character persistence/import, statistics and pet-alert audio. |
| `lean-controller.js` | Coordinates hunting, restocking, return, loot and independent services. |
| `lean-loot.js` | Drop eligibility, categories, pet selection/setup, pickup confirmation/retries and full-bag alert. |
| `lean-party.js` | Party-matching acceptance and saved-listing auto-recruit. |
| `lean-resurrect.js` | Auto-resurrect fallen party members with a learned corpse-targeted skill. |
| `lean-walkback.js` | Saved-spot return and optional hunting resume. |
| `lean-navigation.js` | Collision-data capture and waypoint planning. |
| `restock.js` | Merchant route recording, buying and return; build uses its logic before the original UI section. |
| `lean-skills.js`, `lean-icons.js` | Learned-skill metadata recovery and verified asset/icon loading. |
| `lean-wardrobe-core.js` | Generated wardrobe appearance core; edit its generator/input adaptation, not generated output alone. |
| `lean-wardrobe.js` | Compact wardrobe browser. |
| `lean-ui.js`, `lean-skin.css` | Controls, shadow-DOM panel, refresh and styling. |
| `lean-boot.js` | Initialization, lifecycle resets, hotkeys and keyboard isolation. |
| `lean.test.cjs` | VM-based integration tests against the generated userscript. |
| `lean.browser.test.cjs` | Headless Edge/Playwright tests using an isolated mock game and local assets. |
| `bot.lean.user.js`, `bot.lean.meta.js` | Generated installable script and update header; commit both for releases. |

Important runtime objects: `World` mirrors observed game state; `Cmd` submits native gameplay commands; `Hunt` drives combat; `Loot`, `Restock`, `WalkBack`, `Party` and `Resurrect` own their state machines. `Controller.tick()` runs every 100 ms. UI/wardrobe updates run every 500 ms. A local command dispatch is not proof of server success: wait for matching state changes where required.

## Features and behaviour to preserve

- Combat rotations, buffs, imbue, berserk, potions, loot, merchant restocking and saved hunt spots.
- Skill icons and recovered missing Thunderdragon Force level 13 metadata. Only learned skills are offered.
- Collision-aware walk-back and restock travel use loaded navigation data. Recorded routes remain supported.
- Loot categories include elixirs, powders and other alchemy items. Ownership, exclusion and capacity checks apply even to name-included items.
- Pickup success requires a matching inventory/gold gain. Despawn alone is not success. These are correlated state changes, not transaction-ID receipts.
- Pet collector has **no character fallback**. Broad native auto-grab is disabled and server confirmation is required before selective pickup commands.
- As of **1.2.11**, pets collect alongside combat, including casting and incoming attacks. Their pending pickups and retries must not take over the character's combat tick. The finish-fight setting applies only to **character pickup**.
- Pet requests still wait for busy inventory transactions and potion priority. Manual pause, death, stop and restock interruption remain respected.
- Pet-full alert: optional soft three-note chime and notice, once per full-bag episode, with a 30-second cooldown. Frees/rearms when space returns. Existing stacks may still merge. Loot includes a test-sound button.
- Wardrobe retains compatible paid cosmetics as local appearance previews, without changing real inventory or granting ownership.
- `F8`: start/stop hunting or return. `F7`: fold. `Shift+F7`: hide/show the entire panel without stopping the bot.
- Typing in bot fields must not activate game shortcuts. `lean-boot.js` stops keyboard propagation for bot editing controls without preventing native editing defaults. Shadow-root focus must be used when protecting controls from refresh overwrites.
- Automatic potions remain controlled by their own switch, separately from hunting.

### Party automation

The party switches default off and are saved per character. They operate whenever enabled, **even while hunting is stopped**. This was explicitly requested by the user.

- **Auto-accept party-matching joins** accepts applications to the local player's own matching listing when solo/forming or party leader, with capacity and expiry checks.
- Ordinary party invitations, guild invitations and trade requests are not automatically answered.
- **Auto-recruit** includes matching acceptance and registers a missing listing from saved title, level range, purpose and sharing choices.
- Existing listings are preserved. Existing party sharing options override saved new-party options.
- Registration requires solo level 5+ or leadership with room. Capacity is 4 without shared EXP or 8 with it. Current client listing range is 1-90; title length is 1-50 characters. Job-suit restrictions determine allowed purposes.
- Missing listings can be restored when space opens, with at least 30 seconds between registrations.
- Unconfirmed registration does not blindly repeat. A status message asks the user to check the game and toggle Auto-recruit to retry.
- **Auto-resurrect** casts a learned corpse-targeted row (DeadBody target bit 128 of the client catalogue, the Rebirth family) on a fallen party member whose corpse entity is in view, preferring the highest mastery requirement. The sim worker replaces a press gid with the newest selection intent (`core.ts`), so the corpse is selected immediately before the press; the server walks the caster into reach and proposes the revival. The dead member still has to accept; refusals and timeouts are invisible to the caster.
- Offers repeat per member only after the server's 30 second answer window (31 s here) and clear when the member revives or leaves the party. A fresh manual-control command pauses offers for `manualPauseS`. Dead targets stay refused for every other targeted skill.
- Turning off Auto-recruit leaves an existing listing in place. The separate auto-accept switch may still be on; disable both to stop all party automation.
- Native acceptance command: `{ kind: 'party-match-answer', a, b, answer: 1 }`. IDs come from the current request, and expiry uses simulation time.
- Native registration command: `{ kind: 'party-match-register', registration: { party: 0, type, purpose, min, max, title } }`.

## Local evidence for game behaviour

The separate checkout `C:\sroserver\opensro` has been used read-only to verify native client contracts. Useful locations under `apps\client-next\src\engine`:

- `foundation\gameplay\party-matching.ts`: matching state, request correlation, deadlines, registration fields, capacity and purpose restrictions.
- `foundation\gameplay\social.ts`: party identity, leader, options and members.
- `runtime\simulation\worker\session\world\gameplay\gameplay.ts`: command dispatch and published gameplay state.
- `runtime\simulation\worker\session\world\gameplay\cos-pickup.ts`: native pet collection behaviour.
- `runtime\platform\platform.ts`: game keyboard listeners that can consume typed keys.
- `runtime\ui\ui.ts`: native UI command payloads.

Read applicable `AGENTS.md` files before working in any repository. Rules in the separate game repository are scoped there; this bot task does not authorize modifying it. Prefer verified contracts over guessed command names or fields.

## How we work

1. Inspect current files, Git status and relevant callers/tests. Preserve unrelated user changes.
2. For reported bugs, reproduce the behaviour with a meaningful regression test when practical. Explain the confirmed cause, then fix it in source modules.
3. Keep the bot lean. Avoid bringing back unrelated full-assistant panels or adding broad rewrites for a small feature.
4. Keep independent actions independent: pet pickup must not pause combat; party automation must not depend on hunting. Preserve explicit manual controls and lifecycle resets.
5. Test state-machine failures: missing state, pending transactions, expiry, duplicate commands, disconnect/reset and feature-disable paths.
6. Use plain language in UI labels and short progress updates. The user prefers implementation over repeated permission questions for already-authorized work.
7. Be accurate about evidence: mock tests are not live-account testing. Do not claim a sound was audibly verified merely because Web Audio nodes were scheduled.
8. Do not spawn subagents unless explicitly requested or required by applicable instructions.
9. Use UTF-8 explicitly for Python reads/writes and preserve LF. Windows default encodings caused a documentation write failure earlier; avoid implicit encodings and PowerShell output redirection for source edits.
10. Do not publish browser profiles, generated screenshots, personal settings, secrets or unrelated files. Stage explicit paths and review the diff.

## Versioning and release workflow

We use incrementing `major.minor.patch` versions. Recent small feature/fix releases advanced from 1.2.5 through 1.2.11. **1.2.11 is newer than 1.2.9**; the patch component is an integer, not a decimal digit. Do not reuse a published version for changed script behaviour.

For a userscript release:

1. Edit source modules. Update documentation and meaningful regression tests.
2. Increase **both** version strings in `build-lean.py`: the userscript `@version` and runtime `VERSION`.
3. Build and validate from the authoritative repo:

```powershell
python build-lean.py
node --check bot.lean.user.js
node lean.test.cjs
node lean.browser.test.cjs C:\Users\nizam\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules
git diff --check
```

The browser test needs elevated execution in the current Codex environment. It launches headless Edge with the isolated `browser-test-profile/` directory, generates local screenshots and uses simulated game state. Do not substitute the user's browser profile or connect to their live account without authorization. On another machine, adapt the Playwright package directory and Edge executable path.

4. Review source and generated diffs. Check that both generated headers and runtime version agree.
5. Commit source, tests, relevant docs and both generated release files together. Push `main` to `origin`.
6. Verify the push. Where diagnosing delivery issues, fetch both public raw files and check their actual versions; local build success is insufficient.
7. Update local copies as below. Report version, commit, validation and limitations.

Documentation-only changes do not need a userscript version bump or regenerated artifacts.

### Local copies and authorization

The user has authorized committing/pushing bot updates to the public repo and updating the Downloads copy with a backup. Do not repeatedly ask for permission for these authorized actions; comply with any execution-environment approval requirements.

- `C:\sroserver\srobot`: development mirror. Copy changed Lean source/build/test files and generated artifacts. The repo README is copied there as **`LEAN-README.md`**, not over the original project's README.
- `C:\Users\nizam\Downloads\srobot`: install copy. Back up existing `bot.lean.user.js` and `bot.lean.meta.js`, then replace them and verify hashes against the authoritative repo.
- Backup naming used: `<filename>.before-<new-version>-yyyyMMdd-HHmmss.bak`.
- Never overwrite original `bot.js` or `bot.original.js` copies.
- Latest completed install-copy update: 1.2.11, backup suffix `before-1.2.11-20261010-105257.bak`.

## Tampermonkey update issue: last diagnosis

Immediately after publishing 1.2.11, the user reported "found no update."

Direct HTTP checks showed:

- `main/bot.lean.meta.js` still served **1.2.10**.
- `main/bot.lean.user.js` served **1.2.11**.
- Metadata at immutable release commit `1b91c56` correctly served **1.2.11**.
- Raw responses advertised `Cache-Control: max-age=300`.
- Adding `?v=1.2.11` to the metadata URL still returned the older metadata during that check.

This was stale public metadata delivery, not a missing local version bump. Do not assume query parameters always bypass the cache. Suggest waiting and checking again, or opening the direct userscript install link and verifying the installer shows the desired version. Reload the game after updating. If it persists, inspect the installed version and update/download URLs before changing code.

## Recent release history

| Version | Commit | Change |
| --- | --- | --- |
| 1.2.5 | `f7d4e02` | Shift+F7 hides/restores the panel. |
| 1.2.6 | `6225f85` | Pet setup only during active hunting; deferred revival return; preserve resume intent on repeated walk-back. |
| 1.2.7 | `7db5468` | Pet-full chime, toggle and test button. |
| 1.2.8 | `78d8267` | Opt-in party-matching auto-accept. |
| 1.2.9 | `599c5a8` | Saved listing and independent auto-recruit. |
| 1.2.10 | `b585a53` | Isolate field typing from game shortcuts; preserve focused controls during refresh. |
| 1.2.11 | `1b91c56` | Pet collection runs alongside combat; finish-fight is character-only. |
| 1.2.12 | `pending` | Auto-resurrect: Rebirth cast on fallen party members, opt-in and independent of hunting. |

## Remaining practical limitations

Live-server combat/pickup timing, navigation, merchant purchases and party registration/re-listing have not been validated on the user's account. Browser tests are deliberately isolated. Collision planning is conservative and mainly outdoor/town-oriented; dungeon routes and narrow passages may require recorded routes or manual intervention. The server remains authoritative over movement, loot, party membership and transactions.

Full-page reload matters: the worker hook and keyboard guard should install at document start, before game listeners. Updating the script file does not replace the already-running copy in an open game page.
