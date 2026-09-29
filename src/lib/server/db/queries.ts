import { eq, asc, sql, and, desc, gte, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import {
	players,
	games,
	gameParticipants,
	mvpRounds,
	mvpVotes,
	pushSubscriptions,
	appSettings,
	tournaments
} from './schema';
import { toGameInputs, type GameRow, type ParticipantRow } from './shape';
import { isValidAvatar, creatureFor } from '$lib/creatures';
import { resolveFlags, type FlagKey, type Flags } from '$lib/flags';
import type { Player, AdminPlayer, GameInput, Format, Side } from '$lib/types';

// The query-result HKT parameter must be `any` here: neon-http and pglite each
// supply a different concrete PgQueryResultHKT, and this type needs to accept both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<any, typeof schema>;

/** Resolve every feature flag from stored settings (applying registry defaults). */
export async function getFlags(db: DB): Promise<Flags> {
	const rows = await db.select().from(appSettings);
	return resolveFlags(rows.map((r) => ({ key: r.key, value: r.value })));
}

/** Turn a feature flag on or off (upsert, last write wins). */
export async function setFlag(db: DB, key: FlagKey, on: boolean): Promise<void> {
	const value = on ? 'true' : 'false';
	await db
		.insert(appSettings)
		.values({ key, value })
		.onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

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
	// Last line of defence: reject a non-allow-list avatar before it hits the DB,
	// regardless of which caller invoked this (the actions validate too).
	if (!isValidAvatar(avatar ?? null)) throw new Error('Invalid avatar');
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
	if (patch.avatar !== undefined) {
		const avatar = patch.avatar || null;
		// Last line of defence against a bad avatar reaching the DB (see addPlayer).
		if (!isValidAvatar(avatar)) throw new Error('Invalid avatar');
		set.avatar = avatar;
	}
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
	input: {
		playedAt: string;
		format: Format;
		winnerSide: Side;
		sideA: number[];
		sideB: number[];
		createdBy?: number | null;
		ranked?: boolean;
	}
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
			INSERT INTO games (played_at, format, winner_side, created_by, ranked)
			VALUES (${new Date(input.playedAt)}, ${input.format}, ${input.winnerSide}, ${input.createdBy ?? null}, ${input.ranked ?? true})
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

/** Deletes a one-off game. Tournament games are refused: removing one would
    break its schedule/bracket — they are managed on the tournament page. */
export async function deleteGame(db: DB, id: number): Promise<'ok' | 'tournament'> {
	const rows = await db.select({ t: games.tournamentId }).from(games).where(eq(games.id, id));
	if (rows[0]?.t != null) return 'tournament';
	await db.delete(games).where(and(eq(games.id, id), isNull(games.tournamentId)));
	return 'ok';
}

/** Games that feed the rating engine and stats: played (has a winner) and
    ranked. Scheduled tournament matches and casual/unranked games never reach
    computeRatings — a null winner would poison it. */
export async function getAllGames(db: DB): Promise<GameInput[]> {
	const gameRows = (await db
		.select({
			id: games.id,
			playedAt: games.playedAt,
			format: games.format,
			winnerSide: games.winnerSide
		})
		.from(games)
		.where(and(isNotNull(games.winnerSide), eq(games.ranked, true)))) as GameRow[];
	const participantRows = (await db
		.select({
			gameId: gameParticipants.gameId,
			playerId: gameParticipants.playerId,
			side: gameParticipants.side
		})
		.from(gameParticipants)) as ParticipantRow[];
	return toGameInputs(gameRows, participantRows);
}

export type HistoryGame = GameInput & {
	ranked: boolean;
	tournament: { id: number; name: string; round: number } | null;
};

/** Every played game, ranked or not, with its tournament (if any) — for game
    history lists. Scheduled (unplayed) tournament matches are excluded. */
export async function getGameHistory(db: DB): Promise<HistoryGame[]> {
	const rows = await db
		.select({
			id: games.id,
			playedAt: games.playedAt,
			format: games.format,
			winnerSide: games.winnerSide,
			ranked: games.ranked,
			round: games.round,
			tournamentId: tournaments.id,
			tournamentName: tournaments.name
		})
		.from(games)
		.leftJoin(tournaments, eq(tournaments.id, games.tournamentId))
		.where(isNotNull(games.winnerSide));
	const participantRows = (await db
		.select({
			gameId: gameParticipants.gameId,
			playerId: gameParticipants.playerId,
			side: gameParticipants.side
		})
		.from(gameParticipants)) as ParticipantRow[];
	const extra = new Map(rows.map((r) => [r.id, r]));
	return toGameInputs(rows as GameRow[], participantRows).map((g) => {
		const r = extra.get(g.id)!;
		return {
			...g,
			ranked: r.ranked,
			tournament:
				r.tournamentId != null
					? { id: r.tournamentId, name: r.tournamentName ?? '', round: r.round ?? 0 }
					: null
		};
	});
}

/** Admin-only audit metadata per game: when it was entered and by whom. Kept
    separate from GameInput (the pure engine shape) so rating/stats code stays
    free of admin concerns. `createdBy` is null for games logged before the
    column existed. */
export type GameMeta = { id: number; createdAt: string; createdBy: number | null };

export async function getGamesMeta(db: DB): Promise<GameMeta[]> {
	const rows = await db
		.select({ id: games.id, createdAt: games.createdAt, createdBy: games.createdBy })
		.from(games);
	return rows.map((r) => ({
		id: r.id,
		createdAt: r.createdAt.toISOString(),
		createdBy: r.createdBy
	}));
}

export type RoundWithVotes = {
	round: typeof mvpRounds.$inferSelect;
	participantIds: number[];
	votes: { voterId: number; nomineeId: number }[];
} | null;

export async function createMvpRound(
	db: DB,
	input: { gameId: number; deadline: string }
): Promise<void> {
	await db.insert(mvpRounds).values({ gameId: input.gameId, deadline: new Date(input.deadline) });
}

export async function getRoundWithVotes(db: DB, gameId: number): Promise<RoundWithVotes> {
	const rounds = await db.select().from(mvpRounds).where(eq(mvpRounds.gameId, gameId));
	if (rounds.length === 0) return null;
	const parts = await db
		.select({ playerId: gameParticipants.playerId })
		.from(gameParticipants)
		.where(eq(gameParticipants.gameId, gameId));
	const votes = await db
		.select({ voterId: mvpVotes.voterId, nomineeId: mvpVotes.nomineeId })
		.from(mvpVotes)
		.where(eq(mvpVotes.gameId, gameId));
	return { round: rounds[0], participantIds: parts.map((p) => p.playerId), votes };
}

/** Participants who can actually vote = those whose player row has an email
    (a login). */
export async function eligibleVoterIds(db: DB, gameId: number): Promise<number[]> {
	const rows = await db
		.select({ playerId: gameParticipants.playerId })
		.from(gameParticipants)
		.innerJoin(players, eq(players.id, gameParticipants.playerId))
		.where(and(eq(gameParticipants.gameId, gameId), isNotNull(players.email)));
	return rows.map((r) => r.playerId);
}

export async function castVote(
	db: DB,
	input: { gameId: number; voterId: number; nomineeId: number }
): Promise<'ok' | 'duplicate'> {
	const inserted = await db
		.insert(mvpVotes)
		.values(input)
		.onConflictDoNothing({ target: [mvpVotes.gameId, mvpVotes.voterId] })
		.returning({ id: mvpVotes.id });
	return inserted.length > 0 ? 'ok' : 'duplicate';
}

export async function closeRound(
	db: DB,
	gameId: number,
	status: 'decided' | 'void'
): Promise<void> {
	await db
		.update(mvpRounds)
		.set({ status, decidedAt: new Date() })
		.where(eq(mvpRounds.gameId, gameId));
}

export async function markRoundNotified(
	db: DB,
	gameId: number,
	which: 'open' | 'reminder' | 'result'
): Promise<void> {
	const col =
		which === 'open'
			? { openNotifiedAt: new Date() }
			: which === 'reminder'
				? { reminderNotifiedAt: new Date() }
				: { resultNotifiedAt: new Date() };
	await db.update(mvpRounds).set(col).where(eq(mvpRounds.gameId, gameId));
}

/** Atomically claims the right to send one notification kind for a round: the
    update only succeeds while the corresponding *_notified_at column is still
    null, so concurrent callers (a vote's recompute racing the cron tick) can't
    both win the claim and double-send a push. No `db.transaction()` needed —
    a single conditional UPDATE is enough, and neon-http has no transactions. */
export async function claimRoundNotification(
	db: DB,
	gameId: number,
	which: 'open' | 'reminder' | 'result'
): Promise<boolean> {
	const col =
		which === 'open'
			? mvpRounds.openNotifiedAt
			: which === 'reminder'
				? mvpRounds.reminderNotifiedAt
				: mvpRounds.resultNotifiedAt;
	const set =
		which === 'open'
			? { openNotifiedAt: new Date() }
			: which === 'reminder'
				? { reminderNotifiedAt: new Date() }
				: { resultNotifiedAt: new Date() };
	const rows = await db
		.update(mvpRounds)
		.set(set)
		.where(and(eq(mvpRounds.gameId, gameId), isNull(col)))
		.returning({ id: mvpRounds.id });
	return rows.length > 0;
}

type Member = { id: number; name: string; emoji: string };

// Internal shape keyed by playerId (matches the DB row), distinct from the
// public `Member` shape ({ id, name, emoji }) returned to callers below.
type GameMember = { playerId: number; side: Side; name: string; emoji: string };

async function membersByGame(db: DB, gameIds: number[]): Promise<Map<number, GameMember[]>> {
	if (gameIds.length === 0) return new Map();
	const rows = await db
		.select({
			gameId: gameParticipants.gameId,
			playerId: gameParticipants.playerId,
			side: gameParticipants.side,
			name: players.name,
			avatar: players.avatar
		})
		.from(gameParticipants)
		.innerJoin(players, eq(players.id, gameParticipants.playerId))
		.where(inArray(gameParticipants.gameId, gameIds));
	const map = new Map<number, GameMember[]>();
	for (const r of rows) {
		const list = map.get(r.gameId) ?? [];
		list.push({
			playerId: r.playerId,
			side: r.side,
			name: r.name,
			emoji: creatureFor(r.playerId, r.avatar)
		});
		map.set(r.gameId, list);
	}
	return map;
}

function winnersFromVotes(votes: { nomineeId: number }[]): { ids: number[]; top: number } {
	const tally = new Map<number, number>();
	for (const v of votes) tally.set(v.nomineeId, (tally.get(v.nomineeId) ?? 0) + 1);
	const top = Math.max(0, ...tally.values());
	const ids = [...tally.entries()].filter(([, c]) => c === top).map(([id]) => id);
	return { ids, top };
}

export type OpenRound = {
	gameId: number;
	format: Format;
	playedAt: string;
	deadline: string;
	side: Side;
	winnerSide: Side;
	us: Member[];
	them: Member[];
	/** Participant ids who have already cast a ballot in this round — drives the
	    live turnout ("X of Y voted") and the ✓ on each voter's chip. Never leaks
	    who they voted for. */
	voterIds: number[];
};

/** Voter ids per game, for the given games — the turnout behind an open round.
    Returns an empty map for an empty input rather than issuing a query. */
async function voterIdsByGame(db: DB, gameIds: number[]): Promise<Map<number, number[]>> {
	if (gameIds.length === 0) return new Map();
	const rows = await db
		.select({ gameId: mvpVotes.gameId, voterId: mvpVotes.voterId })
		.from(mvpVotes)
		.where(inArray(mvpVotes.gameId, gameIds));
	const map = new Map<number, number[]>();
	for (const r of rows) {
		const list = map.get(r.gameId) ?? [];
		list.push(r.voterId);
		map.set(r.gameId, list);
	}
	return map;
}

/** Rounds still open, for games this player took part in, where they have not
    voted yet — the set of ballots a player still needs to cast. */
export async function getOpenRoundsForPlayer(db: DB, playerId: number): Promise<OpenRound[]> {
	const rows = await db
		.select({
			gameId: mvpRounds.gameId,
			deadline: mvpRounds.deadline,
			format: games.format,
			playedAt: games.playedAt,
			side: gameParticipants.side,
			winnerSide: games.winnerSide
		})
		.from(mvpRounds)
		.innerJoin(games, eq(games.id, mvpRounds.gameId))
		.innerJoin(
			gameParticipants,
			and(eq(gameParticipants.gameId, mvpRounds.gameId), eq(gameParticipants.playerId, playerId))
		)
		.where(eq(mvpRounds.status, 'open'));
	if (rows.length === 0) return [];
	const voted = await db
		.select({ gameId: mvpVotes.gameId })
		.from(mvpVotes)
		.where(
			and(
				inArray(
					mvpVotes.gameId,
					rows.map((r) => r.gameId)
				),
				eq(mvpVotes.voterId, playerId)
			)
		);
	const votedSet = new Set(voted.map((v) => v.gameId));
	const pending = rows.filter((r) => !votedSet.has(r.gameId));
	const pendingIds = pending.map((r) => r.gameId);
	const [members, voters] = await Promise.all([
		membersByGame(db, pendingIds),
		voterIdsByGame(db, pendingIds)
	]);
	return pending.map((r) => {
		const all = members.get(r.gameId) ?? [];
		return {
			gameId: r.gameId,
			format: r.format,
			// MVP rounds exist only for played games, so winner/playedAt are set.
			playedAt: r.playedAt!.toISOString(),
			deadline: r.deadline.toISOString(),
			side: r.side,
			winnerSide: r.winnerSide!,
			us: all
				.filter((m) => m.side === r.side)
				.map((m) => ({ id: m.playerId, name: m.name, emoji: m.emoji })),
			them: all
				.filter((m) => m.side !== r.side)
				.map((m) => ({ id: m.playerId, name: m.name, emoji: m.emoji })),
			voterIds: voters.get(r.gameId) ?? []
		};
	});
}

export type MyOpenVote = {
	gameId: number;
	format: Format;
	playedAt: string;
	deadline: string;
	side: Side;
	winnerSide: Side;
	us: Member[];
	them: Member[];
	myVote: Member | null;
	/** Participant ids who have already voted in this round (includes the viewer).
	    Same turnout signal as OpenRound.voterIds. */
	voterIds: number[];
};

/** Open rounds the player is in AND has already voted on, with their own pick. */
export async function getMyOpenVotes(db: DB, playerId: number): Promise<MyOpenVote[]> {
	const rows = await db
		.select({
			gameId: mvpRounds.gameId,
			deadline: mvpRounds.deadline,
			format: games.format,
			playedAt: games.playedAt,
			side: gameParticipants.side,
			winnerSide: games.winnerSide,
			nomineeId: mvpVotes.nomineeId
		})
		.from(mvpRounds)
		.innerJoin(games, eq(games.id, mvpRounds.gameId))
		.innerJoin(
			gameParticipants,
			and(eq(gameParticipants.gameId, mvpRounds.gameId), eq(gameParticipants.playerId, playerId))
		)
		.innerJoin(mvpVotes, and(eq(mvpVotes.gameId, mvpRounds.gameId), eq(mvpVotes.voterId, playerId)))
		.where(eq(mvpRounds.status, 'open'));
	if (rows.length === 0) return [];
	const gameIds = rows.map((r) => r.gameId);
	const [members, voters] = await Promise.all([
		membersByGame(db, gameIds),
		voterIdsByGame(db, gameIds)
	]);
	return rows.map((r) => {
		const all = members.get(r.gameId) ?? [];
		const toMember = (m: GameMember): Member => ({ id: m.playerId, name: m.name, emoji: m.emoji });
		return {
			gameId: r.gameId,
			format: r.format,
			playedAt: r.playedAt!.toISOString(),
			deadline: r.deadline.toISOString(),
			side: r.side,
			winnerSide: r.winnerSide!,
			us: all.filter((m) => m.side === r.side).map(toMember),
			them: all.filter((m) => m.side !== r.side).map(toMember),
			myVote: all.map(toMember).find((m) => m.id === r.nomineeId) ?? null,
			voterIds: voters.get(r.gameId) ?? []
		};
	});
}

export type MvpResult = {
	gameId: number;
	format: Format;
	playedAt: string;
	status: 'decided' | 'void';
	winners: Member[];
	topVotes: number;
};

/** The most recently decided/void rounds, with winners recomputed from the
    stored votes (the source of truth) using the "nominees tied at max" rule. */
export async function getRecentResults(db: DB, limit: number): Promise<MvpResult[]> {
	const rounds = await db
		.select({
			gameId: mvpRounds.gameId,
			status: mvpRounds.status,
			format: games.format,
			playedAt: games.playedAt
		})
		.from(mvpRounds)
		.innerJoin(games, eq(games.id, mvpRounds.gameId))
		.where(inArray(mvpRounds.status, ['decided', 'void']))
		.orderBy(desc(mvpRounds.decidedAt))
		.limit(limit);
	if (rounds.length === 0) return [];
	const allVotes = await db
		.select({ gameId: mvpVotes.gameId, nomineeId: mvpVotes.nomineeId })
		.from(mvpVotes)
		.where(
			inArray(
				mvpVotes.gameId,
				rounds.map((r) => r.gameId)
			)
		);
	const members = await membersByGame(
		db,
		rounds.map((r) => r.gameId)
	);
	return rounds.map((r) => {
		const votes = allVotes.filter((v) => v.gameId === r.gameId);
		const { ids, top } = winnersFromVotes(votes);
		const mem = members.get(r.gameId) ?? [];
		return {
			gameId: r.gameId,
			format: r.format,
			playedAt: r.playedAt!.toISOString(),
			status: r.status as 'decided' | 'void',
			winners: mem
				.filter((m) => ids.includes(m.playerId))
				.map((m) => ({ id: m.playerId, name: m.name, emoji: m.emoji })),
			topVotes: top
		};
	});
}

/** MVP win counts across all decided rounds, keyed by playerId. Co-MVPs (a
    tie at the max vote count) each get credited a win. */
export async function getMvpCounts(db: DB, since?: string): Promise<Map<number, number>> {
	// All-time by default; pass `since` (ISO) to count only MVPs from games played
	// on/after that instant (the board's "this week" card uses this).
	const conds = [eq(mvpRounds.status, 'decided')];
	if (since) conds.push(gte(games.playedAt, new Date(since)));
	const decided = await db
		.select({ gameId: mvpRounds.gameId })
		.from(mvpRounds)
		.innerJoin(games, eq(games.id, mvpRounds.gameId))
		.where(and(...conds));
	const counts = new Map<number, number>();
	if (decided.length === 0) return counts;
	const votes = await db
		.select({ gameId: mvpVotes.gameId, nomineeId: mvpVotes.nomineeId })
		.from(mvpVotes)
		.where(
			inArray(
				mvpVotes.gameId,
				decided.map((d) => d.gameId)
			)
		);
	for (const d of decided) {
		const { ids } = winnersFromVotes(votes.filter((v) => v.gameId === d.gameId));
		for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return counts;
}

export async function savePushSubscription(
	db: DB,
	input: { playerId: number; endpoint: string; p256dh: string; auth: string }
): Promise<void> {
	await db
		.insert(pushSubscriptions)
		.values(input)
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { playerId: input.playerId, p256dh: input.p256dh, auth: input.auth }
		});
}

export async function deletePushSubscription(db: DB, endpoint: string): Promise<void> {
	await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function deletePushSubscriptionForPlayer(
	db: DB,
	endpoint: string,
	playerId: number
): Promise<void> {
	await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.playerId, playerId)));
}

export async function getSubscriptionsForPlayers(
	db: DB,
	ids: number[]
): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
	if (ids.length === 0) return [];
	return db
		.select({
			endpoint: pushSubscriptions.endpoint,
			p256dh: pushSubscriptions.p256dh,
			auth: pushSubscriptions.auth
		})
		.from(pushSubscriptions)
		.where(inArray(pushSubscriptions.playerId, ids));
}
