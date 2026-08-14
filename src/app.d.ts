import type { AuthContext } from '$lib/server/authz';

declare global {
	namespace App {
		interface Locals {
			auth: AuthContext;
		}
	}
}

export {};
