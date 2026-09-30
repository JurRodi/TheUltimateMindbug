import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	getPlayer,
	getPlayers,
	getAllGames,
	getGameHistory,
	getMvpCounts
} from '$lib/server/db/queries';
import { computeRatings } from '$lib/rating/engine';
import { playerStats, playerGameLog } from '$lib/stats/aggregate';
import { creatureFor } from '$lib/creatures';
import { getTournaments } from '$lib/server/db/tournaments';
import { playerTournaments, playerTournamentTotals } from '$lib/tournament/summary';
import type { Track } from '$lib/types';
import type { PageServerLoad } from './$types';

const TRACKS: Track[] = ['total', '1v1', '2v2', '3v3'];

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) throw error(404, 'Player not found');

	// Only add the MVP count query to the batch when the feature is on; the
	// destructure default covers the disabled case (query absent from the batch).
	const mvpCalls = locals.flags.mvp ? [getMvpCounts(db)] : [];
	const [
		player,
		players,
		games,
		historyGames,
		allTournaments,
		mvpCounts = new Map<number, number>()
	] = await Promise.all([
		getPlayer(db, id),
		getPlayers(db),
		getAllGames(db),
		getGameHistory(db),
		getTournaments(db),
		...mvpCalls
	]);
	if (!player) throw error(404, 'Player not found');

	const ratings = computeRatings(games);
	const now = new Date();

	const series = Object.fromEntries(
		TRACKS.map((t) => [
			t,
			ratings[t].history
				.filter((h) => h.playerId === id)
				.map((h) => ({ playedAt: h.playedAt, rating: Math.round(h.ratingAfter) }))
		])
	) as Record<Track, { playedAt: string; rating: number }[]>;

	const stats = Object.fromEntries(
		TRACKS.map((t) => [t, playerStats(games, id, { track: t, range: 'all', now })])
	) as Record<Track, ReturnType<typeof playerStats>>;

	// Overall board position, among active players who have a total-track rating.
	const total = ratings.total.current;
	const ranked = players
		.filter((p) => p.isActive && total[p.id] !== undefined)
		.sort((a, b) => total[b.id] - total[a.id]);
	const rankIndex = ranked.findIndex((p) => p.id === id);
	const rank = rankIndex >= 0 ? rankIndex + 1 : null;
	const rankTotal = ranked.length;

	// Full game history for the "Recent games" list — deltas from the total track,
	// other players resolved to their name + avatar emoji.
	const nameById = new Map(players.map((p) => [p.id, p.name]));
	const avatarById = new Map(players.map((p) => [p.id, p.avatar]));
	const resolve = (pid: number) => ({
		id: pid,
		name: nameById.get(pid) ?? `#${pid}`,
		emoji: creatureFor(pid, avatarById.get(pid))
	});
	const deltaByGame = new Map(
		ratings.total.history.filter((h) => h.playerId === id).map((h) => [h.gameId, h.delta])
	);
	const historyById = new Map(historyGames.map((g) => [g.id, g]));
	const history = playerGameLog(historyGames, id, deltaByGame).map((e) => {
		const g = historyById.get(e.gameId)!;
		return {
			gameId: e.gameId,
			playedAt: e.playedAt,
			format: e.format,
			won: e.won,
			delta: e.delta,
			ranked: g.ranked,
			tournament: g.tournament,
			teammates: e.teammateIds.map(resolve),
			opponents: e.opponentIds.map(resolve)
		};
	});

	const entries = playerTournaments(allTournaments, id);
	const deltaOf = (gameIds: number[]) =>
		Math.round(gameIds.reduce((s, gid) => s + (deltaByGame.get(gid) ?? 0), 0));
	const tournaments = entries.map((e) => ({
		id: e.tournament.id,
		name: e.tournament.name,
		style: e.tournament.style,
		format: e.tournament.format,
		ranked: e.tournament.ranked,
		status: e.tournament.status,
		createdAt: e.tournament.createdAt,
		position: e.position,
		positionLabel: e.positionLabel,
		wins: e.wins,
		losses: e.losses,
		points: e.points,
		teammates: e.teammateIds.map(resolve),
		// Rotating shows points; team styles show net Elo (ranked only).
		elo: e.tournament.style !== 'rotating' && e.tournament.ranked ? deltaOf(e.gameIds) : null
	}));
	const tournamentTotals = playerTournamentTotals(entries);

	return {
		player,
		avatar: creatureFor(player.id, player.avatar),
		rank,
		rankTotal,
		series,
		stats,
		history,
		tournaments,
		tournamentTotals,
		mvps: mvpCounts.get(id) ?? 0
	};
};
