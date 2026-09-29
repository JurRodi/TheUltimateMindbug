import {
	pgTable,
	serial,
	text,
	boolean,
	timestamp,
	integer,
	pgEnum,
	unique,
	check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const formatEnum = pgEnum('format', ['1v1', '2v2', '3v3']);
export const sideEnum = pgEnum('side', ['A', 'B']);

export const players = pgTable('players', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique(),
	avatar: text('avatar'),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	email: text('email').unique(),
	isAdmin: boolean('is_admin').notNull().default(false)
});

export const tournamentStyleEnum = pgEnum('tournament_style', ['rotating', 'fixed', 'knockout']);
export const tournamentStatusEnum = pgEnum('tournament_status', ['live', 'finished', 'abandoned']);

export const tournaments = pgTable('tournaments', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	style: tournamentStyleEnum('style').notNull(),
	format: formatEnum('format').notNull(),
	ranked: boolean('ranked').notNull(),
	// Rotating only: number of rounds chosen at creation.
	rounds: integer('rounds'),
	// Matches played at once (multiple decks).
	tables: integer('tables').notNull().default(1),
	// Draw seed: the create-page preview and the server generate the same draw from it.
	seed: integer('seed').notNull(),
	status: tournamentStatusEnum('status').notNull().default('live'),
	createdBy: integer('created_by').references(() => players.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	finishedAt: timestamp('finished_at', { withTimezone: true })
});

export const games = pgTable(
	'games',
	{
		id: serial('id').primaryKey(),
		// Null only for a scheduled (unplayed) tournament match — see checks below.
		playedAt: timestamp('played_at', { withTimezone: true }),
		format: formatEnum('format').notNull(),
		winnerSide: sideEnum('winner_side'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		// Which player entered this game, for admin audit. Nullable: games logged
		// before this column existed stay null ("unknown"), and set-null on player
		// removal so a player can be deleted without orphaning game history.
		createdBy: integer('created_by').references(() => players.id, { onDelete: 'set null' }),
		// Unranked games are stored and shown but never move Elo or stats.
		ranked: boolean('ranked').notNull().default(true),
		tournamentId: integer('tournament_id').references(() => tournaments.id, {
			onDelete: 'cascade'
		}),
		// Tournament position: 1-based round; slot = table (rotating/fixed) or bracket position (knockout), 0-based.
		round: integer('round'),
		slot: integer('slot')
	},
	(t) => [
		// Raw column names: the checks live on this table, so no qualification needed.
		check(
			'games_unplayed_needs_tournament',
			sql`winner_side IS NOT NULL OR tournament_id IS NOT NULL`
		),
		check(
			'games_played_at_needs_tournament',
			sql`played_at IS NOT NULL OR tournament_id IS NOT NULL`
		),
		check('games_result_has_played_at', sql`(winner_side IS NULL) = (played_at IS NULL)`),
		check(
			'games_round_slot_need_tournament',
			sql`(round IS NULL AND slot IS NULL) OR tournament_id IS NOT NULL`
		),
		unique('games_tournament_round_slot').on(t.tournamentId, t.round, t.slot)
	]
);

export const gameParticipants = pgTable('game_participants', {
	id: serial('id').primaryKey(),
	gameId: integer('game_id')
		.notNull()
		.references(() => games.id, { onDelete: 'cascade' }),
	playerId: integer('player_id')
		.notNull()
		.references(() => players.id),
	side: sideEnum('side').notNull()
});

export const tournamentPlayers = pgTable(
	'tournament_players',
	{
		id: serial('id').primaryKey(),
		tournamentId: integer('tournament_id')
			.notNull()
			.references(() => tournaments.id, { onDelete: 'cascade' }),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id),
		// Fixed/knockout team number (1-based); null for rotating.
		teamNo: integer('team_no')
	},
	(t) => [unique('tournament_players_tournament_player').on(t.tournamentId, t.playerId)]
);

export const mvpStatusEnum = pgEnum('mvp_status', ['open', 'decided', 'void']);

export const mvpRounds = pgTable('mvp_rounds', {
	id: serial('id').primaryKey(),
	gameId: integer('game_id')
		.notNull()
		.unique()
		.references(() => games.id, { onDelete: 'cascade' }),
	deadline: timestamp('deadline', { withTimezone: true }).notNull(),
	status: mvpStatusEnum('status').notNull().default('open'),
	decidedAt: timestamp('decided_at', { withTimezone: true }),
	openNotifiedAt: timestamp('open_notified_at', { withTimezone: true }),
	reminderNotifiedAt: timestamp('reminder_notified_at', { withTimezone: true }),
	resultNotifiedAt: timestamp('result_notified_at', { withTimezone: true })
});

export const mvpVotes = pgTable(
	'mvp_votes',
	{
		id: serial('id').primaryKey(),
		gameId: integer('game_id')
			.notNull()
			.references(() => games.id, { onDelete: 'cascade' }),
		voterId: integer('voter_id')
			.notNull()
			.references(() => players.id),
		nomineeId: integer('nominee_id')
			.notNull()
			.references(() => players.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique('mvp_votes_game_voter').on(t.gameId, t.voterId)]
);

export const pushSubscriptions = pgTable('push_subscriptions', {
	id: serial('id').primaryKey(),
	playerId: integer('player_id')
		.notNull()
		.references(() => players.id, { onDelete: 'cascade' }),
	endpoint: text('endpoint').notNull().unique(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Simple key/value store for admin-toggled feature flags and other app-wide
// settings. An absent row means "unset" (flags treat that as off).
export const appSettings = pgTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export * from './auth-schema';
