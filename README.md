# OpenSRO Bot Lean

[Install / update in Tampermonkey](https://raw.githubusercontent.com/nixxane/opensro-bot-lean/main/bot.lean.user.js)

The public source repository is [nixxane/opensro-bot-lean](https://github.com/nixxane/opensro-bot-lean). Version 1.2.2 adds Tampermonkey update and download URLs. Install from the link above once and enable script update checks in Tampermonkey. Future published versions are detected using `bot.lean.meta.js` and downloaded from `bot.lean.user.js`; reload the game after updating.

The compact edition is `bot.lean.user.js`. It retains hunting, attack rotations by monster class, buffs, imbue, berserk, automatic potions, looting, merchant restocking, saved hunting locations, collision-aware walk-back and the wardrobe.

The full `bot.js` remains unchanged. Lean uses its own per-character settings namespace, so trying it does not overwrite your old assistant's settings.

## Install

1. Disable the original OpenSRO Assistant userscript in your userscript manager.
2. Install `bot.lean.user.js` as a new userscript and reload the game.
3. Optionally use **Settings → Import original bot settings** to copy your character's combat, potion, hunt, restock and wardrobe settings (including saved outfits). Review the imported settings before starting.
4. In **Combat → Hunt area**, set your hunting spot. In **Skills**, click learned skill icons to build your attack rotation; use **Buffs & imbue** for self buffs and weapon imbue.
5. Press **F8** or click **Start / stop**. **F7** folds or unfolds the panel.

Both scripts must not run together. Lean detects another active assistant and declines to start. Reload after disabling the other script.

## Controls

- **Combat:** saved hunting spot, area/chase distances, mob filters and classes, per-class attack rotations, self buffs, imbue and berserk. Empty class rotations can fall back to Normal. Click icons to select skills; gold borders mark selections. Numbered slots show attack order, and row arrows reorder it. Hover or focus an icon for its name, level, MP cost and cooldown. Search filters learned skills.
- **Loot:** item categories, include/exclude name filters, collection radius, bounded retries, and whether to finish the current fight before collecting. This is enabled by default in a fresh profile and when importing the original profile.
- **Supplies:** HP/MP thresholds, vigor/cure use, and automatic potion buying. To set up buying, open a potion merchant's shop, record a route, close the shop, walk to the hunting spot, then finish the recording. Choose potions and refill quantities and enable buying.
- **Settings:** rest/recovery, death behaviour, manual-control pause, stop conditions, profile import and export, and recent activity.
- **Wardrobe:** compatible equipment and avatar skins, pet and mount looks, name/code search, degree/seal filters, weapon/shield glow, matching sets, random outfits, undo and saved outfits. **Avatars / paid skins** shows all compatible avatar hats, dresses, attachments and flags in one paginated list, including items you do not own. You can also filter by avatar slot. Equipment degree/seal filters never hide avatar looks; switching slots clears stale filters and search. Compatible Honor variants previously excluded by the original bot are included. Looks change only your rendered character; real inventory, stats and command data remain unchanged. Available models come from the live game's catalogue; new art cannot appear without corresponding game assets. Previewing a paid skin does not purchase it or grant account ownership.
- **Walk back:** return to the saved hunt centre. **Return & hunt** starts hunting on arrival. Uses the game's loaded outdoor collision product to plan around blocked terrain and object walls, through open gaps and linked portals. Replans when collision coverage changes and as it advances through sectors. Restock travel uses the same planner. Recorded merchant routes still supply useful intermediate destinations.
- **Stop all:** cancel automated fighting, collection, buying and returning. Potions remain controlled by their separate enable switch.

## What changed

The full assistant is about 1.16 MB. Lean 1.2.2 is about 264 KB, around 77% smaller by bytes, including the restored wardrobe. It does not include the custom map, radar, character viewer, inspection tools, social/quest panels, bestiary, drop encyclopedia, chat macros or GM panel.

Lean reuses the original bot's Silkroad window, button, tab and checkbox textures. Skill grids, buff and imbue pickers show game icons with names, tooltips and cooldown overlays. Weapon imbue is visible directly under the attack rotation as well as in Buffs & imbue. Thunderdragon Force belongs here. The highest learned level of a group is displayed and resolved automatically after upgrades; unlearned levels are never added.

Skill metadata normally comes from existing worker state. If a learned skill's metadata is missing, Lean lazily recovers its name, icon, level and cast type from the verified skill/text assets. The wardrobe loads its model/item/text catalogues only when opened or when restoring saved appearance overrides. Icons and catalogues share the original verified cache/pack reader. If an icon cannot load, a text fallback and tooltip remain available.

A single controller chooses the active job: combat, collection, shopping, route recording or returning. Automatic potion use remains available during other jobs.

Collection now:

- Checks ground-item ownership and pickup claims against your character and party.
- Finishes the current fight, then chooses nearby eligible loot before acquiring another mob (with an option to collect during a fight when not under attack).
- Keeps a pickup approach alive while movement makes progress, instead of abandoning it at 4.5 seconds.
- Cancels and retries a stalled pickup, with a configurable limit and increasing backoff.
- Allows existing stacks to merge when the bag has no empty slots. When the stack ceiling is unavailable, the server decides capacity; a refusal suppresses that drop until inventory changes.
- Requires a matching inventory or gold gain to count a pickup. A disappearing drop alone does not count as success. These are correlated state changes, not a server transaction-ID receipt.
- Gives control back to combat when attacked and to the player after manual commands.

## Limits and validation

Walking routes cannot contain teleports or transitions between different worlds/dungeons. Automatic collision planning currently supports outdoors and towns. It uses a conservative 20-unit grid with object-wall checks; narrow passages and stacked surfaces can still require a recorded route or manual intervention. For dungeon travel, a recorded walking route is required. The game retains final movement/collision authority.

Reload after installing so the bot observes the game's collision admission messages. Without current collision coverage, walk-back waits instead of blindly clicking through walls; an existing recorded route can be replayed when collision data is unavailable. No route or 20 seconds without movement stops the return. This has been tested with simulated walls and terrain, not a live town-to-hunt trip on your account.

Lean preserves the reviewed worker-hook and combat code from the supplied bot. Native skill metadata supplies MP costs and cooldowns; self buffs use the live buff list, with a fallback delay when the game does not expose an effect.

Validation completed:

- JavaScript syntax check.
- 23 integration tests covering the previous loot/combat/restock behaviours plus collision-wall detours, sealed terrain, missing collision coverage, movement away from a destination during a detour, Thunderdragon level 13 selection/casting, compatible Honor skins, all paid-avatar slots independent of ownership/equipment filters, and renderer/inventory isolation.
- Headless Edge tests covering actual boot, worker-message hooks and captured collision routing; verified gzip/Range-pack image loading; missing Thunderdragon level 13 metadata recovery and selection; lazy wardrobe loading, skins, glow, presets, search and icon bounds; controls, hotkeys, cancellation and desktop/mobile bounds. No page errors were observed. The test uses simulated game state and local mock assets. Wardrobe catalogues are not requested before the wardrobe is opened; the skill catalogue is not requested unless learned metadata is missing.
- Desktop and narrow-screen screenshots inspected.

Live-server combat, loot timing, merchant transactions and navigation have not been tested on your account. Test one short hunting session with a small restock target before leaving it unattended.

## Build and test

`build-lean.py` extracts the retained worker/world/command/combat core, renderer-copy helpers, selected original skin textures and verified asset reader from the reviewed full `bot.js`. It runs `build-wardrobe.py` to retain the original validated wardrobe appearance core. Lean modules add the panel, collision planner, learned-metadata recovery, compact wardrobe browser and bot controller. The full bot's original `walkback.js` stays separate from `lean-walkback.js`.

```powershell
python build-lean.py
node --check bot.lean.user.js
node lean.test.cjs
```

The browser test also needs Playwright and a separate test profile; its runner takes the directory containing the bundled Node packages as its second argument. It generates screenshots of simulated game state and does not connect to a game account. Browser profiles, generated screenshots and personal settings are not included in the repository.

## Publishing updates

In the repository, the original reviewed assistant is retained as `vendor/bot.js` for the build; install only `bot.lean.user.js`. Original author attribution remains in the userscript headers.

For a new release, increase both version strings in `build-lean.py`, run `python build-lean.py`, `node --check bot.lean.user.js` and `node lean.test.cjs`, then commit and push the source and generated outputs to `main`. The build writes matching userscript and metadata headers. Tampermonkey can only detect an update after the newer version has been pushed to GitHub.
