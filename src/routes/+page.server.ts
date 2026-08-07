import { db } from '$lib/server/db';
import { getPlayers, getAllGames } from '$lib/server/db/queries';
import { computeRatings } from '$lib/rating/engine';
import { allPlayerStats } from '$lib/stats/aggregate';
import { teamStats } from '$lib/stats/teams';
import type { Track, DateRange } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	// Clamp query params to known values so a bad/stale URL never 500s the
	// home page — anything unrecognized falls back to the default.
	const viewParam = url.searchParams.get('view');
	const view: 'players' | 'teams' = viewParam === 'teams' ? 'teams' : 'players';
	const formatParam = url.searchParams.get('format');
	const format: Track = formatParam === '2v2' || formatParam === '3v3' ? formatParam : 'total';
	const rangeParam = url.searchParams.get('range');
	const range: DateRange = rangeParam === 'week' || rangeParam === 'month' ? rangeParam : 'all';
	const now = new Date();

	const [players, games] = await Promise.all([getPlayers(db), getAllGames(db)]);
	const nameById = new Map(players.map((p) => [p.id, p.name]));
	const avatarById = new Map(players.map((p) => [p.id, p.avatar]));

	// Player ranking. Note: allPlayerStats takes the Track string (`format`), NOT the TrackResult.
	const track = computeRatings(games)[format];
	const stats = allPlayerStats(
		games,
		players.map((p) => p.id),
		{ track: format, range, now }
	);
	const statById = new Map(stats.map((s) => [s.playerId, s]));
	const rows = players
		.filter((p) => p.isActive)
		.map((p) => {
			const s = statById.get(p.id)!;
			const rated = track.current[p.id] !== undefined;
			return {
				player: p,
				rating: Math.round(track.current[p.id] ?? 1000),
				rated,
				games: s.games,
				wins: s.wins,
				winRate: s.winRate,
				streak: s.streak
			};
		})
		.sort((a, b) => (a.rated === b.rated ? b.rating - a.rating : a.rated ? -1 : 1));

	// Team records (no Elo — ranked by record inside teamStats).
	const teams = teamStats(games, { track: format, range, now }).map((t) => ({
		...t,
		names: t.playerIds.map((id) => nameById.get(id) ?? `#${id}`),
		avatars: t.playerIds.map((id) => avatarById.get(id) ?? null)
	}));

	return { view, format, range, rows, teams };
};
