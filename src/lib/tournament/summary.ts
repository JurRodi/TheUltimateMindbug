import { standings, type StandingRow } from './standings';
import type { TournamentData, TournamentInfo, TournamentStyle } from './types';

export function progress(data: TournamentData): {
	played: number;
	total: number;
	round: number | null;
} {
	const played = data.games.filter((g) => g.winnerSide !== null).length;
	const open = data.games.filter((g) => g.winnerSide === null).map((g) => g.round);
	return { played, total: data.games.length, round: open.length ? Math.min(...open) : null };
}

/** The champion(s) of a finished tournament (shared first place possible). */
export function winners(data: TournamentData): StandingRow[] {
	if (data.tournament.status !== 'finished') return [];
	return standings(data).filter((r) => r.position === 1);
}

export interface PlayerTournamentEntry {
	tournament: TournamentInfo;
	position: number | null;
	fieldSize: number;
	positionLabel: string;
	wins: number;
	losses: number;
	points: number;
	teammateIds: number[];
	gameIds: number[];
}

export interface PlayerTournamentTotals {
	titles: number;
	podiums: number;
	played: number;
	avgFinish: number | null;
	wins: number;
	losses: number;
	winRate: number;
	bestStyle: { style: TournamentStyle; titles: number } | null;
}

function label(style: TournamentStyle, position: number | null, fieldSize: number): string {
	if (position === null) return '—';
	if (style === 'knockout' && position > 2) return `${position}–${2 * (position - 1)}th`;
	return `${position} of ${fieldSize}`;
}

export function playerTournaments(
	all: TournamentData[],
	playerId: number
): PlayerTournamentEntry[] {
	return all
		.filter(
			(d) => d.tournament.status !== 'abandoned' && d.roster.some((r) => r.playerId === playerId)
		)
		.map((d) => {
			const rows = standings(d);
			const row = rows.find((r) => r.playerIds.includes(playerId))!;
			return {
				tournament: d.tournament,
				position: row.position,
				fieldSize: rows.length,
				positionLabel: label(d.tournament.style, row.position, rows.length),
				wins: row.wins,
				losses: row.losses,
				points: row.points,
				teammateIds: row.playerIds.filter((id) => id !== playerId),
				gameIds: d.games
					.filter(
						(g) =>
							g.winnerSide !== null && (g.sideA.includes(playerId) || g.sideB.includes(playerId))
					)
					.map((g) => g.id)
			};
		})
		.sort((a, b) => (a.tournament.createdAt < b.tournament.createdAt ? 1 : -1));
}

const STYLE_ORDER: TournamentStyle[] = ['rotating', 'fixed', 'knockout'];

export function playerTournamentTotals(entries: PlayerTournamentEntry[]): PlayerTournamentTotals {
	const done = entries.filter((e) => e.tournament.status === 'finished');
	const placed = done.filter((e) => e.position !== null);
	const wins = done.reduce((s, e) => s + e.wins, 0);
	const losses = done.reduce((s, e) => s + e.losses, 0);
	const titlesBy = new Map<TournamentStyle, number>();
	for (const e of done)
		if (e.position === 1)
			titlesBy.set(e.tournament.style, (titlesBy.get(e.tournament.style) ?? 0) + 1);
	let bestStyle: PlayerTournamentTotals['bestStyle'] = null;
	for (const style of STYLE_ORDER) {
		const n = titlesBy.get(style) ?? 0;
		if (n > 0 && (!bestStyle || n > bestStyle.titles)) bestStyle = { style, titles: n };
	}
	return {
		titles: done.filter((e) => e.position === 1).length,
		podiums: done.filter((e) => e.position !== null && e.position <= 3).length,
		played: done.length,
		avgFinish: placed.length
			? Math.round((10 * placed.reduce((s, e) => s + e.position!, 0)) / placed.length) / 10
			: null,
		wins,
		losses,
		winRate: wins + losses ? wins / (wins + losses) : 0,
		bestStyle
	};
}

/** Titles per player across finished tournaments (every champion member counts). */
export function titleCounts(all: TournamentData[]): Map<number, number> {
	const counts = new Map<number, number>();
	for (const d of all)
		for (const w of winners(d))
			for (const id of w.playerIds) counts.set(id, (counts.get(id) ?? 0) + 1);
	return counts;
}
