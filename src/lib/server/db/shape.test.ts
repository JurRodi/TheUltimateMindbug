import { describe, it, expect } from 'vitest';
import { toGameInputs } from './shape';

describe('toGameInputs', () => {
	it('joins participants into sideA/sideB and ISO playedAt', () => {
		const result = toGameInputs(
			[{ id: 1, playedAt: new Date('2026-01-01T10:00:00Z'), format: '2v2', winnerSide: 'A' }],
			[
				{ gameId: 1, playerId: 2, side: 'A' },
				{ gameId: 1, playerId: 1, side: 'A' },
				{ gameId: 1, playerId: 4, side: 'B' },
				{ gameId: 1, playerId: 3, side: 'B' }
			]
		);
		expect(result).toEqual([
			{
				id: 1,
				playedAt: '2026-01-01T10:00:00.000Z',
				format: '2v2',
				winnerSide: 'A',
				sideA: [1, 2],
				sideB: [3, 4]
			}
		]);
	});

	it('orders games chronologically then by id', () => {
		const result = toGameInputs(
			[
				{ id: 2, playedAt: new Date('2026-01-02T10:00:00Z'), format: '2v2', winnerSide: 'A' },
				{ id: 1, playedAt: new Date('2026-01-01T10:00:00Z'), format: '2v2', winnerSide: 'A' }
			],
			[
				{ gameId: 1, playerId: 1, side: 'A' },
				{ gameId: 1, playerId: 2, side: 'B' },
				{ gameId: 2, playerId: 1, side: 'A' },
				{ gameId: 2, playerId: 2, side: 'B' }
			]
		);
		expect(result.map((g) => g.id)).toEqual([1, 2]);
	});
});
