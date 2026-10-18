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

## Session window and logs

Starting the bot opens **Current session**, with live hunting totals. The **▼ Show logs** button expands the shared activity history downward. Close the window to keep playing without it; hunting continues. **Session** reopens the same window, and stopping keeps the totals visible. Use **Reset session totals** to clear them explicitly.

All retained activity, including command messages, is available under **Settings → Recent activity** and in the session window. Both lists scroll and follow incoming entries only while you are at the bottom. History retains the newest 400 entries for this page.

Under **Supplies → Automatic potion use**, enter **Potion delay (ms)** as a whole number from 0 to 60000. The default is 350 ms. This minimum interval is saved per character; item cooldowns and inventory admission still apply.

Under **Town → Scroll town cycle**, enable the cycle, set up your recall town and services, and enable **Revive in town and use reverse return**. Choose **Death location** or **Last return-scroll location** for revival trips. Ordinary repair/sell/refill trips reverse to their departure point. Carry reverse scrolls; missing or refused destinations stop the trip without silently switching destinations. Existing protections for your character's inventory remain unchanged.

## Item rules

The **Items** page lists every item in the game with sBot-style filters (group, race, gender, type, degree, search, only items with a rule). Per item choose **Pick** always/never and one action: **Store** (warehouse on town trips), **Sell** (pet loot at the repair merchant), **Keep**, or **Drop** (thrown away from your bag or the pet while hunting, never picked up again). Click a cell, right-click a row, or use the bulk buttons for everything shown (second click confirms). Rules come first; other items follow the Loot switches. Your own bag is never sold, and supplies the town trip needs are never stored from it.

## Vigor and pet potions

Under **Supplies → Automatic potion use**:

- **Vigor potions:** tick **Use vigor potions** and set **Vigor when HP below** and **Vigor when MP below**. Vigor potions are used when your HP or MP drops that low and the normal HP and MP potions have not been enough.
- **Buying vigor potions:** under **Supplies → Potion restock**, tick **Buy vigor potions**, pick the **Vigor potion size** (Herb, Small, Medium, Large or X-Large; X-Large by default) and set **Vigor low stock** and **Vigor refill to**. Town trips and walking restock buy that size, and a trip is also started when the vigor stock runs low. If the potion merchant does not sell the size you picked, the trip stops with a message so you can choose another.
- **Buying arrows and bolts:** under **Town → Arrows and bolts**, tick **Buy arrows** and/or **Buy bolts** and set the **go to town at or below** count and the **refill to** count (2000 each by default, off by default). They are bought on a town trip at the repair merchant, after selling pet loot and before repairing. The count includes the stack in your ammunition slot and spare stacks in your bag, and a trip also starts when it falls to the low number. If the merchant does not sell the item, there is no bag space or not enough gold, that item is skipped with a notice and the rest of the trip goes on. Equipping the bought ammunition is up to you.
- **Pet recovery kits:** tick **Use recovery kits on my pets** and set **Pet HP below**. When an attack or pickup pet drops below that HP, the bot uses one recovery kit on it, choosing the smallest kit that covers the missing HP (or the largest if none does). Your own potions always go first. Each kit has to be seen consumed before the next one is used; a pet that does not take a kit is left alone for 30 seconds. It is off by default, needs the master **Use potions automatically** switch, and does not buy kits in town.

## Automatic town trips

With the town cycle on, the walking-route restock controls are hidden because every trip buys potions in town. The **On death** setting is replaced by the town revive option, and the rest thresholds only show while **Rest when low** is ticked.

Set this up once on the **Town** page, under **Scroll town cycle**:

1. Bind your recall to **Hotan, Jangan, Donwhang, Constantinople or Samarkand** in the game. Stop the bot, pick your town in the **Town** list and click **Set up this town**; you do not have to be in town. It saves the town's known arrival point (where its return scroll always lands) and fills the **Warehouse**, **Potion merchant**, **Repair merchant** and **World statue / teleport** from the server's NPC data, each as a spot a few metres from the NPC. It only fills what is empty; **Redo all automatically** replaces every saved point, and an arrival point from another town is replaced automatically. **Auto-set town services** does the same for the town you are standing in. If the saved arrival point is not where the scroll actually lands, the bot corrects it itself: after a recall it confirmed, once the character has stood still for three seconds in a known town, it saves that spot as the arrival point and carries on. This is only done in the town the saved services belong to.
2. To do it by hand instead, stand near and select each service, then save its point: **Warehouse**, **Potion merchant**, **Repair merchant** and **World statue / teleport**. Open the potion shop before saving its merchant. Manual saves override the automatic ones.
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

