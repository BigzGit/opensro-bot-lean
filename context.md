# OpenSRO Bot Lean: project context and working guide

This is a handoff for DeepSeek or another coding assistant. Read this first, then inspect the current repository. This document is a snapshot, not a substitute for checking Git and the code.

## Current baseline

- Snapshot date: 2026-10-10.
- Authoritative repository: `C:\sroserver\opensro-bot-lean`.
- GitHub: https://github.com/nixxane/opensro-bot-lean
- Branch: `main`.
- Latest userscript release at this snapshot: **1.2.23**.
- Release commit: use `git log -1 -- bot.lean.user.js` for the latest release.
- Install/download: https://raw.githubusercontent.com/nixxane/opensro-bot-lean/main/bot.lean.user.js
- Update metadata: https://raw.githubusercontent.com/nixxane/opensro-bot-lean/main/bot.lean.meta.js
- Latest validation: **118 integration tests**, JavaScript syntax check and headless browser checks pass.
- Latest work: opt-in Hotan recall/storage/refill/repair/reverse cycle. Live-account testing is still outstanding.

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
| `lean-speed-scroll.js` | Opt-in beginner +100% speed-scroll activation, buff confirmation and bounded retry. |
| `lean-town.js` | Scroll-based town service, selective pet storage, refills, repairs and reverse return. |
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
| 1.2.12 | `0d4e1e3` | Auto-resurrect: Rebirth cast on fallen party members, opt-in and independent of hunting. |

## Remaining practical limitations

Live-server combat/pickup timing, navigation, merchant purchases and party registration/re-listing have not been validated on the user's account. Browser tests are deliberately isolated. Collision planning is conservative and mainly outdoor/town-oriented; dungeon routes and narrow passages may require recorded routes or manual intervention. The server remains authoritative over movement, loot, party membership and transactions.

Full-page reload matters: the worker hook and keyboard guard should install at document start, before game listeners. Updating the script file does not replace the already-running copy in an open game page.

## Resurrection during hunting: 1.2.13

The published v1.2.12 implementation runs independently of hunting, including while stopped. A regression test showed its cast could be overwritten by the hunting tick in the same controller iteration. v1.2.13 makes `Resurrect.tick()` report action ownership while casting; the controller keeps potions running and yields fighting/loot movement until the authored action duration plus a buffer (or 6.5-second fallback) ends and any observed cast settles. Hunting stays enabled and resumes afterward, without waiting for party acceptance. Existing casts, MP, inventory, sitting/mounting, manual control, return travel and shopping are respected. Visible corpses outside the native skill range are skipped when range is supplied. Five new regression tests cover actual hunting-target restoration under attack, cast priority, transaction/MP gates, travel/shop exclusion and observed cast holds. No live-account resurrection has been verified.

A concurrent v1.2.12 implementation was found on origin and preserved. An unpublished alternative remains recoverable at local branch `saved/auto-res-targeted-0709284`; it is not part of the installed script.

## Configurable res travel and beginner speed scroll: 1.2.14

`party.resRadius` defaults to 300 game units (30 m), controlled in Settings → Party. During hunting, only visible corpses within this radius of the saved hunt spot are eligible; while stopped, the trip starts and returns at the current position. `Resurrect.trip` owns approach/cast/return movement via `Navigation.next` and keeps combat from replacing it. Cast range remains the native skill range (150-unit conservative fallback for absent metadata). Each leg has 30-second absolute and 12-second no-progress limits. Radius changes, member loss/revival, manual control, F8/Stop all, blocked paths and return failure are handled; return failure stops hunting. Native collision coverage is required for res travel, with no blind fallback.

`potion.speedScroll` defaults off. `lean-speed-scroll.js` uses only beginner scroll item 24198 (`ITEM_ETC_SPEED_UP_BASIC`), whose buff is skill 31107 (+100% for one hour); local game source confirms both. The code also recognizes the existing mall +100% buff 5411 and active catalogued speed buffs, without consuming paid items. It runs during hunting, walk-back, restock or res travel, after potion priority. Item dispatch is not confirmation: it waits for the buff, backs off on missing confirmation and caps attempts at three. Buff appearance rearms it; UI toggle resets attempts. Scrolls cannot interrupt an unobserved resurrection cast hold.

