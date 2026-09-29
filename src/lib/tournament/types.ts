import type { Format, Side } from '$lib/types';

export type TournamentStyle = 'rotating' | 'fixed' | 'knockout';
export type TournamentStatus = 'live' | 'finished' | 'abandoned';

export interface TournamentSetup {
	style: TournamentStyle;
	format: Format;
	playerIds: number[];
	/** Rotating only; null otherwise. */
	rounds: number | null;
	tables: number;
}

/** One match of a generated schedule. A null side = not known yet (knockout). */
export interface ScheduledGame {
	round: number;
	slot: number;
	sideA: number[] | null;
	sideB: number[] | null;
}

export interface Schedule {
	/** Fixed/knockout: teams in team_no order (index 0 = team 1). Null for rotating. */
	teams: number[][] | null;
	games: ScheduledGame[];
}

export interface TournamentInfo {
	id: number;
	name: string;
	style: TournamentStyle;
	format: Format;
	ranked: boolean;
	rounds: number | null;
	tables: number;
	seed: number;
	status: TournamentStatus;
	createdBy: number | null;
	createdAt: string;
	finishedAt: string | null;
}

export interface RosterEntry {
	playerId: number;
	teamNo: number | null;
}

/** A stored tournament game. Empty side arrays = not known yet. */
export interface TournamentGame {
	id: number;
	round: number;
	slot: number;
	winnerSide: Side | null;
	playedAt: string | null;
	sideA: number[];
	sideB: number[];
}

export interface TournamentData {
	tournament: TournamentInfo;
	roster: RosterEntry[];
	games: TournamentGame[];
}

export const teamSize = (format: Format): number =>
	format === '1v1' ? 1 : format === '2v2' ? 2 : 3;
