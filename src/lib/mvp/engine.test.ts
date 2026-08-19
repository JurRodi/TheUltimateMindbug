import { describe, it, expect } from 'vitest';
import { resolveRound, type RoundInput } from './engine';

const base = (o: Partial<RoundInput>): RoundInput => ({
	participantIds: [1, 2, 3, 4],
	eligibleVoterIds: [1, 2, 3, 4],
	votes: [],
	deadline: '2026-08-19T00:00:00.000Z',
	now: '2026-08-18T00:00:00.000Z',
	...o
});

describe('resolveRound', () => {
	it('quorum is ceil(P/2): 2 for 2v2, 3 for 3v3', () => {
		expect(resolveRound(base({})).quorum).toBe(2);
		expect(
			resolveRound(
				base({ participantIds: [1, 2, 3, 4, 5, 6], eligibleVoterIds: [1, 2, 3, 4, 5, 6] })
			).quorum
		).toBe(3);
	});
	it('stays open below quorum before the deadline', () => {
		const r = resolveRound(base({ votes: [{ voterId: 1, nomineeId: 2 }] }));
		expect(r.status).toBe('open');
		expect(r.quorumMet).toBe(false);
	});
	it('closes early when the leader is mathematically unbeatable', () => {
		// P=4, quorum 2. 3 votes for #2, one voter (id 4) left -> 3 > 0 + 1.
		const r = resolveRound(
			base({
				votes: [
					{ voterId: 1, nomineeId: 2 },
					{ voterId: 2, nomineeId: 2 },
					{ voterId: 3, nomineeId: 2 }
				]
			})
		);
		expect(r.status).toBe('decided');
		expect(r.winners).toEqual([2]);
	});
	it('stays open when the leader is still catchable', () => {
		// 2 votes #2, 1 vote #3, voter 4 remains -> 2 > 1 + 1 is false.
		const r = resolveRound(
			base({
				votes: [
					{ voterId: 1, nomineeId: 2 },
					{ voterId: 2, nomineeId: 2 },
					{ voterId: 3, nomineeId: 3 }
				]
			})
		);
		expect(r.status).toBe('open');
	});
	it('decides at the deadline with a clear winner', () => {
		const r = resolveRound(
			base({
				now: '2026-08-19T00:00:01.000Z',
				votes: [
					{ voterId: 1, nomineeId: 2 },
					{ voterId: 2, nomineeId: 3 },
					{ voterId: 3, nomineeId: 2 }
				]
			})
		);
		expect(r.status).toBe('decided');
		expect(r.winners).toEqual([2]);
	});
	it('produces co-MVPs on a deadline tie', () => {
		const r = resolveRound(
			base({
				now: '2026-08-19T00:00:01.000Z',
				votes: [
					{ voterId: 1, nomineeId: 2 },
					{ voterId: 2, nomineeId: 3 }
				]
			})
		);
		expect(r.status).toBe('decided');
		expect(r.winners).toEqual([2, 3]);
	});
	it('voids at the deadline without quorum', () => {
		const r = resolveRound(
			base({ now: '2026-08-19T00:00:01.000Z', votes: [{ voterId: 1, nomineeId: 2 }] })
		);
		expect(r.status).toBe('void');
		expect(r.winners).toEqual([]);
	});
	it('can never reach quorum when too few are eligible -> void at deadline', () => {
		// P=4 (quorum 2) but only 1 eligible voter.
		const r = resolveRound(
			base({
				eligibleVoterIds: [1],
				now: '2026-08-19T00:00:01.000Z',
				votes: [{ voterId: 1, nomineeId: 2 }]
			})
		);
		expect(r.status).toBe('void');
	});
});
