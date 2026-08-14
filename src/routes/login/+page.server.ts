import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.auth.player) {
		const requested = url.searchParams.get('redirectTo');
		const to =
			requested && requested.startsWith('/') && !/^\/[\\/]/.test(requested) ? requested : '/';
		throw redirect(303, to);
	}
	return {};
};
