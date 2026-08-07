import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getPlayers, addPlayer, setPlayerActive } from '$lib/server/db/queries';
import { isAuthed, requireAuth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	return { players: await getPlayers(db), canEdit: isAuthed(cookies) };
};

export const actions: Actions = {
	add: async ({ request, cookies }) => {
		requireAuth(cookies);
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
		requireAuth(cookies);
		const form = await request.formData();
		await setPlayerActive(db, Number(form.get('id')), form.get('active') === 'true');
		return { ok: true };
	}
};
