export type Vote = { voterId: number; nomineeId: number };
export type RoundStatus = 'open' | 'decided' | 'void';
export type RoundInput = {
	participantIds: number[];
	eligibleVoterIds: number[];
	/** At most one vote per voterId (DB enforces unique(gameId, voterId) upstream), so votes.length is a valid ballot count. */
	votes: Vote[];
	deadline: string; // ISO
	now: string; // ISO
};
export type RoundResult = {
	status: RoundStatus;
	winners: number[];
	quorumMet: boolean;
	quorum: number;
};

/**
 * Resolves an MVP vote round to its current status: `open` while votes are
 * still being collected, `decided` once a winner (or tied co-winners) is
 * settled, or `void` if the deadline passes without quorum.
 */
export function resolveRound(input: RoundInput): RoundResult {
	const { participantIds, eligibleVoterIds, votes, deadline, now } = input;
	const quorum = Math.ceil(participantIds.length / 2);
	const quorumMet = votes.length >= quorum;

	const tally = new Map<number, number>();
	for (const v of votes) tally.set(v.nomineeId, (tally.get(v.nomineeId) ?? 0) + 1);
	const counts = [...tally.values()].sort((a, b) => b - a);
	const top = counts[0] ?? 0;
	const second = counts[1] ?? 0;
	const winnersAtTop = () =>
		[...tally.entries()]
			.filter(([, c]) => c === top)
			.map(([id]) => id)
			.sort((a, b) => a - b);

	const voted = new Set(votes.map((v) => v.voterId));
	const remaining = eligibleVoterIds.filter((id) => !voted.has(id)).length;
	const pastDeadline = new Date(now).getTime() >= new Date(deadline).getTime();

	// The leader is mathematically unbeatable once top > second + remaining:
	// even if every remaining eligible voter piled onto second place, they
	// couldn't catch up, so we can close the round early.
	if (quorumMet && top > second + remaining)
		return { status: 'decided', winners: winnersAtTop(), quorumMet, quorum };
	if (pastDeadline)
		return quorumMet
			? { status: 'decided', winners: winnersAtTop(), quorumMet, quorum }
			: { status: 'void', winners: [], quorumMet, quorum };
	return { status: 'open', winners: [], quorumMet, quorum };
}
