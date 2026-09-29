import { db } from '$lib/server/db';
import { getPlayers } from '$lib/server/db/queries';
import { getTournaments } from '$lib/server/db/tournaments';
import { progress, winners } from '$lib/tournament/summary';
import { creatureFor } from '$lib/creatures';
import type { PageServerLoad } from './$types';

const ORDER = { live: 0, finished: 1, abandoned: 2 } as const;

export const load: PageServerLoad = async ({ locals }) => {
	const [players, all] = await Promise.all([getPlayers(db), getTournaments(db)]);
	const byId = new Map(players.map((p) => [p.id, p]));
	const member = (id: number) => ({
		id,
		name: byId.get(id)?.name ?? `#${id}`,
		emoji: creatureFor(id, byId.get(id)?.avatar ?? null)
	});
	const tournaments = all
		.map((d) => ({
			id: d.tournament.id,
			name: d.tournament.name,
			style: d.tournament.style,
			format: d.tournament.format,
			ranked: d.tournament.ranked,
			status: d.tournament.status,
			createdAt: d.tournament.createdAt,
			playerCount: d.roster.length,
			rounds: Math.max(0, ...d.games.map((g) => g.round)),
			progress: progress(d),
			winners: winners(d).map((w) => ({ members: w.playerIds.map(member), points: w.points }))
		}))
		.sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.createdAt < b.createdAt ? 1 : -1));
	return { tournaments, canCreate: locals.auth.player !== null };
};
