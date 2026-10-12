# nixxane bot

A compact OpenSRO bot for hunting, potions, pet loot and automatic town trips.

[Install / update the bot](https://raw.githubusercontent.com/nixxane/opensro-bot-lean/main/bot.lean.user.js)

## Quick start

1. Install the script with **Tampermonkey**. Disable any other OpenSRO bot script.
2. Reload the game after installing or updating.
3. In **Combat**, save your hunting spot and choose your attack skills, buffs and imbue.
4. In **Combat**, tick the monster kinds **Berserk** should be used on (only Giants by default; it fires once the gauge is full, so the gauge waits for a Giant). In **Loot**, choose what to collect, including **Magic stones** and **Attribute stones**. Tick **Equipment: only SoX** to take only Seal of Star, Moon and Sun equipment; gold, potions and other items follow their own switches. For pet collection, summon your pickup pet and select it as the collector.
5. In **Supplies**, set your HP/MP potion thresholds. Enable **Use beginner +100% speed scroll automatically** if wanted.
6. Press **F8** to start hunting.

Settings are saved separately for each character. The bot checks for updates on load and every 15 minutes; click **Update** beside the version when it appears, install, then reload when ready.

## Vigor and pet potions

Under **Supplies → Automatic potion use**:

- **Vigor potions:** tick **Use vigor potions** and set **Vigor when HP below** and **Vigor when MP below**. Vigor potions are used when your HP or MP drops that low and the normal HP and MP potions have not been enough.
- **Buying vigor potions:** under **Supplies → Potion restock**, tick **Buy vigor potions**, pick the **Vigor potion size** (Herb, Small, Medium, Large or X-Large; X-Large by default) and set **Vigor low stock** and **Vigor refill to**. Town trips and walking restock buy that size, and a trip is also started when the vigor stock runs low. If the potion merchant does not sell the size you picked, the trip stops with a message so you can choose another.
- **Pet recovery kits:** tick **Use recovery kits on my pets** and set **Pet HP below**. When an attack or pickup pet drops below that HP, the bot uses one recovery kit on it, choosing the smallest kit that covers the missing HP (or the largest if none does). Your own potions always go first. Each kit has to be seen consumed before the next one is used; a pet that does not take a kit is left alone for 30 seconds. It is off by default, needs the master **Use potions automatically** switch, and does not buy kits in town.

## Automatic town trips

With the town cycle on, the walking-route restock controls are hidden because every trip buys potions in town. The **On death** setting is replaced by the town revive option, and the rest thresholds only show while **Rest when low** is ticked.

Set this up once in **Supplies → Hotan scroll town cycle**:

1. Bind your recall to **Hotan** in the game. Use a return scroll, stop the bot, then click **Save arrival point** where you land.
2. Stand near and select each service, then save its point: **Warehouse**, **Potion merchant**, **Repair merchant** and **World statue / teleport**. Open the potion shop before saving its merchant.
3. Enable **Buy HP** and/or **Buy MP**, and set the low-stock thresholds. Set **HP refill to** and **MP refill to** in potion counts (defaults: **100 HP / 300 MP**). These targets apply to walking restock and every town trip, including full bags and revival. Town buys X-Large potions.
4. Enable **Use return scroll → town services → reverse return**. Enable the pickup-pet capacity option if wanted.
5. Carry gold, spare return/reverse scrolls and at least **two free character bag slots**. Save your hunting spot and start the bot.

When supplies run low or a bag reaches its capacity trigger, the bot recalls to town, handles pet loot, refills pots, repairs gear and reverses to the **last return-scroll point**.

- **Pet elixirs, magic stones and attribute stones:** stored in the warehouse. Stones are also deposited from your own bag; elixirs stay in your bag so alchemy can use them. Magic stones include the Astral, Luck, Steady and Immortal stones. Attribute tablets are not stones and count as other alchemy items.
- **SoX gear:** Star, Moon and Sun equipment is deposited in the warehouse from your own bag and from the pet, on the next trip that visits the warehouse. Nothing is stored right after pickup. SoX gear that is part of a saved buff set, the weapon chosen for alchemy, or matches the **Keep in pet (names)** list is never deposited. Switch it off with **Deposit SoX gear in the warehouse**.
- **Gear by required level:** list levels in **Also deposit gear requiring level** (for example `85`, or `80-90, 100`) and equipment of any kind that requires one of those character levels is deposited the same way, from your bag and from the pet. Listed gear is never sold, even if the warehouse cannot be used. The same protections apply as for SoX. Empty by default.
- **Other unprotected pet loot:** sold at the repair merchant. Ordinary equipment can be sold even with + or blue options.
- **Other seal/rare gear, supplies and matching Keep names:** protected. Existing character bag items are never sold.

If protected items fill a bag, the bot stays in town and asks you to free space.

## Buff weapon swapping

In **Combat → Buffs & imbue**, equip your buff weapon and optional shield, name the set and click **Save equipped buff set**. Repeat for other sets (such as cleric and bard), then put your combat gear back on.

Assign each selected buff to its set and enable **Swap weapons for assigned buffs**. While hunting, the bot equips each needed set, casts its buffs and restores your original combat weapon and off-hand. Keep one bag slot free. Assigned buffs are skipped while swapping is off.

Some buffs end when their weapon is removed. If observed, the bot skips that buff until its buff settings change. Interrupted or unconfirmed swaps stop hunting; use **Restore combat gear**, or inspect your equipment and choose **Use current gear**. Reloads discard unfinished recovery. Live-server swapping still needs confirmation.

## Weapon alchemy

Stop hunting/travel and put the weapon in your bag. In **Alchemy**, select it, set **Target +** and **Maximum attempts**, choose a weapon elixir and optionally enable matching-degree lucky powder, then click **Start alchemy**.

Stops at the target, attempt limit or missing materials. Failures can reduce +, damage or destroy the weapon. **Stop alchemy**, **Stop all** or **F8** prevents further attempts; a sent attempt can still finish. Unconfirmed results pause without retrying.

## Accepting resurrection

Tick **Accept resurrection from party members** under **Settings → Party**. When you are dead and a party member casts Rebirth on you, the bot answers Yes, whether or not hunting is running. Offers from players outside your party, and mutation offers, are left to you. The switch is off by default and saved per character.

If hunting was running when the character died, it resumes after a resurrection you accepted, whatever **On death** is set to: at the hunting spot it simply starts, up to 600 m away it walks back first, and anywhere else it stays stopped and tells you to use **Return & hunt**. The memory lasts 15 minutes; a revive you or the bot does yourselves resumes nothing. While this switch is on and an online party member is in view, a bot set to revive (or the town cycle's revive) waits up to 20 seconds instead of 5 before reviving itself, and never revives while a resurrection offer is open.

## Automatic reconnect

This is always on; there is no switch. When the connection to the game is lost (a server restart, a network drop), the bot waits for the game's own retries, then asks the game to resume, and if that fails re-enters the world with the login the page already holds, exactly like pressing Enter at character select. It keeps trying every few seconds, then every 30 seconds, for up to 12 hours. It never types or stores your password: if the login itself is gone after a restart, the status line says so and the bot waits for you.

Once the character is back, hunting that was running resumes: at the hunting spot it simply starts again, a little way off it walks back first, and if the character is somewhere else (another region, or you were in a town trip) it stays stopped and tells you to use **Return & hunt**. A bot that was stopped is reconnected but not started, and a dead character is never started. Choosing logout, disconnect, exit or restart yourself, or logging in or entering a character by hand, cancels automatic reconnect.

## Returning after death

Leave **Revive in town and reverse to last scroll point** enabled under the town-cycle settings. With the town cycle enabled, the bot revives, completes town services and reverses back to hunt. Hunting resumes within 30 metres of the last scroll point, or within your saved hunting area after death. Carry reverse scrolls.

If something stalls, use **Settings → Send bug report**, which opens a draggable report window over the game. Preview the diagnostics, optionally add an explanation and screenshot, then click **Send to developer**. Check screenshots for private details. Nothing sends automatically.

## Auto mastery and skills

Under **Settings → Auto mastery and skills** the bot can spend skill points for you, one confirmed level at a time. It is off by default and saved per character.

- **Masteries:** tick **Raise selected masteries automatically** and tick the masteries you want, in the order you want them raised. A mastery stops at your character level (or 120) minus **Keep this many levels below my level**. Level 0 is free; otherwise the price is the table cost of its current level.
- **Skills:** tick **Upgrade my rotation and buff skills automatically** to learn the next level of the attack, buff and imbue skills you already use. It applies the game's own requirements: the skill must be trainable and the next level of its group, and your mastery levels, prerequisite skills, STR, INT and skill points must be enough. Skills outside your rotations, buffs and imbue are never touched.
- **Reserve:** **Keep this many skill points unspent** is never spent on masteries or skills, for example to save points for something you will learn by hand.
- **Order:** **Spend skill points on** chooses masteries first, skills first, or alternating after each confirmed level.

It works while hunting is stopped and does nothing while you are dead or during a town trip. If the server refuses a level (for example its mastery total limit) the bot waits a minute before trying that one again.

## When the character uses normal attacks instead of skills

The main panel's status line now says why, for example "Combat: normal attack (1 cooling down)". The reasons are: not learned, paused after a server rejection (the bot skips a skill the game keeps refusing, for 5 to 40 seconds), cooling down, not enough MP, MP below your configured minimum, or no skills in the rotation for that monster class. The same reason is written to Settings → Recent activity (at most every 30 seconds) and included in bug reports as counts only, never skill names. A skill is only treated as rejected after a newer game update arrived and its cooldown still had not started.

When no monster is being attacked, the status line says why, counted from the monsters in view: for example "Monsters in view: 5. Skipped: 3: monster type is switched off (Combat > Hunt area > Monster classes); 2: too far (Hunt radius or Chase distance)." The reasons are: monster type switched off, level outside your minimum or maximum, name filters, too far, another player is fighting it, and recently given up. With nothing in view it says so. The same line is part of bug reports, as counts only.

**Avoid other players' targets** (on by default) skips a monster another player has just hit. Hits by your party members, and by their pets, do not count, so the bot joins the monsters your party is fighting.

## Anti-stuck

Under **Settings → Anti-stuck**, the bot watches for progress while hunting: a confirmed kill, XP, gold, a pickup, or damage to your target. If nothing happens for the set time (default 3 minutes), it recovers in steps: first it drops the current target, then it walks back to the saved hunting spot and resumes, and after the set number of failed recoveries (default 3) it stops hunting. Any confirmed gain clears the count. Resting, buffing, looting, shopping, town trips and manual control do not count as stuck.

## SoX alerts

When the bot confirms a pickup of Star, Moon or Sun equipment, it shows the item name and tier and plays a short chime. Turn it off with **Chime and notice when a SoX item is picked up** in **Loot**; **Test SoX chime** previews the sound. The count also appears under Session stats. It needs the item catalogue, which loads automatically when hunting starts, and it only announces bot pickups.

## Session stats

Open **Settings → Session stats** for hunting time, XP/hour, net gold, confirmed kills, deaths, potion use, pickups and SoX found. Totals pause when hunting stops and stay across toggles. **Reset session**, reloading or changing character clears them. Stats stay local to the page.

## Controls

| Control | Action |
| --- | --- |
| **F8** | Start or stop the bot |
| **F7** | Fold or unfold the panel |
| **Shift+F7** | Hide or show the panel; the bot keeps running |
| **Return & hunt** | Walk to the saved hunting spot, then start hunting |
| **Stop all** | Cancel hunting and automated trips; potion use has its own switch |

## If a town trip stalls on the way to a merchant

The main panel's status line and Send bug report now name what the walk is waiting for, for example "Town movement to the potion merchant: waiting; retrying collision route. No walkable route found through the loaded collision map." The bot never walks blindly through obstacles, so it keeps retrying until the route works or you press F8.

- **"Waiting for game collision data" / "Waiting for collision coverage":** the game has not given the bot a collision map for the town you arrived in. Reload the game and try again.
- **"No walkable route found":** save that service point again from open ground a few steps in front of the NPC (stop hunting, stand there, select the NPC and click its Save button).
- **"Blocked route (no progress for 20 s)":** something is physically in the way; check the character is not stuck behind another player or object.

## If something gets stuck

Read the return status on the main panel. Use **Settings → Send bug report**; the diagnostics it previews include recent return states, even after toggling the bot. Reloading clears that history.

After an update, reload the game and check the version shown in the panel.