### What starts a town trip

The **Town** page shows the trip as a row of pictures (return scroll, warehouse, potions, repair, reverse) with what each step still needs, and lists what starts a trip under **Go to town when…**:

- Always: the character bag has one free slot or less. Potions, vigor potions and pills at their low-stock numbers (Supplies), and arrows and bolts at theirs (Town).
- **Return when pickup pet is nearly full**, with **Pet free slots ≤**.
- **Weapon is broken**: the equipped weapon is at 0 durability. On by default.
- **Gear is worn**: the most worn repairable item you are wearing is below **Gear durability below (%)** of its own maximum (15% by default). The trip repairs it. Off by default.
- **No XP for a while**: no experience for **No XP for (minutes)** (10 by default). Off by default.
- **On a timer**: every **Every (minutes)** (60 by default). Off by default.

The XP and timer clocks run only while hunting and restart with every trip, so a long trip never starts the next one. All of these need the town cycle on.

## Buff weapon swapping

In **Combat → Buffs & imbue**, equip your buff weapon and optional shield, name the set and click **Save equipped buff set**. Repeat for other sets (such as cleric and bard), then put your combat gear back on.

Assign each selected buff to its set and enable **Swap weapons for assigned buffs**. While hunting, the bot equips each needed set, casts its buffs and restores your original combat weapon and off-hand. Keep one bag slot free. Assigned buffs are skipped while swapping is off.

The Buffs & imbue page shows, for each buff assigned to a set, how long it has left and what the swap is waiting for, and says why when a buff is due but the swap cannot start (for example a saved weapon that cannot be found in the bag). The swap happens when a buff is about to end, not when you start hunting. A buff whose cast was only unconfirmed is tried again after two minutes.

Some buffs end when their weapon is removed. If observed, the bot skips that buff until its buff settings change. Interrupted or unconfirmed swaps stop hunting; use **Restore combat gear**, or inspect your equipment and choose **Use current gear**. Reloads discard unfinished recovery. Live-server swapping still needs confirmation.

## Item alchemy

