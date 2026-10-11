# nixxane bot

A compact OpenSRO bot for hunting, potions, pet loot and automatic town trips.

[Install / update the bot](https://raw.githubusercontent.com/nixxane/opensro-bot-lean/main/bot.lean.user.js)

## Quick start

1. Install the script with **Tampermonkey**. Disable any other OpenSRO bot script.
2. Reload the game after installing or updating.
3. In **Combat**, save your hunting spot and choose your attack skills, buffs and imbue.
4. In **Loot**, choose what to collect. For pet collection, summon your pickup pet and select it as the collector.
5. In **Supplies**, set your HP/MP potion thresholds. Enable **Use beginner +100% speed scroll automatically** if wanted.
6. Press **F8** to start hunting.

Settings are saved separately for each character. The bot checks for updates on load and every 15 minutes; click **Update** beside the version when it appears, install, then reload when ready.

## Automatic town trips

Set this up once in **Supplies → Hotan scroll town cycle**:

1. Bind your recall to **Hotan** in the game. Use a return scroll, stop the bot, then click **Save arrival point** where you land.
2. Stand near and select each service, then save its point: **Warehouse**, **Potion merchant**, **Repair merchant** and **World statue / teleport**. Open the potion shop before saving its merchant.
3. Enable **Buy HP** and/or **Buy MP**, and set the low-stock thresholds. Set **HP refill to** and **MP refill to** in potion counts (defaults: **100 HP / 300 MP**). These targets apply to walking restock and every town trip, including full bags and revival. Town buys X-Large potions.
4. Enable **Use return scroll → town services → reverse return**. Enable the pickup-pet capacity option if wanted.
5. Carry gold, spare return/reverse scrolls and at least **two free character bag slots**. Save your hunting spot and start the bot.

When supplies run low or a bag reaches its capacity trigger, the bot recalls to town, handles pet loot, refills pots, repairs gear and reverses to the **last return-scroll point**.

- **Pet elixirs:** stored in the warehouse.
- **Other unprotected pet loot:** sold at the repair merchant. Ordinary equipment can be sold even with + or blue options.
- **Seal/rare gear, supplies and matching Keep names:** protected. Existing character bag items are never sold.

If protected items fill a bag, the bot stays in town and asks you to free space.

## Buff weapon swapping

In **Combat → Buffs & imbue**, equip your buff weapon and optional shield, name the set and click **Save equipped buff set**. Repeat for other sets (such as cleric and bard), then put your combat gear back on.

Assign each selected buff to its set and enable **Swap weapons for assigned buffs**. While hunting, the bot equips each needed set, casts its buffs and restores your original combat weapon and off-hand. Keep one bag slot free. Assigned buffs are skipped while swapping is off.

Some buffs end when their weapon is removed. If observed, the bot skips that buff until its buff settings change. Interrupted or unconfirmed swaps stop hunting; use **Restore combat gear**, or inspect your equipment and choose **Use current gear**. Reloads discard unfinished recovery. Live-server swapping still needs confirmation.

## Weapon alchemy

Stop hunting/travel and put the weapon in your bag. In **Alchemy**, select it, set **Target +** and **Maximum attempts**, choose a weapon elixir and optionally enable matching-degree lucky powder, then click **Start alchemy**.

Stops at the target, attempt limit or missing materials. Failures can reduce +, damage or destroy the weapon. **Stop alchemy**, **Stop all** or **F8** prevents further attempts; a sent attempt can still finish. Unconfirmed results pause without retrying.

## Returning after death

Leave **Revive in town and reverse to last scroll point** enabled under the town-cycle settings. With the town cycle enabled, the bot revives, completes town services and reverses back to hunt. Hunting resumes within 30 metres of the last scroll point, or within your saved hunting area after death. Carry reverse scrolls.

If something stalls, use **Settings → Send bug report**. Preview the diagnostics, optionally add an explanation and screenshot, then click **Send to developer**. Check screenshots for private details. Nothing sends automatically. **Copy diagnostics** remains available.

## Controls

| Control | Action |
| --- | --- |
| **F8** | Start or stop the bot |
| **F7** | Fold or unfold the panel |
| **Shift+F7** | Hide or show the panel; the bot keeps running |
| **Walk back** | Walk to the saved hunting spot |
| **Return & hunt** | Walk back, then start hunting |
| **Stop all** | Cancel hunting and automated trips; potion use has its own switch |

## If something gets stuck

Read the return status on the main panel. Use **Supplies → Save return diagnostics** and share the downloaded file when reporting a problem. It keeps recent states even after toggling the bot, but reloading clears that history.

After an update, reload the game and check the version shown in the panel.