83 VM integration tests and the isolated browser UI checks passed. New tests cover approach/cast/return, radius anchoring and changes, collision detours, blocked/missing coverage, cancellation, revived targets, return timeout, exact scroll identity, existing buffs, no paid consumption, gating, activation confirmation and bounded retries. Live trips, scroll activation and resurrection remain untested on the user account.

## Hotan scroll town cycle: 1.2.15

The user authorized the return-scroll → Hotan storage/refill/repair → reverse-return cycle. `lean-town.js` owns `Town.trip`; its opt-in settings live at `potion.restock.town`. Enabled town service takes precedence over the existing walking restock. It uses the HP/MP selections and low/refill counts already in Supplies. A pickup-pet trigger defaults to ≤1 free slot. Store filters cover equipment/elixirs/powders/alchemy, with Other off and Keep name exclusions. Potions, cures, selected supplies, travel scrolls and beginner speed scrolls are protected; existing character bag items are never selected for storage.

Setup is deliberate: manually bind recall to Hotan, save the scroll arrival point, then stand near and select/save warehouse, potion merchant (shop must be open), smith and teleport NPC. Each service saves the user's reachable standing position plus the NPC identity/location. Town walking requires collision coverage, with no blind fallback. Arrival validates against the saved town point; no hardcoded Hotan NPC IDs and no automatic recall-binding change.

Native contract verified in the separate game checkout: return item type `0x09ec` uses `item-use`; reverse type `0x19ec` is consumed through the teleport NPC menu, `travel-gate {gid,type:5,target:2}` (last recall point). This is not a bag item-use or premium-package command. Select NPC, request `npc-talk`, wait for matching `npcConversation.phase === 'menu'` and capability `0x20000000` before reverse. `action/reversereturn.go`, `foundation/ui/npc-talk.ts` and runtime UI/core show this flow.

Pet storage requires `cos-transfer {gid,toCos:false,source,destination}` into one reserved character bag slot, then `storage-move {move:{type:2,source,destination,quantity:0,gold:0}}`. Correlated source disappearance and exact destination reference/quantity confirm each move. Staged items can remain in the character bag after failure; do not silently deposit other character items. Storage full stops before another transfer. Potion purchases require exact requested quantity gain. Travel scrolls refill to two only from single-item gold offers; if unavailable, spares must already be carried. No Item Mall buying. Repairs use `shop-repair {mode:2,slot:0}` and require restored durability, using native variance and magic-option maximum calculations.

`Controller` gives town service priority while retaining independent Party and emergency Potion ticks. It suspends combat, loot, auto-res and speed-scroll activation during the trip. Expected entering-world/reset transitions during recall/reverse waits preserve the trip; disconnects, unexpected resets, manual control, settings/profile changes and F8 cancel. Scroll arrival has a 90-second timeout even outside world, town legs 20-second no-progress/120-second total bounds, inventory operations 15-second confirmation limits with no repeat sends, and the whole trip a 15-minute cap. Stop requests `return-cancel` for an observed owned scroll cast. Final supplies, spare travel scrolls and durability must be valid before returning. No unfinished trip survives a full page reload.

99 integration tests, JavaScript syntax and isolated headless Edge checks passed. Sixteen new tests cover the full cycle, storage filters/protections, setup capture, bounded failures, fresh shop acknowledgement, exact quantity confirmation, scroll replenishment, repair confirmation, phase/reset persistence, manual/F8 cancellation and independent services. Browser tests exercise the actual toggle, saved arrival point, pet threshold and storage/Keep controls. Live-account travel, transfer fees and scroll/repair timing have not been tested. Update README/source/tests/build/artifacts in the development mirror and back up the Downloads install artifacts per the normal release workflow.

## Pet-full departure fix: 1.2.16

User reported the pet-full chime without a return. Reproduced a controller starvation bug with a failing regression test: Town.tick returned false before creating a trip whenever World.isCasting or inventoryPending was true, handing control back to hunting and allowing it to perpetuate those busy states. Town now latches a trip immediately on the enabled trigger, stops worker attack/movement with a move to current pose, then waits in recall phase for cast/inventory settlement. No more combat/loot ticks run during that wait. A 30-second settlement timeout fails safely. Existing opt-in, manual/travel exclusions and preflight prerequisites remain. This confirms a code defect, not the user's exact live settings; an asynchronous question requested their town-toggle state/status.

