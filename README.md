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
5. Press **F8** or click **Start / stop**. **F7** folds or unfolds the panel. **Shift+F7** hides or shows the entire window, including its header, while the bot keeps running. Press the same shortcut again to bring it back. Shortcuts are ignored while typing in input fields or chat.

Both scripts must not run together. Lean detects another active assistant and declines to start. Reload after disabling the other script.

## Controls

- **Combat:** saved hunting spot, area/chase distances, mob filters and classes, per-class attack rotations, self buffs, imbue and berserk. Empty class rotations can fall back to Normal. Click icons to select skills; gold borders mark selections. Numbered slots show attack order, and row arrows reorder it. Hover or focus an icon for its name, level, MP cost and cooldown. Search filters learned skills.
- **Loot:** independent gold, potions/cures, equipment, elixirs, lucky powders, other alchemy items/stones and miscellaneous-item switches. **Elixirs only**, **Elixirs + gold** and **All items** presets clear the include-name override; exclusions remain respected. Elixirs are identified by native item types, not English names. New alchemy switches inherit the previous Other items setting when loading an old profile. Include/exclude name filters, collection radius, retries and finishing the current fight remain configurable.
- **Pet collection (1.2.4):** summon your pickup pet and choose **Loot → Pet: elixirs only**, then start hunting. This selects the pet as collector and applies the elixir filter. The bot disables the pet's broad native auto-grab, waits for server confirmation, and sends `cos-pickup` only for eligible drops into the pet's own bag. You can change categories or use **Elixirs + gold** with the pet selected. No character fallback occurs if the pet is unavailable or full. Pickup requests pause near potion thresholds; each request temporarily shares the game's inventory transaction slot. Drops must be within the configured player radius and 500 game units of the pet. The Loot panel shows setup/bag status. A rejected setting change retries at most three times; you can then turn auto-grab off in the game's pet panel. Select **Character** to return to character collection.
- **Supplies:** HP/MP thresholds, vigor/cure use, and automatic potion buying. To set up buying, open a potion merchant's shop, record a route, close the shop, walk to the hunting spot, then finish the recording. Choose potions and refill quantities and enable buying.
- **Settings:** rest/recovery, death behaviour, manual-control pause, stop conditions, profile import and export, and recent activity.
- **Wardrobe:** compatible equipment and avatar skins, pet and mount looks, name/code search, degree/seal filters, weapon/shield glow, matching sets, random outfits, undo and saved outfits. **Avatars / paid skins** shows all compatible avatar hats, dresses, attachments and flags in one paginated list, including items you do not own. You can also filter by avatar slot. Equipment degree/seal filters never hide avatar looks; switching slots clears stale filters and search. Compatible Honor variants previously excluded by the original bot are included. Looks change only your rendered character; real inventory, stats and command data remain unchanged. Available models come from the live game's catalogue; new art cannot appear without corresponding game assets. Previewing a paid skin does not purchase it or grant account ownership.
- **Walk back:** return to the saved hunt centre. **Return & hunt** starts hunting on arrival. Uses the game's loaded outdoor collision product to plan around blocked terrain and object walls, through open gaps and linked portals. Replans when collision coverage changes and as it advances through sectors. Restock travel uses the same planner. Recorded merchant routes still supply useful intermediate destinations.
- **Stop all:** cancel automated fighting, collection, buying and returning. Potions remain controlled by their separate enable switch.

## What changed

Version **1.2.19** keeps town movement waiting for collision coverage or a walkable route instead of stopping after 20 seconds, two minutes or the former whole-trip 15-minute cap. It retries route planning every five seconds while waiting and replans after 20 seconds without movement progress. It resumes automatically when a route becomes available; **F8 / Stop all** cancels the wait. Merchant, inventory and scroll confirmation timeouts remain active.

Version **1.2.18** treats recall arrival as an area: **Supplies → Town arrival tolerance (m)** defaults to 50 m (configurable 10–150 m), replacing the fixed 12 m check. Nearby landing variation proceeds directly toward the saved warehouse/service approach point; you do not need to land on the recorded coordinates. Expected native world resets also confirm scroll travel once a fresh local player is available. Each scroll leg requires its own travel confirmation. Status distinguishes travel confirmation, inventory/cast settlement, distance outside the accepted area, and waiting for collision data. Reverse return retains its tighter 12 m destination check.

