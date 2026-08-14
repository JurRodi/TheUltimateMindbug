import { eq, asc, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { players, games, gameParticipants } from './schema';
import { toGameInputs, type GameRow, type ParticipantRow } from './shape';
import type { Player, AdminPlayer, GameInput, Format, Side } from '$lib/types';

// The query-result HKT parameter must be `any` here: neon-http and pglite each
// supply a different concrete PgQueryResultHKT, and this type needs to accept both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = PgDatabase<any, typeof schema>;

function toPlayer(row: typeof players.$inferSelect): Player {
	return {
		id: row.id,
		name: row.name,
		avatar: row.avatar,
		isActive: row.isActive,
		createdAt: row.createdAt.toISOString()
	};
}

export async function getPlayers(db: DB): Promise<Player[]> {
	const rows = await db.select().from(players).orderBy(asc(players.name));
	return rows.map(toPlayer);
}

export async function getPlayer(db: DB, id: number): Promise<Player | null> {
	const rows = await db.select().from(players).where(eq(players.id, id));
	return rows[0] ? toPlayer(rows[0]) : null;
}

function toAdminPlayer(row: typeof players.$inferSelect): AdminPlayer {
	return { ...toPlayer(row), email: row.email, isAdmin: row.isAdmin };
}

export async function addPlayer(
	db: DB,
	name: string,
	avatar?: string | null,
	email?: string | null
): Promise<AdminPlayer> {
	const rows = await db
		.insert(players)
		.values({ name, avatar: avatar ?? null, email: email ? email.trim().toLowerCase() : null })
		.returning();
	return toAdminPlayer(rows[0]);
}

export async function setPlayerActive(db: DB, id: number, isActive: boolean): Promise<void> {
	await db.update(players).set({ isActive }).where(eq(players.id, id));
}

export async function getPlayersForAdmin(db: DB): Promise<AdminPlayer[]> {
	const rows = await db.select().from(players).orderBy(asc(players.name));
	return rows.map(toAdminPlayer);
}

export async function getPlayerByEmail(db: DB, email: string): Promise<AdminPlayer | null> {
	const norm = email.trim().toLowerCase();
	if (!norm) return null;
	const rows = await db
		.select()
		.from(players)
		.where(eq(sql`lower(${players.email})`, norm));
	return rows[0] ? toAdminPlayer(rows[0]) : null;
}

/** Self-service profile edit: a signed-in player changing their own name and/or
    avatar. Name is trimmed; a blank avatar clears it back to the deterministic
    fallback (stored as null). The unique `name` constraint surfaces as a thrown
    error the caller turns into a "name taken" message. */
export async function updatePlayerProfile(
	db: DB,
	id: number,
	patch: { name?: string; avatar?: string | null }
): Promise<void> {
	const set: Partial<typeof players.$inferInsert> = {};
	if (patch.name !== undefined) set.name = patch.name.trim();
	if (patch.avatar !== undefined) set.avatar = patch.avatar || null;
	if (Object.keys(set).length) await db.update(players).set(set).where(eq(players.id, id));
}

export async function updatePlayerAuth(
	db: DB,
	id: number,
	patch: { email?: string | null; isAdmin?: boolean }
): Promise<void> {
	const set: Partial<typeof players.$inferInsert> = {};
	if (patch.email !== undefined) set.email = patch.email ? patch.email.trim().toLowerCase() : null;
	if (patch.isAdmin !== undefined) set.isAdmin = patch.isAdmin;
	if (Object.keys(set).length) await db.update(players).set(set).where(eq(players.id, id));
}

export async function insertGame(
	db: DB,
	input: { playedAt: string; format: Format; winnerSide: Side; sideA: number[]; sideB: number[] }
): Promise<number> {
	// A single atomic CTE rather than db.transaction(): the production driver
	// (drizzle-orm/neon-http) has NO interactive transaction support and throws
	// "No transactions support in neon-http driver" on .transaction(). One
	// statement is still atomic in Postgres, so the game and all its
	// participants insert together or not at all — a game row without
	// participants would poison the rating engine with NaN. This works
	// identically on the pglite test driver.
	const participants = [
		...input.sideA.map((id) => ({ id, side: 'A' as Side })),
		...input.sideB.map((id) => ({ id, side: 'B' as Side }))
	];
	const values = sql.join(
		participants.map((p) => sql`(${p.id}::int, ${p.side}::text)`),
		sql`, `
	);
	const res = await db.execute(sql`
		WITH new_game AS (
			INSERT INTO games (played_at, format, winner_side)
			VALUES (${new Date(input.playedAt)}, ${input.format}, ${input.winnerSide})
			RETURNING id
		), ins AS (
			INSERT INTO game_participants (game_id, player_id, side)
			SELECT new_game.id, v.player_id, v.side::side
			FROM new_game, (VALUES ${values}) AS v(player_id, side)
		)
		SELECT id FROM new_game
	`);

	// db.execute()'s return shape differs by driver: neon-http resolves to a
	// bare array of rows, pglite to a { rows: [...] } object. Handle both.
	const rows = (Array.isArray(res) ? res : res.rows) as Array<{ id: number }>;
	return Number(rows[0].id);
}

export async function deleteGame(db: DB, id: number): Promise<void> {
	await db.delete(games).where(eq(games.id, id));
}

export async function getAllGames(db: DB): Promise<GameInput[]> {
	const gameRows = (await db.select().from(games)) as GameRow[];
	const participantRows = (await db
		.select({
			gameId: gameParticipants.gameId,
			playerId: gameParticipants.playerId,
			side: gameParticipants.side
		})
		.from(gameParticipants)) as ParticipantRow[];
	return toGameInputs(gameRows, participantRows);
}
