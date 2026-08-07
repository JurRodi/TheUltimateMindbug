import { fail, redirect } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { getPlayers, insertGame } from '$lib/server/db/queries';
import type { Format, Side } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	requireAuth(cookies);
	const players = await getPlayers(db);
	return { players: players.filter((p) => p.isActive) };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		requireAuth(cookies);
		const form = await request.formData();
		const format = String(form.get('format')) as Format;
		const winnerSide = String(form.get('winnerSide')) as Side;
		const playedAt = String(form.get('playedAt') || new Date().toISOString());
		const sideA = form.getAll('sideA').map(Number).filter(Boolean);
		const sideB = form.getAll('sideB').map(Number).filter(Boolean);

		const size = format === '2v2' ? 2 : 3;
		if (format !== '2v2' && format !== '3v3') return fail(400, { error: 'Pick a format' });
		if (winnerSide !== 'A' && winnerSide !== 'B')
			return fail(400, { error: 'Pick the winning side' });
		if (sideA.length !== size || sideB.length !== size)
			return fail(400, { error: `Each side needs exactly ${size} players` });
		const all = [...sideA, ...sideB];
		if (new Set(all).size !== all.length)
			return fail(400, { error: 'A player cannot be on both sides' });

		await insertGame(db, {
			playedAt: new Date(playedAt).toISOString(),
			format,
			winnerSide,
			sideA,
			sideB
		});
		throw redirect(303, '/');
	}
};
