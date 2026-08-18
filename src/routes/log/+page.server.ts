import { fail, redirect } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { getPlayers, insertGame } from '$lib/server/db/queries';
import { parseTimestamp } from '$lib/validation';
import type { Format, Side } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals.auth);
	const players = await getPlayers(db);
	return { players: players.filter((p) => p.isActive) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAuth(locals.auth);
		const form = await request.formData();
		const format = String(form.get('format')) as Format;
		const winnerSide = String(form.get('winnerSide')) as Side;
		const playedAt = parseTimestamp(String(form.get('playedAt') || new Date().toISOString()));
		const sideA = form.getAll('sideA').map(Number).filter(Boolean);
		const sideB = form.getAll('sideB').map(Number).filter(Boolean);

		const size = format === '1v1' ? 1 : format === '2v2' ? 2 : 3;
		if (format !== '1v1' && format !== '2v2' && format !== '3v3')
			return fail(400, { error: 'Pick a format' });
		if (winnerSide !== 'A' && winnerSide !== 'B')
			return fail(400, { error: 'Pick the winning side' });
		if (!playedAt) return fail(400, { error: 'Enter a valid date' });
		if (sideA.length !== size || sideB.length !== size)
			return fail(400, { error: `Each side needs exactly ${size} players` });
		const all = [...sideA, ...sideB];
		if (new Set(all).size !== all.length)
			return fail(400, { error: 'A player cannot be on both sides' });
		// Every submitted id must be an existing, active player. The client form
		// only offers active players, but a raw POST could send arbitrary or
		// inactive ids; the FK backstops nonexistent ones with a 500, so gate here.
		const activeIds = new Set((await getPlayers(db)).filter((p) => p.isActive).map((p) => p.id));
		if (!all.every((id) => activeIds.has(id)))
			return fail(400, { error: 'Unknown or inactive player' });

		await insertGame(db, {
			playedAt,
			format,
			winnerSide,
			sideA,
			sideB
		});
		throw redirect(303, '/?saved=game');
	}
};
