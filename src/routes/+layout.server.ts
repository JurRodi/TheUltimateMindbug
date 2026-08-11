import { isAdmin } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies }) => ({ isAdmin: isAdmin(cookies) });
