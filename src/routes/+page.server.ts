import { db } from '$lib/server/db';
import { getPlayers, getAllGames, getMvpCounts } from '$lib/server/db/queries';
import { computeRatings } from '$lib/rating/engine';
import { allPlayerStats } from '$lib/stats/aggregate';
import { getTournaments } from '$lib/server/db/tournaments';
import { titleCounts } from '$lib/tournament/summary';
import { teamStats } from '$lib/stats/teams';
import { weekSummary } from '$lib/stats/summary';
import type { Track, DateRange } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies, locals }) => {
	// The board's view/format/range are sticky: the URL wins when present, else
	// we fall back to the last selection saved in a cookie, else the default.
	// This keeps the filter stateful when returning to the board from a detail
	// page (whose back-link points at a bare `/`) or the nav "Board" link.
	// Anything unrecognized clamps to the default so a bad/stale value never 500s.
	const [savedView, savedFormat, savedRange] = (cookies.get('mb_board') ?? '').split('|');
	const viewParam = url.searchParams.get('view') ?? savedView;
	const view: 'players' | 'teams' = viewParam === 'teams' ? 'teams' : 'players';
	const rawFormat = url.searchParams.get('format') ?? savedFormat;
	let format: Track =
		rawFormat === '1v1' || rawFormat === '2v2' || rawFormat === '3v3' ? rawFormat : 'total';
	// A 1v1 has no team; the Teams view falls back to Total.
	if (view === 'teams' && format === '1v1') format = 'total';
	const rangeParam = url.searchParams.get('range') ?? savedRange;
	const range: DateRange = rangeParam === 'week' || rangeParam === 'month' ? rangeParam : 'all';
	cookies.set('mb_board', `${view}|${format}|${range}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
	const now = new Date();
	const weekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

	// Only add the MVP count queries to the batch when the feature is on; the
	// destructure defaults cover the disabled case (queries absent from the batch).
	const empty = new Map<number, number>();
	const mvpCalls = locals.flags.mvp ? [getMvpCounts(db), getMvpCounts(db, weekAgoIso)] : [];
	const [players, games, allTournaments, mvpCounts = empty, weeklyMvpCounts = empty] =
		await Promise.all([getPlayers(db), getAllGames(db), getTournaments(db), ...mvpCalls]);
	const titles = titleCounts(allTournaments);
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
				streak: s.streak,
				mvps: mvpCounts.get(p.id) ?? 0,
				titles: titles.get(p.id) ?? 0
			};
		})
		.sort((a, b) => (a.rated === b.rated ? b.rating - a.rating : a.rated ? -1 : 1));

	// Team records (no Elo — ranked by record inside teamStats).
	const teams = teamStats(games, { track: format, range, now }).map((t) => ({
		...t,
		names: t.playerIds.map((id) => nameById.get(id) ?? `#${id}`),
		avatars: t.playerIds.map((id) => avatarById.get(id) ?? null),
		mvps: t.playerIds.reduce((sum, id) => sum + (mvpCounts.get(id) ?? 0), 0)
	}));

	// MVP of the week: the player with the most MVP wins from games played in the
	// last 7 days (null if none awarded this week). Ties resolve to the first max.
	let weeklyMvp: { name: string; count: number } | null = null;
	for (const [id, count] of weeklyMvpCounts) {
		if (!weeklyMvp || count > weeklyMvp.count) {
			weeklyMvp = { name: nameById.get(id) ?? `#${id}`, count };
		}
	}

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
			: null,
		mvp: weeklyMvp
	};

	return { view, format, range, rows, teams, weekly };
};
