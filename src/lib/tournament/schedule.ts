import { mulberry32, shuffle, type Rng } from './rng';
import { teamSize, type Schedule, type ScheduledGame, type TournamentSetup } from './types';

const ATTEMPTS = 200;
const TEAMMATE_WEIGHT = 10;
const OPPONENT_WEIGHT = 1;

const byNum = (a: number, b: number) => a - b;
const sorted = (ids: number[]) => [...ids].sort(byNum);
const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/** Builds the full schedule for a validated setup. Same setup + seed → same draw. */
export function generateSchedule(setup: TournamentSetup, seed: number): Schedule {
	const rng = mulberry32(seed);
	switch (setup.style) {
		case 'rotating':
			return rotating(setup, rng);
		case 'fixed':
			return roundRobin(setup, rng);
		case 'knockout':
			return knockout(setup, rng);
	}
}

function rotating(setup: TournamentSetup, rng: Rng): Schedule {
	const size = teamSize(setup.format);
	const matches = Math.min(setup.tables, Math.floor(setup.playerIds.length / (2 * size)));
	const perRound = matches * 2 * size;
	const played = new Map(setup.playerIds.map((id) => [id, 0]));
	const mates = new Map<string, number>();
	const opps = new Map<string, number>();
	const count = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
	const bump = (m: Map<string, number>, k: string) => m.set(k, count(m, k) + 1);

	// Lower = fewer repeat teammates (heavy) and repeat opponents (light).
	const score = (teams: number[][]) => {
		let s = 0;
		for (const t of teams)
			for (let i = 0; i < t.length; i++)
				for (let j = i + 1; j < t.length; j++)
					s += TEAMMATE_WEIGHT * count(mates, pairKey(t[i], t[j]));
		for (let m = 0; m < teams.length; m += 2)
			for (const x of teams[m])
				for (const y of teams[m + 1]) s += OPPONENT_WEIGHT * count(opps, pairKey(x, y));
		return s;
	};

	const games: ScheduledGame[] = [];
	for (let round = 1; round <= (setup.rounds ?? 0); round++) {
		// Fewest games first. Shuffle before the (stable) sort = random tiebreak,
		// so sit-outs rotate fairly.
		const chosen = shuffle(setup.playerIds, rng)
			.sort((a, b) => played.get(a)! - played.get(b)!)
			.slice(0, perRound);
		let best: number[][] = [];
		let bestScore = Infinity;
		for (let i = 0; i < ATTEMPTS && bestScore > 0; i++) {
			const teams = chunk(shuffle(chosen, rng), size);
			const s = score(teams);
			if (s < bestScore) [best, bestScore] = [teams, s];
		}
		for (let m = 0; m < matches; m++) {
			const a = sorted(best[2 * m]);
			const b = sorted(best[2 * m + 1]);
			games.push({ round, slot: m, sideA: a, sideB: b });
			for (const t of [a, b]) {
				for (const id of t) played.set(id, played.get(id)! + 1);
				for (let i = 0; i < t.length; i++)
					for (let j = i + 1; j < t.length; j++) bump(mates, pairKey(t[i], t[j]));
			}
			for (const x of a) for (const y of b) bump(opps, pairKey(x, y));
		}
	}
	return { teams: null, games };
}

function drawTeams(setup: TournamentSetup, rng: Rng): number[][] {
	return chunk(shuffle(setup.playerIds, rng), teamSize(setup.format)).map(sorted);
}

/** Circle method: team 0 fixed, the rest rotate; every pair meets once. An odd
    team count adds a phantom (null) — its opponent rests that round. A circle
    round with more matches than `tables` becomes several numbered rounds. */
function roundRobin(setup: TournamentSetup, rng: Rng): Schedule {
	const teams = drawTeams(setup, rng);
	let ring: (number | null)[] = teams.map((_, i) => i);
	if (ring.length % 2) ring.push(null);
	const n = ring.length;
	const games: ScheduledGame[] = [];
	let round = 0;
	for (let r = 0; r < n - 1; r++) {
		const pairs: [number, number][] = [];
		for (let i = 0; i < n / 2; i++) {
			const a = ring[i];
			const b = ring[n - 1 - i];
			if (a !== null && b !== null) pairs.push([a, b]);
		}
		for (let c = 0; c < pairs.length; c += setup.tables) {
			round++;
			pairs
				.slice(c, c + setup.tables)
				.forEach(([a, b], slot) => games.push({ round, slot, sideA: teams[a], sideB: teams[b] }));
		}
		ring = [ring[0], ring[n - 1], ...ring.slice(1, n - 1)];
	}
	return { teams, games };
}

/** Single elimination. Bracket = next power of 2; byes go straight into their
    round-2 slot (no round-1 game). Byes fill even slots first so bye teams
    meet a round-1 winner rather than each other where possible. */
function knockout(setup: TournamentSetup, rng: Rng): Schedule {
	const teams = drawTeams(setup, rng);
	let bracket = 1;
	while (bracket < teams.length) bracket *= 2;
	const rounds = Math.log2(bracket);
	const firstSlots = bracket / 2;
	const slotOrder = [
		...Array.from({ length: firstSlots }, (_, i) => i).filter((i) => i % 2 === 0),
		...Array.from({ length: firstSlots }, (_, i) => i).filter((i) => i % 2 === 1)
	];
	const byeSlots = new Set(slotOrder.slice(0, bracket - teams.length));
	const games: ScheduledGame[] = [];
	const round2 = new Map<number, { sideA: number[] | null; sideB: number[] | null }>();
	let next = 0;
	for (let slot = 0; slot < firstSlots; slot++) {
		if (byeSlots.has(slot)) {
			const entry = round2.get(slot >> 1) ?? { sideA: null, sideB: null };
			if (slot % 2 === 0) entry.sideA = teams[next++];
			else entry.sideB = teams[next++];
			round2.set(slot >> 1, entry);
		} else {
			games.push({ round: 1, slot, sideA: teams[next++], sideB: teams[next++] });
		}
	}
	for (let r = 2; r <= rounds; r++) {
		for (let slot = 0; slot < bracket / 2 ** r; slot++) {
			const pre = r === 2 ? round2.get(slot) : undefined;
			games.push({ round: r, slot, sideA: pre?.sideA ?? null, sideB: pre?.sideB ?? null });
		}
	}
	return { teams, games };
}
