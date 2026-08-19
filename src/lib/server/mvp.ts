import type { Format } from '$lib/types';
import { resolveRound } from '$lib/mvp/engine';
import {
	createMvpRound,
	getRoundWithVotes,
	closeRound,
	claimRoundNotification,
	eligibleVoterIds,
	type DB
} from './db/queries';
import { eq } from 'drizzle-orm';
import { mvpRounds } from './db/schema';
import { sendToPlayers } from './push';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const REMINDER_MS = 4 * 60 * 60 * 1000;

export async function onGameLogged(
	db: DB,
	gameId: number,
	format: Format,
	playedAt: string,
	now: Date = new Date()
): Promise<void> {
	if (format !== '2v2' && format !== '3v3') return;
	const deadline = new Date(now.getTime() + WINDOW_MS).toISOString();
	await createMvpRound(db, { gameId, deadline });
	const rw = await getRoundWithVotes(db, gameId);
	if (!rw) return;
	if (await claimRoundNotification(db, gameId, 'open')) {
		await sendToPlayers(db, rw.participantIds, {
			title: 'Vote for the MVP!',
			body: 'Who was the standout player? You have 24h.',
			url: '/mvp'
		});
	}
}

async function resolveOne(db: DB, gameId: number, now: Date) {
	const rw = await getRoundWithVotes(db, gameId);
	if (!rw || rw.round.status !== 'open') return;
	const eligible = await eligibleVoterIds(db, gameId);
	const res = resolveRound({
		participantIds: rw.participantIds,
		eligibleVoterIds: eligible,
		votes: rw.votes,
		deadline: rw.round.deadline.toISOString(),
		now: now.toISOString()
	});
	if (res.status === 'open') return { rw, res };
	await closeRound(db, gameId, res.status);
	if (await claimRoundNotification(db, gameId, 'result')) {
		const body =
			res.status === 'void'
				? 'Not enough votes — no MVP this time.'
				: `The MVP has been decided! See who won.`;
		await sendToPlayers(db, rw.participantIds, { title: 'MVP result', body, url: '/mvp' });
	}
	return { rw, res };
}

export async function recomputeAfterVote(
	db: DB,
	gameId: number,
	now: Date = new Date()
): Promise<void> {
	await resolveOne(db, gameId, now);
}

export async function processTick(db: DB, now: Date = new Date()): Promise<void> {
	const open = await db
		.select({
			gameId: mvpRounds.gameId,
			deadline: mvpRounds.deadline,
			reminderNotifiedAt: mvpRounds.reminderNotifiedAt
		})
		.from(mvpRounds)
		.where(eq(mvpRounds.status, 'open'));
	for (const r of open) {
		const outcome = await resolveOne(db, r.gameId, now);
		if (!outcome || outcome.res.status !== 'open') continue; // already closed, or closed this tick
		// still open -> maybe remind
		const msLeft = r.deadline.getTime() - now.getTime();
		if (msLeft > 0 && msLeft < REMINDER_MS && !r.reminderNotifiedAt) {
			if (await claimRoundNotification(db, r.gameId, 'reminder')) {
				const rw = await getRoundWithVotes(db, r.gameId);
				if (rw) {
					const votedIds = new Set(rw.votes.map((v) => v.voterId));
					const notVoted = (await eligibleVoterIds(db, r.gameId)).filter((id) => !votedIds.has(id));
					await sendToPlayers(db, notVoted, {
						title: 'MVP vote closing soon',
						body: 'A few hours left to vote for the MVP.',
						url: '/mvp'
					});
				}
			}
		}
	}
}