Town.status() reports disabled automation, readiness or missing setup/scrolls before triggering. Full-pet toast explains that the chime alone does not enable automatic return. Three new tests cover full-pet latching during casts/pending pickups, settlement timeout and readiness messages. Total 102 integration tests plus syntax and isolated browser checks pass. Live return remains unverified.

## Repair merchant and world statue: 1.2.17

User's screenshot showed arrival/warehouse/potion merchant saved, with smith and gate missing. User then reported Hotan's weapon merchant was rejected and the teleport target is a world statue. A new regression test failed before fixing the smith bit: native `NpcTalkFlagRepair` is `0x8`, whereas previous code incorrectly used special-trade `0x800`. Both save and open now require the repair bit. `serviceEntity` admits native `teleport` entities for gate save/lookup, preserving NPC support. The full-cycle fixture now uses an actual teleport-kind gate and smith capability `9`.

Native selection opens `npcConversation` directly. `npc-talk` requires capability `2` and is invalid on a statue that offers teleport/reverse only. Gate opening now waits for confirmed selection, reverse capability and matching menu without dispatching Talk. Evidence: game `npccapability.go`, worker `entities/entities.ts`, `gameplay/npc/npc.ts` and `gameplay.ts` selection/talk handling. UI labels are Repair merchant and World statue / teleport. Validation lists only missing services, and saving a service clears an old failure status. Existing saved points remain compatible. 104 integration tests, syntax and isolated browser checks passed; no live-account validation.

## Variable recall landing area: 1.2.18

User reported return-scroll use followed by a stall and explained that landing coordinates vary around the same area. Reproduced a nearby landing stuck in recall-wait with a failing test: the previous fixed 120-unit (12 m) arrival radius was too tight. New `potion.restock.town.arrivalRadius` defaults to 500 units (50 m), adjustable 10–150 m under Supplies. Old profiles inherit the default. Reverse return retains its 120-unit destination radius.

Expected world reset during recall-wait/reverse-wait now marks travel confirmation, and the tick still requires world state, fresh local entity, settled inventory and no return cast before accepting the destination. `Town.enter` clears the transition flag for each phase so reverse arrival cannot reuse recall confirmation. Both reset-only and phase-based transitions are tested. Status reports missing travel confirmation, unsettled scroll state, actual distance versus accepted tolerance, and collision-map waits during town walking. Four new tests bring the suite to 108; syntax and isolated browser tests also passed, including persistence of the tolerance control. Live-account arrival/navigation remains unverified. An asynchronous question requested the user's exact stalled status; no reply at implementation time.

## Town movement waits: 1.2.19

User reported slow loading ending with town movement blocked or collision data unavailable and requested waiting. Reproduced cancellation in the collision-wait regression after advancing 16 minutes. Town.walk now waits on missing collision coverage and no-route results, retrying every five seconds without blind movement. After 20 seconds without progress it clears the stale route and waits five seconds before replanning. Removed the two-minute movement leg limit and whole-trip 15-minute cap so they cannot cancel these waits. Individual scroll, service and transaction confirmation timeouts remain. Town.enter clears retry state; manual control, F8, settings changes and unexpected travel still cancel. The updated long-wait regression verifies automatic recovery when collision data arrives; a new test verifies retry spacing, no command flood, no-progress replanning and F8 cancellation. 109 integration tests, syntax and isolated browser checks pass. Live-account navigation remains unverified.

## Elixir storage and weapon-merchant sales: 1.2.20

User reported a no-walkable-route wait after storage, requested storing only elixirs and selling the rest at the weapon store. Town.eligible now selects only unprotected elixirs regardless of legacy store category settings. Town.sellable selects other unprotected pet loot; supplies, travel scrolls, beginner speed item, unknown types and Keep names remain protected. UI replaces category controls with the fixed policy. Weapon/repair shop now enters sell before repair; native cos-shop-sell sells directly from the pet bag. Native command, ownership, shop and payload contract verified read-only in game gameplay.ts, inventory.ts cosTrade and merchant.ts. Full-stack disappearance confirms each sale; no repeat on rejection/partial or missing acknowledgement. Selection and pet identity are checked; original bag items are never sold. Capacity is checked after sales instead of after storage.

