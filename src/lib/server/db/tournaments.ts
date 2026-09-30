import { eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { games, gameParticipants, tournaments, tournamentPlayers } from './schema';
import type { DB } from './queries';
import { generateSchedule } from '$lib/tournament/schedule';
import { canChangeKnockoutResult, knockoutRoundsOf, nextSlot } from '$lib/tournament/advance';
import type {
	RosterEntry,
	TournamentData,
	TournamentGame,
	TournamentInfo,
	TournamentSetup
} from '$lib/tournament/types';
import type { Side } from '$lib/types';

// Every multi-row write below is ONE statement (data-modifying CTEs): the
// production neon-http driver has no transactions (see insertGame).

export type Actor = { playerId: number | null; isAdmin: boolean };
export type ActionResult = { ok: true } | { ok: false; error: string };

const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

export function canManage(t: TournamentInfo, actor: Actor): boolean {
	return actor.isAdmin || (actor.playerId !== null && actor.playerId === t.createdBy);
}

function rowsOf(res: unknown): Array<Record<string, unknown>> {
	// db.execute() shape differs by driver: neon-http → array, pglite/pg → { rows }.
	return (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<
		Record<string, unknown>
	>;
}

/** Inserts the tournament, roster, every scheduled game and all known
    participants in a single statement. The schedule is regenerated here from
    the seed — the client's preview is never trusted. `setup` must be validated. */
export async function createTournament(
	db: DB,
	input: { name: string; setup: TournamentSetup; ranked: boolean; seed: number; createdBy: number }
): Promise<number> {
	const { setup } = input;
	const schedule = generateSchedule(setup, input.seed);
	const roster = schedule.teams
		? schedule.teams.flatMap((team, i) => team.map((player_id) => ({ player_id, team_no: i + 1 })))
		: setup.playerIds.map((player_id) => ({ player_id, team_no: null }));
	const slots = schedule.games.map((g) => ({ round: g.round, slot: g.slot }));
	const parts = schedule.games.flatMap((g) => [
		...(g.sideA ?? []).map((player_id) => ({ round: g.round, slot: g.slot, player_id, side: 'A' })),
		...(g.sideB ?? []).map((player_id) => ({ round: g.round, slot: g.slot, player_id, side: 'B' }))
	]);
	const res = await db.execute(sql`
		WITH t AS (
			INSERT INTO tournaments (name, style, format, ranked, rounds, tables, seed, created_by)
			VALUES (${input.name}, ${setup.style}::tournament_style, ${setup.format}::format, ${input.ranked},
				${setup.rounds}, ${setup.tables}, ${input.seed}, ${input.createdBy})
			RETURNING id
		), r AS (
			INSERT INTO tournament_players (tournament_id, player_id, team_no)
			SELECT t.id, x.player_id, x.team_no
			FROM t, jsonb_to_recordset(${JSON.stringify(roster)}::jsonb) AS x(player_id int, team_no int)
		), g AS (
			INSERT INTO games (tournament_id, format, ranked, round, slot, created_by)
			SELECT t.id, ${setup.format}::format, ${input.ranked}, x.round, x.slot, ${input.createdBy}
			FROM t, jsonb_to_recordset(${JSON.stringify(slots)}::jsonb) AS x(round int, slot int)
			RETURNING id, round, slot
		), p AS (
			INSERT INTO game_participants (game_id, player_id, side)
			SELECT g.id, x.player_id, x.side::side
			FROM g JOIN jsonb_to_recordset(${JSON.stringify(parts)}::jsonb)
				AS x(round int, slot int, player_id int, side text)
				ON g.round = x.round AND g.slot = x.slot
		)
		SELECT id FROM t
	`);
	return Number(rowsOf(res)[0].id);
}

function toInfo(r: typeof tournaments.$inferSelect): TournamentInfo {
	return {
		id: r.id,
		name: r.name,
		style: r.style,
		format: r.format,
		ranked: r.ranked,
		rounds: r.rounds,
		tables: r.tables,
		seed: r.seed,
		status: r.status,
		createdBy: r.createdBy,
		createdAt: r.createdAt.toISOString(),
		finishedAt: r.finishedAt?.toISOString() ?? null
	};
}

async function load(db: DB, id?: number): Promise<TournamentData[]> {
	const tRows = await (id === undefined
		? db.select().from(tournaments)
		: db.select().from(tournaments).where(eq(tournaments.id, id)));
	if (tRows.length === 0) return [];
	const tIds = tRows.map((t) => t.id);
	const [roster, gRows] = await Promise.all([
		db.select().from(tournamentPlayers).where(inArray(tournamentPlayers.tournamentId, tIds)),
		db
			.select({
				id: games.id,
				tournamentId: games.tournamentId,
				round: games.round,
				slot: games.slot,
				winnerSide: games.winnerSide,
				playedAt: games.playedAt
			})
			.from(games)
			.where(id === undefined ? isNotNull(games.tournamentId) : eq(games.tournamentId, id))
	]);
	const gIds = gRows.map((g) => g.id);
	const parts = gIds.length
		? await db
				.select({
					gameId: gameParticipants.gameId,
					playerId: gameParticipants.playerId,
					side: gameParticipants.side
				})
				.from(gameParticipants)
				.where(inArray(gameParticipants.gameId, gIds))
		: [];
	const sides = new Map<number, { A: number[]; B: number[] }>();
	for (const p of parts) {
		const e = sides.get(p.gameId) ?? { A: [], B: [] };
		e[p.side].push(p.playerId);
		sides.set(p.gameId, e);
	}
	return tRows.map((t) => ({
		tournament: toInfo(t),
		roster: roster
			.filter((r) => r.tournamentId === t.id)
			.map((r): RosterEntry => ({ playerId: r.playerId, teamNo: r.teamNo })),
		games: gRows
			.filter((g) => g.tournamentId === t.id)
			.map((g): TournamentGame => {
				const s = sides.get(g.id) ?? { A: [], B: [] };
				return {
					id: g.id,
					round: g.round!,
					slot: g.slot!,
					winnerSide: g.winnerSide,
					playedAt: g.playedAt?.toISOString() ?? null,
					sideA: [...s.A].sort((a, b) => a - b),
					sideB: [...s.B].sort((a, b) => a - b)
				};
			})
			.sort((a, b) => a.round - b.round || a.slot - b.slot)
	}));
}

export const getTournaments = (db: DB) => load(db);

export async function getTournament(db: DB, id: number): Promise<TournamentData | null> {
	return (await load(db, id))[0] ?? null;
}

/** Shared guards for result actions. */
async function gameFor(
	db: DB,
	tournamentId: number,
	gameId: number
): Promise<{ error: string } | { error?: undefined; data: TournamentData; game: TournamentGame }> {
	const data = await getTournament(db, tournamentId);
	if (!data) return { error: 'Tournament not found' };
	if (data.tournament.status !== 'live') return { error: 'This tournament is closed' };
	const game = data.games.find((g) => g.id === gameId);
	if (!game) return { error: 'Match not found' };
	return { data, game };
}

/** WHERE fragments re-checked inside the write itself, so a stale read (the
    tournament closed, or the next knockout match got played meanwhile) makes
    the UPDATE match zero rows instead of corrupting the bracket. */
function writeGuards(tournamentId: number, next: { id: number } | null) {
	const live = sql`EXISTS (SELECT 1 FROM tournaments WHERE id = ${tournamentId} AND status = 'live')`;
	return next
		? sql`${live} AND NOT EXISTS (SELECT 1 FROM games WHERE id = ${next.id} AND winner_side IS NOT NULL)`
		: live;
}

/** The knockout match a result feeds into, if any. */
function feed(data: TournamentData, game: TournamentGame) {
	if (data.tournament.style !== 'knockout') return null;
	const next = nextSlot(game.round, game.slot, knockoutRoundsOf(data.roster));
	if (!next) return null;
	const target = data.games.find((g) => g.round === next.round && g.slot === next.slot);
	return target ? { id: target.id, side: next.side } : null;
}

/** Enter (unplayed: anyone signed in) or change (played: creator/admin) a result. */
export async function recordResult(
	db: DB,
	actor: Actor,
	tournamentId: number,
	gameId: number,
	winner: Side
): Promise<ActionResult> {
	const found = await gameFor(db, tournamentId, gameId);
	if (found.error !== undefined) return fail(found.error);
	const { data, game } = found;
	if (game.sideA.length === 0 || game.sideB.length === 0)
		return fail('The teams for this match are not known yet');
	const isChange = game.winnerSide !== null;
	if (isChange && !canManage(data.tournament, actor))
		return fail('Only the creator or an admin can change a result');
	if (isChange && game.winnerSide === winner) return OK;
	if (
		isChange &&
		data.tournament.style === 'knockout' &&
		!canChangeKnockoutResult(data.games, game)
	)
		return fail('Clear the next-round match first');

	const winners = winner === 'A' ? game.sideA : game.sideB;
	const next = feed(data, game);
	// Compare-and-swap on the result we read: if two people submit at once, only
	// one UPDATE matches; the other gets zero rows. A first entry also records
	// who entered it (admins without a player keep the scheduling creator).
	const guard = isChange ? sql`winner_side = ${game.winnerSide}::side` : sql`winner_side IS NULL`;
	const enteredBy =
		!isChange && actor.playerId !== null ? sql`, created_by = ${actor.playerId}` : sql``;
	const advance = next
		? sql`, del AS (
				DELETE FROM game_participants
				WHERE game_id = ${next.id} AND side = ${next.side}::side AND EXISTS (SELECT 1 FROM upd)
			), ins AS (
				INSERT INTO game_participants (game_id, player_id, side)
				SELECT ${next.id}, v.player_id, ${next.side}::side
				FROM upd, (VALUES ${sql.join(
					winners.map((id) => sql`(${id}::int)`),
					sql`, `
				)}) AS v(player_id)
			)`
		: sql``;
	const res = await db.execute(sql`
		WITH upd AS (
			UPDATE games SET winner_side = ${winner}::side, played_at = COALESCE(played_at, now())${enteredBy}
			WHERE id = ${gameId} AND tournament_id = ${tournamentId} AND ${guard}
				AND ${writeGuards(tournamentId, next)}
			RETURNING id
		)${advance}
		SELECT id FROM upd
	`);
	if (rowsOf(res).length === 0)
		return fail(
			isChange
				? 'This match changed — refresh the page'
				: 'Someone already entered this result — refresh the page'
		);
	return OK;
}

export async function clearResult(
	db: DB,
	actor: Actor,
	tournamentId: number,
	gameId: number
): Promise<ActionResult> {
	const found = await gameFor(db, tournamentId, gameId);
	if (found.error !== undefined) return fail(found.error);
	const { data, game } = found;
	if (!canManage(data.tournament, actor))
		return fail('Only the creator or an admin can clear a result');
	if (game.winnerSide === null) return OK;
	if (data.tournament.style === 'knockout' && !canChangeKnockoutResult(data.games, game))
		return fail('Clear the next-round match first');
	const next = feed(data, game);
	const unadvance = next
		? sql`, del AS (
				DELETE FROM game_participants
				WHERE game_id = ${next.id} AND side = ${next.side}::side AND EXISTS (SELECT 1 FROM upd)
			)`
		: sql``;
	const res = await db.execute(sql`
		WITH upd AS (
			UPDATE games SET winner_side = NULL, played_at = NULL
			WHERE id = ${gameId} AND tournament_id = ${tournamentId}
				AND ${writeGuards(tournamentId, next)}
			RETURNING id
		)${unadvance}
		SELECT id FROM upd
	`);
	if (rowsOf(res).length === 0) return fail('This match changed — refresh the page');
	return OK;
}

async function managed(
	db: DB,
	actor: Actor,
	id: number
): Promise<{ error: string } | { error?: undefined; data: TournamentData }> {
	const data = await getTournament(db, id);
	if (!data) return { error: 'Tournament not found' };
	if (!canManage(data.tournament, actor))
		return { error: 'Only the creator or an admin can do that' };
	if (data.tournament.status !== 'live') return { error: 'This tournament is closed' };
	return { data };
}

export async function finishTournament(db: DB, actor: Actor, id: number): Promise<ActionResult> {
	const found = await managed(db, actor, id);
	if (found.error !== undefined) return fail(found.error);
	if (found.data.games.length === 0 || found.data.games.some((g) => g.winnerSide === null))
		return fail('Not every match has a result yet');
	await db
		.update(tournaments)
		.set({ status: 'finished', finishedAt: new Date() })
		.where(sql`${tournaments.id} = ${id} AND ${tournaments.status} = 'live'`);
	return OK;
}

export async function abandonTournament(db: DB, actor: Actor, id: number): Promise<ActionResult> {
	const found = await managed(db, actor, id);
	if (found.error !== undefined) return fail(found.error);
	await db.execute(sql`
		WITH upd AS (
			UPDATE tournaments SET status = 'abandoned', finished_at = now()
			WHERE id = ${id} AND status = 'live'
			RETURNING id
		), del AS (
			DELETE FROM games
			WHERE tournament_id = ${id} AND winner_side IS NULL AND EXISTS (SELECT 1 FROM upd)
		)
		SELECT id FROM upd
	`);
	return OK;
}

/** Admin only (caller checks). Cascades to roster, games and participants. */
export async function deleteTournament(db: DB, id: number): Promise<void> {
	await db.delete(tournaments).where(eq(tournaments.id, id));
}
