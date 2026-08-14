import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getPlayers, getAllGames, updatePlayerProfile } from '$lib/server/db/queries';
import { computeRatings } from '$lib/rating/engine';
import { playerStats } from '$lib/stats/aggregate';
import { creatureFor } from '$lib/creatures';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The account page shows the *own* player's profile, so we need the player
	// object itself (not just the isAdmin flag) — inline the requireAuth gate so
	// TypeScript narrows `me` to non-null for the rest of the load.
	const me = locals.auth.player;
	if (!me) throw redirect(303, '/login');

	const [players, games] = await Promise.all([getPlayers(db), getAllGames(db)]);
	const ratings = computeRatings(games);
	const stats = playerStats(games, me.id, { track: 'total', range: 'all', now: new Date() });

	// Overall board position, among active players who have a total-track rating.
	const total = ratings.total.current;
	const rating = total[me.id] !== undefined ? Math.round(total[me.id]) : null;
	const ranked = players
		.filter((p) => p.isActive && total[p.id] !== undefined)
		.sort((a, b) => total[b.id] - total[a.id]);
	const rankIndex = ranked.findIndex((p) => p.id === me.id);

	return {
		// id/name/avatar mirror the public player page; email is the one private
		// field — safe here because this is the player's own page.
		player: { id: me.id, name: me.name, avatar: me.avatar },
		email: me.email,
		avatar: creatureFor(me.id, me.avatar),
		rating,
		rank: rankIndex >= 0 ? rankIndex + 1 : null,
		rankTotal: ranked.length,
		stats
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		// Always edit the *session's own* player id — never a form-supplied id —
		// so a player can only ever change their own name/avatar.
		const me = locals.auth.player;
		if (!me) throw redirect(303, '/login');

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const avatar = String(form.get('avatar') ?? '').trim() || null;
		if (!name) return fail(400, { error: 'Name required' });

		try {
			await updatePlayerProfile(db, me.id, { name, avatar });
		} catch {
			return fail(400, { error: 'That name is already taken' });
		}
		return { ok: true };
	}
};
