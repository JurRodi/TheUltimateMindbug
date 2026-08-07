import { eq, asc } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { players, games, gameParticipants } from './schema';
import { toGameInputs, type GameRow, type ParticipantRow } from './shape';
import type { Player, GameInput, Format, Side } from '$lib/types';

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

export async function addPlayer(db: DB, name: string, avatar?: string | null): Promise<Player> {
	const rows = await db
		.insert(players)
		.values({ name, avatar: avatar ?? null })
		.returning();
	return toPlayer(rows[0]);
}

export async function setPlayerActive(db: DB, id: number, isActive: boolean): Promise<void> {
	await db.update(players).set({ isActive }).where(eq(players.id, id));
}

export async function insertGame(
	db: DB,
	input: { playedAt: string; format: Format; winnerSide: Side; sideA: number[]; sideB: number[] }
): Promise<number> {
	return db.transaction(async (tx) => {
		const [game] = await tx
			.insert(games)
			.values({
				playedAt: new Date(input.playedAt),
				format: input.format,
				winnerSide: input.winnerSide
			})
			.returning({ id: games.id });

		const rows = [
			...input.sideA.map((playerId) => ({ gameId: game.id, playerId, side: 'A' as Side })),
			...input.sideB.map((playerId) => ({ gameId: game.id, playerId, side: 'B' as Side }))
		];
		await tx.insert(gameParticipants).values(rows);
		return game.id;
	});
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
