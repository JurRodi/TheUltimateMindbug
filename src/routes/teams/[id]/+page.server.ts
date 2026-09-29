import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getPlayers, getAllGames, getMvpCounts } from '$lib/server/db/queries';
import { teamStats, teamGameLog, teamNetSeries, teamStreak } from '$lib/stats/teams';
import { creatureFor } from '$lib/creatures';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const ids = params.id.split('-').map((s) => Number(s));
	if (ids.length < 2 || ids.some((n) => !Number.isInteger(n))) throw error(404, 'Team not found');
	const key = [...ids].sort((a, b) => a - b).join('-');

	// Only add the MVP count query to the batch when the feature is on; the
	// destructure default covers the disabled case (query absent from the batch).
	const mvpCalls = locals.flags.mvp ? [getMvpCounts(db)] : [];
	const [players, games, mvpCounts = new Map<number, number>()] = await Promise.all([
		getPlayers(db),
		getAllGames(db),
		...mvpCalls
	]);
	const now = new Date();
	const teams = teamStats(games, { track: 'total', range: 'all', now });
	const rankIndex = teams.findIndex((t) => t.playerIds.join('-') === key);
	if (rankIndex < 0) throw error(404, 'Team not found');
	const team = teams[rankIndex];

	const nameById = new Map(players.map((p) => [p.id, p.name]));
	const avatarById = new Map(players.map((p) => [p.id, p.avatar]));
	const resolve = (pid: number) => ({
		id: pid,
		name: nameById.get(pid) ?? `#${pid}`,
		emoji: creatureFor(pid, avatarById.get(pid))
	});

	const history = teamGameLog(games, team.playerIds).map((e) => ({
		gameId: e.gameId,
		playedAt: e.playedAt,
		format: e.format,
		won: e.won,
		netAfter: e.netAfter,
		opponents: e.opponentIds.map(resolve)
	}));

	const mvps = team.playerIds.reduce((sum, id) => sum + (mvpCounts.get(id) ?? 0), 0);

	return {
		key,
		members: team.playerIds.map(resolve),
		format: team.playerIds.length === 2 ? '2v2' : '3v3',
		rank: rankIndex + 1,
		rankTotal: teams.length,
		record: { wins: team.wins, losses: team.losses, games: team.games, winRate: team.winRate },
		netRecord: team.wins - team.losses,
		streak: teamStreak(games, team.playerIds),
		series: teamNetSeries(games, team.playerIds),
		history,
		mvps
	};
};
