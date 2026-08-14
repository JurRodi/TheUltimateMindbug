import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	getPlayers,
	getPlayersForAdmin,
	addPlayer,
	setPlayerActive,
	updatePlayerAuth
} from '$lib/server/db/queries';
import { requireAdmin } from '$lib/server/authz';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.auth.isAdmin) return { canEdit: true as const, players: await getPlayersForAdmin(db) };
	return { canEdit: false as const, players: await getPlayers(db) };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const avatar = String(form.get('avatar') ?? '').trim() || null;
		const email =
			String(form.get('email') ?? '')
				.trim()
				.toLowerCase() || null;
		if (!name) return fail(400, { error: 'Name required' });
		try {
			await addPlayer(db, name, avatar, email);
		} catch {
			return fail(400, { error: 'That name or email already exists' });
		}
		return { ok: true };
	},
	toggle: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid player' });
		await setPlayerActive(db, id, form.get('active') === 'true');
		return { ok: true };
	},
	setEmail: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const email =
			String(form.get('email') ?? '')
				.trim()
				.toLowerCase() || null;
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid player' });
		try {
			await updatePlayerAuth(db, id, { email });
		} catch {
			return fail(400, { error: 'That email is already assigned' });
		}
		return { ok: true };
	},
	setAdmin: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid player' });
		await updatePlayerAuth(db, id, { isAdmin: form.get('isAdmin') === 'true' });
		return { ok: true };
	}
};
