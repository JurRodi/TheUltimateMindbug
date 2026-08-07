import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

function initDb(): Db {
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set');
	}
	return drizzle(neon(env.DATABASE_URL), { schema });
}

// Lazy proxy: importing this module must never construct the neon client or
// throw, because SvelteKit's build-time "analyse" step imports every
// +page.server.ts (to inspect its exported config) whether or not `load` is
// ever called. The real connection — and the DATABASE_URL guard — is created
// on first property access instead, so `npm run build` succeeds without a
// DATABASE_URL, while any actual query at request time still fails loudly if
// it's missing.
export const db = new Proxy({} as Db, {
	get(_target, prop, receiver) {
		_db ??= initDb();
		return Reflect.get(_db, prop, receiver);
	}
}) as Db;
