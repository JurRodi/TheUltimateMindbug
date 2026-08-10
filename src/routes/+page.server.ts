import { db } from '$lib/server/db';
import { getPlayers, getAllGames } from '$lib/server/db/queries';
import { computeRatings } from '$lib/rating/engine';
import { allPlayerStats } from '$lib/stats/aggregate';
import { teamStats } from '$lib/stats/teams';
import { weekSummary } from '$lib/stats/summary';
import type { Track, DateRange } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	// The board's view/format/range are sticky: the URL wins when present, else
	// we fall back to the last selection saved in a cookie, else the default.
	// This keeps the filter stateful when returning to the board from a detail
	// page (whose back-link points at a bare `/`) or the nav "Board" link.
	// Anything unrecognized clamps to the default so a bad/stale value never 500s.
	const [savedView, savedFormat, savedRange] = (cookies.get('mb_board') ?? '').split('|');
	const viewParam = url.searchParams.get('view') ?? savedView;
	const view: 'players' | 'teams' = viewParam === 'teams' ? 'teams' : 'players';
	const formatParam = url.searchParams.get('format') ?? savedFormat;
	const format: Track = formatParam === '2v2' || formatParam === '3v3' ? formatParam : 'total';
	const rangeParam = url.searchParams.get('range') ?? savedRange;
	const range: DateRange = rangeParam === 'week' || rangeParam === 'month' ? rangeParam : 'all';
	cookies.set('mb_board', `${view}|${format}|${range}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
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

	// "This week" summary card. Always the last 7 days (independent of the range
	// filter) for the currently selected format track.
	const summary = weekSummary(games, track.history, format, now);
	const weekly = {
		games: summary.gamesThisWeek,
		delta: summary.gamesDelta,
		climb: summary.biggestClimb
			? {
					name: nameById.get(summary.biggestClimb.playerId) ?? `#${summary.biggestClimb.playerId}`,
					gain: Math.round(summary.biggestClimb.gain)
				}
			: null
	};

	return { view, format, range, rows, teams, weekly };
};
