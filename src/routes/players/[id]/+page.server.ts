import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getPlayer, getAllGames } from '$lib/server/db/queries';
import { computeRatings } from '$lib/rating/engine';
import { playerStats } from '$lib/stats/aggregate';
import type { Track } from '$lib/types';
import type { PageServerLoad } from './$types';

const TRACKS: Track[] = ['total', '2v2', '3v3'];

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	const player = await getPlayer(db, id);
	if (!player) throw error(404, 'Player not found');

	const games = await getAllGames(db);
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

	return { player, series, stats };
};
