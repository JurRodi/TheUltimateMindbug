import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { createRequire } from 'node:module';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

/** True for a plain local Postgres (e.g. the docker-compose db in dev). */
function isLocalPostgres(url: string): boolean {
	try {
		const host = new URL(url).hostname;
		return host === 'localhost' || host === '127.0.0.1' || host === '::1';
	} catch {
		return false;
	}
}

function initDb(): Db {
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set');
	}
	if (isLocalPostgres(env.DATABASE_URL)) {
		// Local development against a standard Postgres. The Neon HTTP driver
		// only speaks to Neon endpoints, so use node-postgres here instead.
		// `pg` is a devDependency loaded via createRequire so it never enters
		// the production bundle — prod URLs are Neon and never reach this branch.
		const require = createRequire(import.meta.url);
		const { Pool } = require('pg');
		const { drizzle: drizzlePg } = require('drizzle-orm/node-postgres');
		return drizzlePg(new Pool({ connectionString: env.DATABASE_URL }), {
			schema
		}) as unknown as Db;
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
