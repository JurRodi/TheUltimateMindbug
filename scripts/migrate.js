// Applies Drizzle migrations against DATABASE_URL, then exits.
// Used by the `vercel-build` script so production migrations run automatically
// on every deploy (idempotent — Drizzle tracks which migrations have run).
// If DATABASE_URL is not set (e.g. a local build or a misconfigured preview),
// it skips with a warning rather than failing the build.

if (!process.env.DATABASE_URL) {
	console.warn('[migrate] DATABASE_URL not set — skipping migrations.');
	process.exit(0);
}

const { neon } = await import('@neondatabase/serverless');
const { drizzle } = await import('drizzle-orm/neon-http');
const { migrate } = await import('drizzle-orm/neon-http/migrator');

const db = drizzle(neon(process.env.DATABASE_URL));
await migrate(db, { migrationsFolder: './drizzle' });
console.log('[migrate] migrations applied.');
