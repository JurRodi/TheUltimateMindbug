import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	getPlayersForAdmin,
	addPlayer,
	setPlayerActive,
	updatePlayerAuth
} from '$lib/server/db/queries';
import { requireAdmin } from '$lib/server/authz';
import { isValidAvatar } from '$lib/creatures';
import { normalizeName, isValidEmail, MAX_NAME_LEN } from '$lib/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Admin-only management page (like /games). Public player detail lives at
	// /players/[id]; this list is for creating/editing players.
	requireAdmin(locals.auth);
	return { players: await getPlayersForAdmin(db) };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const name = normalizeName(String(form.get('name') ?? ''));
		const avatar = String(form.get('avatar') ?? '').trim() || null;
		const email =
			String(form.get('email') ?? '')
				.trim()
				.toLowerCase() || null;
		if (!name) return fail(400, { error: `Enter a name (max ${MAX_NAME_LEN} characters)` });
		if (!isValidAvatar(avatar)) return fail(400, { error: 'Invalid avatar' });
		if (email !== null && !isValidEmail(email)) return fail(400, { error: 'Invalid email' });
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
		if (email !== null && !isValidEmail(email)) return fail(400, { error: 'Invalid email' });
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
