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
		const to = url.searchParams.get('redirectTo') ?? '/log';
		throw redirect(303, to);
	}
};
