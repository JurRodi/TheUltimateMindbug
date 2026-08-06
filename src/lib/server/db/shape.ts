import type { GameInput, Side, Format } from '$lib/types';

export interface GameRow {
	id: number;
	playedAt: Date;
	format: Format;
	winnerSide: Side;
}

export interface ParticipantRow {
	gameId: number;
	playerId: number;
	side: Side;
}

export function toGameInputs(gameRows: GameRow[], participantRows: ParticipantRow[]): GameInput[] {
	const byGame = new Map<number, { A: number[]; B: number[] }>();
	for (const p of participantRows) {
		const entry = byGame.get(p.gameId) ?? { A: [], B: [] };
		entry[p.side].push(p.playerId);
		byGame.set(p.gameId, entry);
	}

	return gameRows
		.map((g) => {
			const sides = byGame.get(g.id) ?? { A: [], B: [] };
			return {
				id: g.id,
				playedAt: g.playedAt.toISOString(),
				format: g.format,
				winnerSide: g.winnerSide,
				sideA: [...sides.A].sort((a, b) => a - b),
				sideB: [...sides.B].sort((a, b) => a - b)
			};
		})
		.sort((a, b) => (a.playedAt === b.playedAt ? a.id - b.id : a.playedAt < b.playedAt ? -1 : 1));
}
