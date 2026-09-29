import { totalRounds } from './advance';
import type { TournamentData, TournamentGame } from './types';

export interface StandingRow {
	key: string;
	playerIds: number[];
	teamNo: number | null;
	position: number | null;
	played: number;
	wins: number;
	losses: number;
	points: number;
	winRate: number;
}

type Unit = { key: string; playerIds: number[]; teamNo: number | null };

/** Which side a unit played on in a game, if any. Teams are fixed, so the
    first member identifies the side; for rotating the unit is one player. */
function sideOf(unit: Unit, g: TournamentGame): 'A' | 'B' | null {
	const id = unit.playerIds[0];
	if (g.sideA.includes(id)) return 'A';
	if (g.sideB.includes(id)) return 'B';
	return null;
}

function units(data: TournamentData): Unit[] {
	if (data.tournament.style === 'rotating') {
		return data.roster.map((r) => ({
			key: String(r.playerId),
			playerIds: [r.playerId],
			teamNo: null
		}));
	}
	const byTeam = new Map<number, number[]>();
	for (const r of data.roster)
		byTeam.set(r.teamNo ?? 0, [...(byTeam.get(r.teamNo ?? 0) ?? []), r.playerId]);
	return [...byTeam.entries()]
		.sort(([a], [b]) => a - b)
		.map(([teamNo, ids]) => {
			const playerIds = [...ids].sort((a, b) => a - b);
			return { key: playerIds.join('-'), playerIds, teamNo };
		});
}

/** Wins by `u` in played games where it faced another member of `group`. */
function headToHead(u: Unit, group: Unit[], played: TournamentGame[]): number {
	let wins = 0;
	for (const g of played) {
		const side = sideOf(u, g);
		if (!side || g.winnerSide !== side) continue;
		if (group.some((o) => o !== u && sideOf(o, g) !== null && sideOf(o, g) !== side)) wins++;
	}
	return wins;
}

export function standings(data: TournamentData): StandingRow[] {
	const played = data.games.filter((g) => g.winnerSide !== null);
	const rows = units(data).map((u) => {
		let wins = 0;
		let losses = 0;
		for (const g of played) {
			const side = sideOf(u, g);
			if (!side) continue;
			if (g.winnerSide === side) wins++;
			else losses++;
		}
		const games = wins + losses;
		return {
			unit: u,
			played: games,
			wins,
			losses,
			points: wins,
			winRate: games ? wins / games : 0
		};
	});
	type Row = (typeof rows)[number];
	const toOut = (r: Row, position: number | null): StandingRow => ({
		key: r.unit.key,
		playerIds: r.unit.playerIds,
		teamNo: r.unit.teamNo,
		position,
		played: r.played,
		wins: r.wins,
		losses: r.losses,
		points: r.points,
		winRate: r.winRate
	});

	// finalRound comes from ALL games (the bracket), not only played ones.
	if (data.tournament.style === 'knockout')
		return knockoutStandings(rows, played, totalRounds(data.games), toOut);

	const primary = (a: Row, b: Row) =>
		data.tournament.style === 'rotating'
			? b.points - a.points || b.winRate - a.winRate
			: b.wins - a.wins;
	const sortedRows = [...rows].sort(primary);
	const out: StandingRow[] = [];
	for (let i = 0; i < sortedRows.length;) {
		let j = i;
		while (j < sortedRows.length && primary(sortedRows[i], sortedRows[j]) === 0) j++;
		const group = sortedRows.slice(i, j);
		const groupUnits = group.map((r) => r.unit);
		const h2h = new Map(group.map((r) => [r, headToHead(r.unit, groupUnits, played)]));
		group.sort((a, b) => h2h.get(b)! - h2h.get(a)!);
		group.forEach((r, k) => {
			const shared = k > 0 && h2h.get(group[k - 1]) === h2h.get(r);
			out.push(toOut(r, shared ? out[out.length - 1].position : i + k + 1));
		});
		i = j;
	}
	return out;
}

/** Champion 1st, final loser 2nd, losers of round r share 2^(R−r) + 1.
    Teams still alive have no position yet (listed first). */
function knockoutStandings<R extends { unit: Unit }>(
	rows: R[],
	played: TournamentGame[],
	finalRound: number,
	toOut: (r: R, position: number | null) => StandingRow
): StandingRow[] {
	const positioned = rows.map((r) => {
		let position: number | null = null;
		for (const g of played) {
			const side = sideOf(r.unit, g);
			if (!side) continue;
			if (g.winnerSide !== side) position = 2 ** (finalRound - g.round) + 1;
			else if (g.round === finalRound) position = 1;
		}
		return { r, position };
	});
	// Alive (null) first, then by position.
	return positioned
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
		.map(({ r, position }) => toOut(r, position));
}
