// Additive dev seed: gives some past games a DECIDED "Most Valuable Play" round
// with realistic votes, so the MVP stats (board chips, player/team detail, the
// /mvp leaderboard + results feed) have something to show. Run with:
//   pnpm db:seed:mvp
// Unlike `db:seed`, this does NOT drop anything — it only ADDS mvp_rounds +
// mvp_votes to 2v2/3v3 games that don't already have a round. It refuses to run
// against anything but a localhost Postgres.

import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('[seed-mvp] DATABASE_URL is not set. Add it to .env (see .env.example).');
	process.exit(1);
}
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
	console.error(`[seed-mvp] Refusing to touch a non-local database (host: ${host}).`);
	process.exit(1);
}

// Deterministic PRNG so re-running is stable.
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
const rand = mulberry32(20260818);

// Weighted pick of one id from `ids`, using the global `weight` map, so a few
// players win MVP far more often than others (a nice leaderboard spread).
function weightedPick(ids, weight, exclude = new Set()) {
	const pool = ids.filter((id) => !exclude.has(id));
	const total = pool.reduce((s, id) => s + (weight.get(id) ?? 1), 0);
	let r = rand() * total;
	for (const id of pool) {
		r -= weight.get(id) ?? 1;
		if (r <= 0) return id;
	}
	return pool[pool.length - 1];
}

const pool = new pg.Pool({ connectionString: url });

async function main() {
	console.log(`[seed-mvp] Local database at ${host}.`);

	const players = (await pool.query('SELECT id, name FROM players ORDER BY id')).rows;
	if (players.length === 0) {
		console.error('[seed-mvp] No players found. Run `pnpm db:seed` first.');
		process.exit(1);
	}
	// Descending weights by roster order → a clear MVP hierarchy.
	const weight = new Map(players.map((p, i) => [p.id, Math.max(1, players.length + 1 - i)]));
	const nameById = new Map(players.map((p) => [p.id, p.name]));

	// 2v2/3v3 games that don't already have a round, oldest first, with participants.
	const games = (
		await pool.query(`
			SELECT g.id, g.played_at, g.format,
			       array_agg(gp.player_id ORDER BY gp.player_id) AS participants
			FROM games g
			JOIN game_participants gp ON gp.game_id = g.id
			WHERE g.format IN ('2v2', '3v3')
			  AND NOT EXISTS (SELECT 1 FROM mvp_rounds r WHERE r.game_id = g.id)
			GROUP BY g.id
			ORDER BY g.played_at ASC
		`)
	).rows;

	// Decide every round-less game (any games you left open by logging them in the
	// app keep their open round — this only touches games with no round at all).
	const toDecide = games;
	if (toDecide.length === 0) {
		console.log('[seed-mvp] No eligible games to decide (all already have rounds). Nothing to do.');
		return;
	}

	const HOUR = 3600 * 1000;
	let decided = 0;
	let coMvp = 0;
	const counts = new Map();

	for (const g of toDecide) {
		const parts = g.participants;
		const playedAt = new Date(g.played_at);
		const deadline = new Date(playedAt.getTime() + 24 * HOUR);
		const decidedAt = new Date(playedAt.getTime() + Math.floor((2 + rand() * 6) * HOUR));

		// ~20% of rounds are co-MVP ties.
		const isCo = rand() < 0.2 && parts.length >= 4;

		let votes; // [{ voter, nominee }]
		if (isCo) {
			const w = weightedPick(parts, weight);
			const c = weightedPick(parts, weight, new Set([w]));
			const others = parts.filter((id) => id !== w && id !== c);
			votes = [
				{ voter: w, nominee: c },
				{ voter: c, nominee: w }
			];
			// Split the remaining voters evenly between the two (even count for 2v2/3v3).
			others.forEach((voter, i) => votes.push({ voter, nominee: i % 2 === 0 ? w : c }));
		} else {
			// Single clear MVP: the winner always ends strictly ahead. Every other
			// participant votes the winner, except at most one "scatter" vote to a
			// third player for variety — never enough to tie (winner keeps >= P-2).
			const w = weightedPick(parts, weight);
			const nonW = parts.filter((id) => id !== w);
			const pickFrom = (arr) => arr[Math.floor(rand() * arr.length)];
			votes = [{ voter: w, nominee: pickFrom(nonW) }]; // winner can't self-vote
			let scattered = false;
			for (const voter of nonW) {
				let nominee = w;
				if (!scattered && parts.length >= 4 && rand() < 0.35) {
					nominee = pickFrom(nonW.filter((id) => id !== voter));
					scattered = true;
				}
				votes.push({ voter, nominee });
			}
		}

		// Tally MVP wins from the actual votes (exactly as the app does), so the
		// printed leaderboard matches what /mvp will show — a scatter vote can
		// occasionally turn an intended single MVP into a tie, and this catches it.
		const tally = new Map();
		for (const v of votes) tally.set(v.nominee, (tally.get(v.nominee) ?? 0) + 1);
		const top = Math.max(...tally.values());
		const winners = [...tally.entries()].filter(([, c]) => c === top).map(([id]) => id);
		if (winners.length > 1) coMvp++;
		for (const id of winners) counts.set(id, (counts.get(id) ?? 0) + 1);

		const roundRes = await pool.query(
			`INSERT INTO mvp_rounds (game_id, deadline, status, decided_at, open_notified_at, result_notified_at)
			 VALUES ($1, $2, 'decided', $3, $4, $3) RETURNING id`,
			[g.id, deadline, decidedAt, playedAt]
		);
		if (!roundRes.rows[0]) continue;

		const values = votes.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
		const params = [g.id, ...votes.flatMap((v) => [v.voter, v.nominee])];
		await pool.query(
			`INSERT INTO mvp_votes (game_id, voter_id, nominee_id) VALUES ${values}`,
			params
		);
		decided++;
	}

	console.log(`[seed-mvp] Created ${decided} decided rounds (${coMvp} co-MVP ties).`);
	const board = [...counts.entries()]
		.map(([id, n]) => ({ name: nameById.get(id) ?? `#${id}`, mvps: n }))
		.sort((a, b) => b.mvps - a.mvps);
	console.log('[seed-mvp] MVP leaderboard:');
	for (const row of board)
		console.log(`           ${row.mvps.toString().padStart(2)}  ${row.name}`);
	console.log('[seed-mvp] Done.');
}

main()
	.catch((err) => {
		console.error('[seed-mvp] Failed:', err);
		process.exitCode = 1;
	})
	.finally(() => pool.end());
