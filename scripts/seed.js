// Resets the LOCAL development database and fills it with dummy data so the
// app has something to show without touching production. Run with:
//   pnpm db:seed
// It refuses to run against anything but a localhost Postgres, and it drops
// and recreates the public schema — never point it at a real database.

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('[seed] DATABASE_URL is not set. Add it to .env (see .env.example).');
	process.exit(1);
}

const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
	console.error(
		`[seed] Refusing to seed a non-local database (host: ${host}).\n` +
			'        This script DROPS the schema — only run it against the local docker-compose db.'
	);
	process.exit(1);
}

// Deterministic PRNG so re-seeding produces the same board every time.
function mulberry32(seed) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = mulberry32(20260810);
const shuffled = (arr) => {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
};

const PLAYERS = [
	{ name: 'Alice', avatar: '🦊' },
	{ name: 'Bram', avatar: '🐙' },
	{ name: 'Chloé', avatar: '🦉' },
	{ name: 'Daan', avatar: '🐸' },
	{ name: 'Eva', avatar: '🦁' },
	{ name: 'Finn', avatar: '🦈' }
];

const pool = new pg.Pool({ connectionString: url });

async function main() {
	console.log(`[seed] Resetting local database at ${host}...`);
	await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
	await pool.query('CREATE SCHEMA public');

	console.log('[seed] Applying migrations...');
	const db = drizzle(pool);
	await migrate(db, { migrationsFolder: './drizzle' });

	console.log(`[seed] Inserting ${PLAYERS.length} players...`);
	const ids = [];
	for (const p of PLAYERS) {
		const res = await pool.query(
			'INSERT INTO players (name, avatar) VALUES ($1, $2) RETURNING id',
			[p.name, p.avatar]
		);
		ids.push(res.rows[0].id);
	}

	// Generate a spread of games over the last ~45 days, mixing formats.
	const GAMES = 28;
	const now = Date.now();
	const day = 24 * 60 * 60 * 1000;
	let inserted = 0;
	for (let g = 0; g < GAMES; g++) {
		const format = rand() < 0.55 ? '2v2' : '3v3';
		const perSide = format === '2v2' ? 2 : 3;
		const roster = shuffled(ids).slice(0, perSide * 2);
		const sideA = roster.slice(0, perSide);
		const sideB = roster.slice(perSide);
		const winnerSide = rand() < 0.5 ? 'A' : 'B';
		// Spread playedAt from ~45 days ago up to today, roughly in order.
		const playedAt = new Date(
			now - Math.floor((1 - g / GAMES) * 45 * day) - Math.floor(rand() * day)
		);

		const game = await pool.query(
			'INSERT INTO games (played_at, format, winner_side) VALUES ($1, $2, $3) RETURNING id',
			[playedAt, format, winnerSide]
		);
		const gameId = game.rows[0].id;
		const rows = [
			...sideA.map((id) => ({ id, side: 'A' })),
			...sideB.map((id) => ({ id, side: 'B' }))
		];
		const values = rows.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
		const params = [gameId, ...rows.flatMap((r) => [r.id, r.side])];
		await pool.query(
			`INSERT INTO game_participants (game_id, player_id, side) VALUES ${values}`,
			params
		);
		inserted++;
	}

	console.log(`[seed] Inserted ${inserted} games. Done.`);
}

main()
	.catch((err) => {
		console.error('[seed] Failed:', err);
		process.exitCode = 1;
	})
	.finally(() => pool.end());
