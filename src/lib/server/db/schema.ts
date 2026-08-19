import {
	pgTable,
	serial,
	text,
	boolean,
	timestamp,
	integer,
	pgEnum,
	unique
} from 'drizzle-orm/pg-core';

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

export const games = pgTable('games', {
	id: serial('id').primaryKey(),
	playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
	format: formatEnum('format').notNull(),
	winnerSide: sideEnum('winner_side').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

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

export * from './auth-schema';