Town movement accepts a collision-checked reachable point within up to 60 units of the saved approach, reduced to preserve native 200-unit service range. Navigation.next first attempts the exact goal, then retries A* with a bounded arrival radius only when no exact route exists. Other callers retain exact-goal routing. Waiting status names the service. A blocked saved-tile test verifies recovery and collision clearance; this does not prove the cause of the user screenshot, which does not expose the live collision map. Full-cycle test now confirms elixir-only storage plus non-elixir sales and protected survivors. New tests cover pending/partial sale timeout without duplication, wrong merchant, pet replacement and approach routing. 112 integration tests, syntax and isolated browser checks pass. Live-server selling and the reported Hotan route remain unverified.

## Valuable equipment sale protection: 1.2.21

User requested SoS and other good equipment never be sold. Reproduced a failing test showing the 1.2.20 sale predicate accepted native rarity-2 equipment. Native tooltip/item-slot code confirms rarity 2 for all seal tiers, ordinary rarity 0; InventoryItem carries plus and magic. Town.disposable now admits equipment only if tooltip.fields.rarity is exactly 0, plus is exactly 0, magic is an explicit empty array, and codename does not end in RARE/MAGIC/LEGEND/MYTH (optional HONOR). Thus enhanced, blue/magic, nonordinary and incomplete equipment metadata remain protected in the pet, not storage. Existing name exclusions and supply protections still apply. UI documents the policy. Two regression tests cover seals, other rarity, enhancements, magic, missing fields and confirmed ordinary-only sale followed by repair with valuable gear retained. 114 integration tests, syntax and isolated browser checks pass; live server sale behavior remains unverified.

## Native Hotan collision investigation: 1.2.22

User reported persistent collision-map/no-route wait after warehouse deposit on the way to Manina and requested thorough investigation. Traced worker navigation capture, reset handling, product schema, native terrain contact and A* parsing. Game source stayed read-only. Native object-navigation.ts navContactDetail ignores zero-flag outlines; terrain-indexed objects ignore internal edges and 0x10 surface borders and use terrainVisit registration. The bot converted these into global 2D walls. It also blocked both directions of native one-way edges. Fixed these edge rules, ignored empty terrain registrations and retained winding/source-cell direction for flags 1/2 with conservative handling of missing or degenerate winding. Real blocking outlines and terrain remain enforced.

Added lean.navigation.native.test.mjs (optional game-root argument, read-only licensed local assets). It uses the game generatedRoot resolver, native navigation resource loader, NPC 2083 warehouse and 2074 Manina at region 23687, and native createNavigation clipper. Resolved map contains nine regions and 67 objects. Before the fix all 36 sampled warehouse/manina approach pairs failed. Afterward 30 connected pairs route; every chord passes native clipping with sequential resolved height. The remaining six share the sample 60 units north of the warehouse, behind its structure; native grid traversal is confined there too (53 visited centres), so the test retains that limitation explicitly. No timeout extension or unchecked straight-line fallback was added. Two portable regressions cover ignored edges, retained walls and directional crossing rules; 116 integration tests plus browser/syntax/native checks pass. Exact user-saved coordinates and live account movement remain unverified.

## X-Large town potions and revised equipment sales: 1.2.23

User confirmed the collision fix works, withdrawing the preceding route-failure report. They requested X-Large purchases and selling all ordinary equipment regardless of plus. Town.supplies forces native ITEM_ETC_HP_POTION_05 ref 8 and ITEM_ETC_MP_POTION_05 ref 15, verified against local native itemdata/textdataname. It preserves enabled kinds/thresholds/targets from Restock and is used for trigger, validation and trip snapshot; buy/final checks use that snapshot. Offers still need matching native potion type and single-item gold semantics. Missing X-Large stock stops instead of substituting small. Walking-route buyer remains selectable; UI explicitly describes the town override.

Town.disposable now permits equipment rarity 0 or 1 regardless of plus/magic options; rarity 2 (all seals), rare/magic/legend/myth codenames, other/unknown rarity and Keep names remain protected. Missing plus/magic alone no longer protects ordinary gear. Updated actual-sale regression sells +12 blue ordinary gear while retaining sealed gear. Two new tests verify both X-Large purchases despite old small selections and no small substitution. 118 integration tests plus syntax/browser checks pass. No navigation changes were made following the withdrawn screenshot. Live purchases and sales remain unverified by the assistant.