Version **1.2.17** corrects town-service recognition: equipment repair uses service bit `0x8`, not special trade `0x800`. **Save repair merchant** accepts Hotan's weapon/armour merchant with that repair service. **Save world statue / teleport** accepts the native `teleport` entity as well as eligible NPCs. Reverse return waits for the selected target's service menu and no longer sends an invalid Talk command to the statue. Missing-setup messages list only unsaved services. Existing saved locations remain compatible.

Version **1.2.16** fixes a town-departure scheduling bug during active combat or pet pickups. The capacity/supply trigger now reserves the controller immediately, stops repeating combat movement, and waits for the current cast/inventory operation to settle before using the return scroll. Hunting cannot start another action while departure is reserved. A 30-second settlement timeout stops the bot with a reason. Supplies now shows town readiness and missing prerequisites; the full-pet alert explicitly says when the scroll cycle is disabled. The chime remains independent of automatic return.

Version **1.2.15** adds an opt-in **Supplies → Hotan scroll town cycle**: low selected potion stock or a nearly full pickup pet triggers a return scroll, filtered pet-to-storage transfers, potion refills, equipment repair, then a reverse return to the last return-scroll point. The saved hunting state resumes only after arrival is confirmed. Recorded walking restock remains available when the town cycle is off.

### Set up the Hotan town cycle

1. Bind your recall to Hotan using the game's own recall setting. Return there once, stop the bot and click **Save arrival point** where the scroll places you.
2. Stand near and select each service NPC, then save **Warehouse**, **Potion merchant**, **Repair merchant** and **World statue / teleport**. Open the potion shop before saving its merchant to capture the available potions. The bot saves your reachable standing position for each approach; no town route recording is required.
3. Choose HP/MP potions, low-stock thresholds and refill targets in Supplies. Enable the new scroll-cycle switch. Choose pet storage categories and optional **Keep in pet (names)** exclusions. The trigger defaults to one or fewer free pet slots and can be disabled separately.
4. Carry gold, a return scroll, a reverse return scroll and at least one free character bag slot. Travel scrolls refill to two only if the saved merchant offers them as individual gold purchases. Carry spares where they are not sold; the bot never buys Item Mall scrolls.
5. Set the hunting spot and start hunting. Pet items move one at a time through the reserved character bag slot; only pet loot is stored, and existing character bag items are retained. Potions/cures, return/reverse scrolls, beginner speed scrolls, selected refill items and matching Keep names are protected.

The game spends the held reverse scroll through the saved teleport NPC's **last return-scroll point** choice. Town and return arrival, inventory gains/transfers and restored durability must be observed before proceeding. Missing collision coverage or blocked town paths keep the cycle waiting and retrying. Full storage, unavailable supplies, missing pets, failed repairs or unconfirmed commands stop the bot with a reason. Manual control, settings changes, unexpected travel/disconnection and **F8 / Stop all** cancel the cycle. Expected scroll transitions preserve it; a full reload does not restore an unfinished trip. Inspect any staged pet item left in the character bag after a failed transfer.

The saved arrival point verifies the destination; the script does not change your recall binding. Live-account town travel, storage fees and scroll timing have not been verified.

### Previous releases

Version 1.2.14 adds **Settings → Party → Maximum res distance from hunt spot (m)**, default **30 m**. Visible dead party members inside that radius can be reached with collision-aware walking, resurrected within the native skill range, then followed by a return to the saved hunting spot. While hunting is stopped, the radius and return point use your starting position instead. The bot holds hunting during the trip and cast, and resumes after returning; it does not wait for the recipient to accept. Each travel leg is limited to 30 seconds and 12 seconds without movement progress. Missing collision coverage, blocked routes, a member leaving/reviving and manual control are handled without blind movement. Blocked corpses receive a backoff; a blocked return stops hunting. F8 or Stop all cancels an active res trip. Distant/unloaded members are not followed.

**Supplies → Use beginner +100% speed scroll automatically** is off by default. When enabled, it uses only the native beginner scroll (item 24198) during hunting or automated travel, including walk-back and res travel. Its native buff (skill 31107) lasts one hour. Existing speed buffs are preserved; paid scrolls are never selected. Potions have priority, and scroll use waits for casting/inventory/manual/shop gates. Activation is confirmed from the live buff state, not inventory consumption (the beta starter stack may be unlimited). Three unconfirmed activations with increasing backoff stop further attempts until you toggle the option or the buff is observed.

Version 1.2.13 fixes resurrection during hunting: auto-res briefly owns the character's action while Rebirth casts, then hunting resumes without waiting for the recipient to answer. Potions remain active. It waits for an existing cast, MP and inventory transactions, and does not interrupt shopping or return travel. Native range limits apply when published. This also works while hunting is stopped.

