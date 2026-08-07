import { fail, redirect } from '@sveltejs/kit';
import { verifyPassword, cookieValue, AUTH_COOKIE, authCookieOptions } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		if (!verifyPassword(password)) {
			return fail(400, { error: 'Wrong password' });
		}
		cookies.set(AUTH_COOKIE, cookieValue(), authCookieOptions());
		// Only allow same-origin local paths: a single leading slash and not
		// protocol-relative ("//host"). Anything else falls back to /log to
		// prevent an open redirect via ?redirectTo=.
		const requested = url.searchParams.get('redirectTo');
		const to =
			requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/log';
		throw redirect(303, to);
	}
};
