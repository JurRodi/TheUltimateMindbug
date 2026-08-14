import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	isAdmin: locals.auth.isAdmin,
	// Public-safe: id/name/avatar only — never the email.
	me: locals.auth.player
		? {
				id: locals.auth.player.id,
				name: locals.auth.player.name,
				avatar: locals.auth.player.avatar
			}
		: null
});