Version 1.2.12 adds **Settings > Party > Auto-resurrect party members** (off by default, independent of hunting). It casts your learned Rebirth skill on a fallen party member whose body is in view, picks the highest-tier corpse-targeted skill you know, and re-offers the revival every 30 seconds while the member stays dead. The dead member still has to accept the revival, and fresh manual control briefly pauses new offers. Works while hunting is stopped; turn the switch off to stop offering.

Version 1.2.11 lets pickup pets collect during combat, including while the character is casting or under attack. Pending pet pickups and retries no longer hold up combat. The finish-fight option applies only to character pickup. Inventory transaction and potion-priority checks remain in place.

Version 1.2.10 isolates keyboard input in bot fields from game shortcuts, preserving normal typing, editing and Tab navigation. Focused checkboxes and dropdowns are no longer overwritten by the periodic refresh. Reload the game after updating so the keyboard guard installs before game listeners.

Version 1.2.9 adds **Settings > Party > Auto-recruit**, off by default and independent of hunting. Save a title, level range, purpose and new-party sharing settings. It registers a missing listing while solo (level 5+) or leader, accepts applicants, and restores missing listings when space opens. Existing listings and sharing settings are preserved. Registrations are at least 30 seconds apart; an unconfirmed registration waits for manual review and a toggle to retry. Disable Auto-recruit and the separate auto-accept switch to stop all recruitment automation; existing listings stay in place.

Version 1.2.8 adds **Settings > Party > Auto-accept party-matching joins** (off by default). It accepts applications to your own listing while leading or forming a party, even while hunting is stopped. Turn the switch off to stop accepting. It checks party capacity and request expiry, sends each acceptance once, and does not answer ordinary party, trade or guild invitations.

Version 1.2.7 adds a soft three-note pet-full chime while hunting with pet collection enabled. Toggle it or use **Test pet chime** in Loot. It alerts once when no empty pet slots remain, rearms after space is freed, and has a 30-second cooldown. Existing stacks can still merge. Click or press a key in the game to enable browser audio; the alert also displays a notice.

Version 1.2.6 fixes three control-flow bugs: pet auto-grab setup now runs only during active hunting (after manual-pause checks); revival return waits for pending inventory transactions and can be cancelled with F8; restarting walk-back preserves the request to resume hunting on arrival.

The full assistant is about 1.16 MB. Lean 1.2.4 is about 270 KB, around 77% smaller by bytes, including the restored wardrobe. It does not include the custom map, radar, character viewer, inspection tools, social/quest panels, bestiary, drop encyclopedia, chat macros or GM panel.

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
- Pet collection confirms matching inventory gains in the selected pet's bag. Broad native auto-grab stays off after stopping or switching collectors; re-enable it in the game's pet settings if desired. A pickup already submitted to the server can still finish after stopping or changing filters. A native auto-grab request already in flight when enabling selective mode can also finish; selective filtering begins after the setting acknowledgement.

## Limits and validation

Walking routes cannot contain teleports or transitions between different worlds/dungeons. Automatic collision planning currently supports outdoors and towns. It uses a conservative 20-unit grid with object-wall checks; narrow passages and stacked surfaces can still require a recorded route or manual intervention. For dungeon travel, a recorded walking route is required. The game retains final movement/collision authority.

Reload after installing so the bot observes the game's collision admission messages. Without current collision coverage, walk-back waits instead of blindly clicking through walls; an existing recorded route can be replayed when collision data is unavailable. No route or 20 seconds without movement stops the return. This has been tested with simulated walls and terrain, not a live town-to-hunt trip on your account.

Lean preserves the reviewed worker-hook and combat code from the supplied bot. Native skill metadata supplies MP costs and cooldowns; self buffs use the live buff list, with a fallback delay when the game does not expose an effect.

Validation completed:

- JavaScript syntax check.
- 109 integration tests covering the previous loot/combat/restock behaviours, collision routing, Thunderdragon level 13, wardrobe isolation and paid-avatar browsing, plus elixir presets, native item classification, capacity/ownership/exclusion checks, old-profile migration and cancellation after changing pickup filters. Pet tests cover acknowledged auto-grab setup, selective commands, pet bag capacity and gains, missing/foreign/dead/distant pets, potion priority, bounded setting retries, stop behaviour and controller integration. Regression tests also cover idle/manual/walk-back pet settings, deferred revival return, cancellation while waiting and repeated walk-back commands.
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
