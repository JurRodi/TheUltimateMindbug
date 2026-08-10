import { pgTable, serial, text, boolean, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';

export const formatEnum = pgEnum('format', ['1v1', '2v2', '3v3']);
export const sideEnum = pgEnum('side', ['A', 'B']);

export const players = pgTable('players', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique(),
	avatar: text('avatar'),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
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
