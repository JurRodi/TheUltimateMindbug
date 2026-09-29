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
	if (setup.style === 'rotating') return rotating(setup, rng);
	throw new Error(`Unsupported style: ${setup.style}`);
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
