import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getPlayers, addPlayer, setPlayerActive } from '$lib/server/db/queries';
import { isAdmin, requireAdmin } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	return { players: await getPlayers(db), canEdit: isAdmin(cookies) };
};

export const actions: Actions = {
	add: async ({ request, cookies }) => {
		requireAdmin(cookies);
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const avatar = String(form.get('avatar') ?? '').trim() || null;
		if (!name) return fail(400, { error: 'Name required' });
		try {
			await addPlayer(db, name, avatar);
		} catch {
			return fail(400, { error: 'That name already exists' });
		}
		return { ok: true };
	},
	toggle: async ({ request, cookies }) => {
		requireAdmin(cookies);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid player' });
		await setPlayerActive(db, id, form.get('active') === 'true');
		return { ok: true };
	}
};
