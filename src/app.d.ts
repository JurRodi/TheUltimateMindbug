import type { AuthContext } from '$lib/server/authz';
import type { Flags } from '$lib/flags';

declare global {
	namespace App {
		interface Locals {
			auth: AuthContext;
			flags: Flags;
		}
		// Data provided by the root layout load on every page, so it is typed on the
		// loosely-typed `page.data` used in shared components (e.g. Nav).
		interface PageData {
			isAdmin: boolean;
			flags: Flags;
			me: { id: number; name: string; avatar: string | null } | null;
		}
	}
}

export {};
