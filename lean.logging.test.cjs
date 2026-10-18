/*
===========================================================================
lean.logging.test.cjs - retention, privacy and observation contracts

Tests activity independently of gameplay decisions using the bot fixture.
===========================================================================
*/
module.exports = function loggingTests( { test, fixture, townFixture } ) {
	const assert = require( "node:assert/strict" );
	test( "friendly target messages retain technical selection evidence for export", () => {
		const f = fixture();
		const target = { gid: 466785, name: "Mangyang", kind: "monster", regionId: 1, x: 130, y: 0, z: 100, attackFlags: 16, appearanceState: [0] };
		f.World.ents.set( target.gid, target );
		f.World.attackers.set( target.gid, f.World.simNow() );
		f.Hunt.chooseTarget();
		const entry = f.Log.lines.find( entry => entry.code === "target-selected" );
		assert.ok( entry );
		assert.equal( f.Activity.userMessage( entry ), "Targeting Mangyang — it’s attacking you." );
		assert.doesNotMatch( f.Activity.userMessage( entry ), /466785|priority|requested/ );
		f.World.ents.delete( target.gid );
		assert.match( f.Activity.userMessage( entry ), /Mangyang/ );
		const exported = JSON.parse( f.Activity.export() ).events.find( event => event.code === "target-selected" );
		assert.equal( exported.details.monsterId, 466785 );
		assert.equal( exported.details.selectionPolicy, "attackers" );
		assert.equal( exported.details.attackingPlayer, true );
		assert.doesNotMatch( f.Activity.export(), /Mangyang/ );
		assert.match( f.Activity.export( true ), /Mangyang/ );
	} );
	test( "friendly logs distinguish targeting from a confirmed hit and handle unnamed monsters", () => {
		const f = fixture();
		for ( const policy of [ "nearest", "lowhp", "attackers" ] ) {
			f.Activity.clear(); f.Activity.states.clear(); f.Settings.profile.hunt.priority = policy;
			f.World.ents.set( 77, { gid: 77, kind: "monster", regionId: 1, x: 110, z: 100, attackFlags: 16, appearanceState: [0] } );
			f.Hunt.chooseTarget();
			const entry = f.Log.lines.find( event => event.code === "target-selected" );
			assert.equal( f.Activity.userMessage( entry ), "Targeting a monster." );
			assert.equal( entry.outcome, "requested" );
		}
	} );
	test( "friendly town and loot wording does not remove technical export fields", () => {
		const f = fixture();
		const entry = f.Activity.emit( { code: "trip-phase", category: "town", text: "Town phase: walk-smith", outcome: "waiting" } );
		assert.equal( f.Activity.userMessage( entry ), "Walking to the repair merchant." );
		assert.match( f.Activity.export( true ), /Town phase: walk-smith/ );
		assert.equal( f.Activity.userMessage( { code: "pickup-confirmed" } ), "Picked up loot." );
	} );
	test( "command capture is opt-in and cannot evict normal warnings", () => {
		const f = fixture();
		f.Log.warn( "Important warning" );
		f.Log.cmd( "Move" );
		assert.equal( f.Activity.commands.length, 0 );
		f.Activity.capture( true );
		for ( let i = 0; i < 1200; i++ ) f.Log.command( { kind: "move" }, "Move " + i );
		assert.equal( f.Activity.commands.length, 1000 );
		assert.ok( f.Log.lines.some( entry => entry.text === "Important warning" ) );
		assert.ok( f.Activity.commands.every( entry => entry.outcome === "requested" ) );
		f.advance( 600001 ); f.Log.cmd( "Expired" );
		assert.equal( f.Activity.commands.at( -1 ).text, "Move 1199" );
	} );
	test( "duplicate grouping preserves operation and epoch boundaries", () => {
		const f = fixture();
		f.Log.warn( "Repeated" ); f.Log.warn( "Repeated" );
		assert.equal( f.Log.lines.length, 1 ); assert.equal( f.Log.lines[0].repeatCount, 2 );
		f.Activity.emit( { level: "warn", text: "Repeated", operationId: 1 } );
		f.Activity.emit( { level: "warn", text: "Repeated", operationId: 2 } );
		f.World.epoch++; f.Activity.emit( { level: "warn", text: "Repeated", operationId: 2 } );
		assert.equal( f.Log.lines.length, 4 );
	} );
	test( "standard export excludes free text and unapproved details", () => {
		const f = fixture();
		f.Activity.emit( { text: "SecretHero at 123,456 password private", code: "test-event", operationId: "SecretHero",
			details: { hpPct: 35, password: "private", player: "SecretHero", x: 123, delayMs: Infinity } } );
		const text = f.Activity.export();
		assert.doesNotMatch( text, /SecretHero|password|private|123|456/ );
		assert.equal( JSON.parse( text ).events[0].details.hpPct, 35 );
		assert.match( f.Activity.export( true ), /SecretHero/ );
		assert.doesNotMatch( f.Activity.export( false, "text" ), /SecretHero/ );
	} );
	test( "alchemy outcomes and game refusals enter shared activity once", () => {
		const f = fixture();
		f.Alchemy.note( "Success: +1 → +2" );
		f.bus.emit( "game-error", "Inventory rejected: 134" );
		assert.equal( f.Log.lines.filter( entry => entry.category === "alchemy" ).length, 1 );
		assert.equal( f.Log.lines.find( entry => entry.code === "alchemy-result" ).outcome, "confirmed" );
		assert.equal( f.Log.lines.find( entry => entry.code === "game-refusal" ).details.errorCode, 134 );
	} );
	test( "filters change views without deleting retained events", () => {
		const f = fixture();
		f.Activity.emit( { category: "town", level: "warn", text: "Town waiting" } );
		f.Activity.emit( { category: "combat", text: "Attack waiting" } );
		f.Activity.filters.category = "town";
		assert.equal( f.Activity.visible().length, 1 );
		f.Activity.filters.search = "absent";
		assert.equal( f.Activity.visible().length, 0 ); assert.equal( f.Log.lines.length, 2 );
		f.Activity.clear(); assert.equal( f.Log.lines.length, 0 );
		assert.equal( f.commands.length, 0 );
	} );
	test( "potion requests remain unconfirmed until inventory changes", () => {
		const f = fixture();
		const item = { slot: 13, refObjId: 8, typeFlags: 2284, quantity: 5 };
		f.World.gp.inventory = [ item ];
		f.Activity.capture( true ); f.Stats.potion( item ); f.Activity.observePotions();
		assert.equal( f.Activity.commands.filter( entry => entry.code === "potion-consumed" ).length, 0 );
		item.quantity = 4; f.Activity.observePotions();
		assert.equal( f.Activity.commands.filter( entry => entry.code === "potion-consumed" ).length, 1 );
		f.Activity.observePotions();
		assert.equal( f.Activity.commands.filter( entry => entry.code === "potion-consumed" ).length, 1 );
	} );
	test( "unconfirmed potion observations time out without claiming non-consumption", () => {
		const f = fixture(), item = { refObjId: 8, quantity: 5 };
		f.World.gp.inventory = [ item ]; f.Stats.potion( item );
		f.advance( 16000 ); f.Activity.observePotions();
		assert.equal( f.Log.lines.find( entry => entry.code === "potion-unconfirmed" ).outcome, "unconfirmed" );
		item.quantity--; f.Activity.observePotions();
		assert.equal( f.Activity.potionCount, 0 );
	} );
	test( "old potion observations cannot confirm across a world reset", () => {
		const f = fixture(), item = { refObjId: 8, quantity: 5 };
		f.World.gp.inventory = [ item ]; f.Stats.potion( item ); f.bus.emit( "reset" );
		item.quantity--; f.Activity.observePotions();
		assert.equal( f.Activity.potionCount, 0 );
	} );
	test( "same-character travel retains town correlation while character changes clear it", () => {
		const f = townFixture();
		f.bus.emit( "character", "One" ); f.Town.begin();
		const id = f.Activity.contexts.town.id;
		f.bus.emit( "character", "One" ); assert.equal( f.Activity.contexts.town.id, id );
		f.bus.emit( "character", "Two" ); assert.equal( f.Activity.contexts.town, undefined );
	} );
	test( "logging observation preserves owner return values and exceptions", () => {
		const f = fixture(), owner = { tick() { return 7; }, fail() { throw Error( "original failure" ); } };
		f.Activity.wrap( owner, "tick", () => { throw Error( "logging failure" ); } );
		f.Activity.wrap( owner, "fail", () => {} );
		assert.equal( owner.tick(), 7 ); assert.throws( () => owner.fail(), /original failure/ );
		assert.equal( f.commands.length, 0 );
	} );
};
