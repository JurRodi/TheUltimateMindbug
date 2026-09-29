import { fail, redirect } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { getPlayers } from '$lib/server/db/queries';
import { createTournament } from '$lib/server/db/tournaments';
import { validateSetup } from '$lib/tournament/validate';
import type { TournamentSetup } from '$lib/tournament/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals.auth);
	const players = await getPlayers(db);
	return { players: players.filter((p) => p.isActive) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAuth(locals.auth);
		const createdBy = locals.auth.player?.id;
		if (createdBy == null) return fail(401, { error: 'Not signed in' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name || name.length > 60) return fail(400, { error: 'Name must be 1–60 characters' });
		const seed = Number(form.get('seed'));
		if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 31)
			return fail(400, { error: 'Invalid draw' });
		const playerIds = form.getAll('playerIds').map(Number).filter(Number.isInteger);
		const active = new Set((await getPlayers(db)).filter((p) => p.isActive).map((p) => p.id));
		if (!playerIds.every((id) => active.has(id)))
			return fail(400, { error: 'Unknown or inactive player' });
		const input: TournamentSetup = {
			style: String(form.get('style')) as TournamentSetup['style'],
			format: String(form.get('format')) as TournamentSetup['format'],
			playerIds,
			rounds: form.get('rounds') ? Number(form.get('rounds')) : null,
			tables: Number(form.get('tables')) || 1
		};
		const v = validateSetup(input);
		if (!v.ok) return fail(400, { error: v.error });
		const id = await createTournament(db, {
			name,
			setup: v.setup,
			ranked: form.get('ranked') !== 'false',
			seed,
			createdBy
		});
		throw redirect(303, `/tournaments/${id}`);
	}
};