Stop hunting/travel and put the item in your bag: a weapon, shield, armour piece or accessory. In **Alchemy**, select it, set **Target +** and **Maximum attempts**, choose an elixir (the list shows the elixirs of that item's kind) and optionally enable matching-degree lucky powder and the plus **Lucky powder from +**, then click **Start alchemy**. The tab shows the chance of the next attempt and how many elixirs to expect to reach the target, calculated from the server's own data (powder and Luck are counted the way the server counts them; skill and avatar bonuses are not), and a **Results** panel with attempts, successes, failures, destroyed items, the highest plus, what was used and a log of every attempt and fusion.

Under **Stones that help and protect** tick **Use Luck / Steady / Immortal / Astral stones while enhancing** for the helpers you want, set how many charges to keep on the item (1 to 6) and the plus each is used **from** (defaults: Luck 0, Steady 5, Immortal 5, Astral 4). Before every attempt at or above that plus, if the item has fewer charges than you asked to keep, one is fused automatically from a stone of the item's degree in your bag. Nothing is fused for a helper that is not ticked. **Fuse stones now** ignores the plus and only fills the charges. Each stone adds 1 to that attribute: Luck raises the enhancement success chance, Steady stops durability damage and Immortal stops destruction when an enhancement fails (none of them stops the + from resetting; an Astral stone does, from +4). The stone must be of the weapon's degree and in your bag, and adding a kind the weapon does not have yet needs a free magic option slot. The bot reads the weapon's current counts and only fuses what is missing, confirms each fusion by the stone leaving the bag, counts a failed fusion (the stone is used up and nothing changes) and carries on, and stops if a stone is missing, the game refuses, the counts cannot be read, or when it reaches the optional **Stop after this many fusions** limit (0 = no limit, the default).

Stops at the target, attempt limit or missing materials. Failures can reduce +, damage or destroy the weapon. **Stop alchemy**, **Stop all** or **F8** prevents further attempts; a sent attempt can still finish. Unconfirmed results pause without retrying.

### Item attributes

Under **Item attributes (stat percentages)** pick, for the item selected above, the lowest percentage you want for each stat (for a weapon: Phy. reinforce, Mag. reinforce, attack rating, Phy. and Mag. attack power, critical; armour, shields and accessories have their own list). Press **Fuse attribute stones**: the bot fuses attribute stones of the item's degree, working down the list, until every picked stat reaches its target. A successful fusion rolls the stat again, so it can come out lower, and it can re-roll another stat of the item, so the bot keeps checking all picked stats. The stone chance is 50% before bonuses and the high steps (80%, 100%) are rare, so set **Stop after this many attribute stones** (100 by default). It stops if a stone of the right kind is missing from the bag.

## Healing and buffing the party

On the **Party** page tick **Buff and heal party members** (off by default). The bot then supports the party with your own skills, one cast at a time, in this order:

1. **Group heal skill** (a skill without a target), when **Group heal when this many are low** members are below **Group heal below (%)**.
2. **Heal skill** on the member with the lowest HP below **Heal below (%)**; tick **Heal myself too** to include yourself.
3. **Party buffs**: pick them from your learned skills that can target a party member. Each goes to every member who does not show it, or only to the names you list under **Only these members**.

It casts only on members you can see within **Support range (m)** (30 by default) and never walks to them. HP is exact for members in view and in tenths otherwise, as the game's party window shows it. A buff that does not appear on the member after two tries waits a minute before the next. It runs while hunting; tick **Also while hunting is stopped** to support a party while you stand still. The top of the page lists the party with HP and MP bars, distance and which assigned buffs each member has. The party matching, resurrection and recruit options are on the same page.

## Accepting resurrection

Tick **Accept resurrection from party members** on the **Party** page. When you are dead and a party member casts Rebirth on you, the bot answers Yes, whether or not hunting is running. Offers from players outside your party, and mutation offers, are left to you. The switch is off by default and saved per character.

If hunting was running when the character died, it resumes after a resurrection you accepted, whatever **On death** is set to: at the hunting spot it simply starts, up to 600 m away it walks back first, and anywhere else it stays stopped and tells you to use **Return & hunt**. The memory lasts 15 minutes; a revive you or the bot does yourselves resumes nothing. While this switch is on and an online party member is in view, a bot set to revive (or the town cycle's revive) waits up to 20 seconds instead of 5 before reviving itself, and never revives while a resurrection offer is open.

## Automatic reconnect

This is always on; there is no switch. When the connection to the game is lost (a server restart, a network drop), the bot waits for the game's own retries, then asks the game to resume, and if that fails re-enters the world with the login the page already holds, exactly like pressing Enter at character select. It keeps trying every few seconds, then every 30 seconds, for up to 12 hours. It never types or stores your password: if the login itself is gone after a restart, the status line says so and the bot waits for you.

Once the character is back, hunting that was running resumes: at the hunting spot it simply starts again, a little way off it walks back first, and if the character is somewhere else (another region, or you were in a town trip) it stays stopped and tells you to use **Return & hunt**. A bot that was stopped is reconnected but not started, and a dead character is never started. Choosing logout, disconnect, exit or restart yourself, or logging in or entering a character by hand, cancels automatic reconnect.

## Returning after death

Leave **Revive in town and reverse to last scroll point** enabled under **Town → Go to town when…**. With the town cycle enabled, the bot revives, completes town services and reverses back to hunt. Hunting resumes within 30 metres of the last scroll point, or within your saved hunting area after death. Carry reverse scrolls.

Updates, suggestions and bug reports are on Discord (https://discord.gg/Y5H5ZyfQ7u); the **Discord** button at the top of the panel opens the invite. After an update, a window beside the panel shows the patch notes of every version since the one you used before; the bot keeps running while it is open. Click the version number at the top of the panel to read them again. When a newer version is out, the top of the panel names it and its headline ("Update 1.2.77 available: …") next to the **Update** button.

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

**Small monsters first** (always on): while fighting a stronger monster, the bot switches to a weaker one that is hitting you, kills it and goes back. It only counts monsters that hit you in the last few seconds within chase distance, only switches to a weaker class (normal, champion, elite, party, giant, titan, unique, weakest first), finishes a target that is below 25% HP, and never switches during a cast. The status line says "switched to … (hitting you); back to … after".

**Avoid other players' targets** (on by default) skips a monster another player has just hit. Hits by your party members, and by their pets, do not count, so the bot joins the monsters your party is fighting.

**Weapon imbue** is renewed as soon as it runs out, also in the middle of another skill's cast and before a normal attack. A skill takes the imbue when its cast ends, not when it starts, and the game accepts an imbue during a cast, so the skill being cast still gets it. An imbue's cooldown is as long as the imbue itself, so it cannot be renewed earlier; the 1.2.74 setting **Renew imbue when seconds left** was removed in 1.2.75 because of that.

When the pickup pet is ready but collects nothing, the status line says why, counted from the drops in view: for example "Drops in view: 4, ready to collect: 1. Not collected: 2: not wanted by your Loot settings (1 equipment, 1 other items); 1: too far from you (Pickup radius)." The part in brackets names the item kinds that are switched off, so you can see exactly what to switch on. The reasons are: type switched off or excluded or SoX only, too far from you, outside the hunting area, belongs to another player, too far from the pet, the pet is not ready, no room in the bag, and recently failed. **Finish current fight before character pickup** only affects a character collector; a pickup pet collects during fights whatever it is set to.

## Auto skill upgrades: which skills

**Upgrade my rotation and buff skills automatically** (Settings → Auto mastery and skills) raises the next level of skills you have **already learned** and that are in your attack rotations, buffs or weapon imbue on the Combat tab. A skill that is in none of those lists is never raised, and new skills are never learned. The status line under the switches names each skill it is not raising and why (not learned yet, already at its highest level, mastery or strength too low, prerequisite missing, not enough skill points). **Skills to upgrade** can be switched from the default (only those lists) to **All skills I have learned**: the skills you use are raised first, then every other skill line you already have, still only the next level of skills you already know. The order dropdown only matters when both the mastery and the skill switches are ticked.

## Waiting for a party resurrection

With **Accept resurrection from party members** on, the bot waits 20 seconds after dying before it revives itself whenever a living party member is in view (seen in the last 15 seconds counts), so the member has time to resurrect it. Without a helper in view it revives after 5 seconds. The Activity log says which when the character dies, and an open resurrection offer is always answered first.

## A character that cannot move

A character that should be walking (chasing, returning or picking up) but has not moved at all for 20 seconds, with nothing being damaged, is treated as stuck, for example inside a tree. The bot first steps back to the last position it was walking from, then walks to the nearest open ground (this needs the game's collision data). If both fail it stops hunting with an alert chime and a message, instead of standing there for minutes; it never uses a return scroll by itself. The Activity log and the bug report say whether the collision data thinks the character's tile is blocked. Switch it off or change the time under **Settings → Obstacles**.

## Why did it go to town?

Every town trip writes its reason to the **Activity** log, for example "Town trip started: potions running low", and the town status line repeats it during the trip. The Activity log is in the Wide window (press **Wide** in the title bar). The reasons are: character bag nearly full (always on), pickup pet nearly full, potions or ammunition low, weapon broken, gear worn down, no XP for a while, every set number of minutes, returning after a death, or started by you. The bug report includes the reason of the current or last trip.

## Picking up one item without its whole kind

On the **Items** page, **Pick always** takes one exact item whatever the Loot switches say, so you do not have to switch on potions, equipment and so on just to get one item. A rule is for that exact item: each size or degree is its own item. Tick **Only items on the ground now** to list just the drops in view and set the rule on exactly what is dropping. When something is skipped, the pickup status line shows the item numbers behind it (for example "12 potions #19 #20"); the Items table shows the same number when you point at an item.

## Who picks up what

In **Loot → Who picks up what**, every kind of drop (gold, potions, equipment, elixirs, lucky powders, magic stones, attribute stones, other alchemy items, other items) is set to **Leave on the ground**, **Pickup pet** or **Character**, so the pet and the character can work side by side. The pet collects during fights and fills its own bag; the character walks to the item and uses your bag, so give it only the kinds you want on you, for example potions or pills. **Default collector** decides for kinds you have not set yourself and for names under **Always include**. One pickup runs at a time; the pet's drops go first. **Finish the current fight before picking up** applies to the character only.

## Walking around obstacles

While chasing a mob the game walks the character straight at it, so a tree or wall in between stops it dead. Under **Settings → Obstacles** (on by default), when the character has stood still for 2.5 seconds without hurting its target and the game's collision data says the straight line is blocked, the bot walks the planned route around the obstacle until the straight line is clear, then the normal attack takes over. After three detours on one mob it drops that mob for a minute and picks another. It needs the collision data the game loads and works outdoors only; in a dungeon the existing no-damage timeout still applies.

## Anti-stuck

Under **Settings → Anti-stuck**, the bot watches for progress while hunting: a confirmed kill, XP, gold, a pickup, or damage to your target. If nothing happens for the set time (default 3 minutes), it recovers in steps: first it drops the current target, then it walks back to the saved hunting spot and resumes, and after the set number of failed recoveries (default 3) it stops hunting. Any confirmed gain clears the count. Resting, buffing, looting, shopping, town trips and manual control do not count as stuck.

## SoX alerts

When the bot confirms a pickup of Star, Moon or Sun equipment, it shows the item name and tier and plays a short chime. Turn it off with **Chime and notice when a SoX item is picked up** in **Loot**; **Test SoX chime** previews the sound. The count also appears under Session stats. It needs the item catalogue, which loads automatically when hunting starts, and it only announces bot pickups.

## Session stats

Open **Settings → Session stats** for hunting time, XP/hour, net gold, confirmed kills, deaths, potion use, pickups and SoX found. Totals pause when hunting stops and stay across toggles. **Reset session**, reloading or changing character clears them. Stats stay local to the page.

## Map

The **Map** page draws the game's minimap around you with your hunt radius (yellow circle) and chase distance (dashed ring), and shows you, monsters, party members (also ones out of sight, at the edge), other players, NPCs and pets. Click the map to mark a point and press **Make this the hunting spot** to hunt there; the point uses your current height, as the game's own map does. Drag to look around, use **+** and **−** or the mouse wheel to zoom, and **Follow me** to centre on yourself again. Hunt radius and chase distance can be changed under the map. Dungeons have no map yet.

## Wide window

Click **Wide** at the top of the panel for a wider window: a status strip with HP, MP and EXP bars and what the bot is doing, the pages as a list on the left, session numbers and supplies always on the right, and the activity log along the bottom. The pages hold the same settings as in the compact window, in two columns. **Compact** switches back; the compact window is the default. The choice is remembered, and screens narrower than 900 pixels always get the compact window.

## Minimised panel

The **×** at the top right of the panel minimises it to a small icon, so it stays out of the way while the bot keeps running. Its dot shows the state: green while hunting, yellow during a town trip, walk back, alchemy or reconnect, and red when stopped, dead or in error. Hover the icon for the current status, HP and MP. It glows when something needs you (a warning, a SoX pickup or a death) until you hover it or open the panel. Drag it anywhere; it keeps its spot and stays minimised after a reload. The panel itself also reopens where you last dragged it. Click it or press **F7** to bring the panel back.

## Controls

| Control | Action |
| --- | --- |
| **F8** | Start or stop the bot |
| **×** (top right) | Minimise the panel to a small icon; the bot keeps running |
| **F7** | Fold or unfold the panel; brings a minimised panel back |
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

## License

MIT, copyright nixxane. See [LICENSE](LICENSE). You may use, change and share it, including inside other projects, as long as the copyright notice stays.

## Obstacle pursuit and escape recovery

Version 1.2.101 checks blocked approaches before repeating attacks, keeps detour movement exclusive, and abandons unreachable enemies with bounded retries. Escape requires collision-checked destinations and fresh movement confirmation. Under Settings, optional recovery recall and detailed local diagnostics both default off. Recovery recall completes town services and stops in town instead of reversing into the trap. See [OBSTACLE-RECOVERY.md](OBSTACLE-RECOVERY.md) for behavior, limits and validation commands.

### 1.2.102 targeting correction

The 1.2.101 preflight was too aggressive on sloped terrain. Version 1.2.102 removes the horizontal planner's height cutoff and requires observed native approach failure before abandoning an initially unrouteable target. Missing coverage and exhausted searches keep normal targeting active; failure memory never excludes a different nearby monster.
