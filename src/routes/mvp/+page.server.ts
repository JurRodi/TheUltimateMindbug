import { fail } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/authz';
import { db } from '$lib/server/db';
import {
	getOpenRoundsForPlayer,
	getMyOpenVotes,
	getRecentResults,
	getRoundWithVotes,
	castVote
} from '$lib/server/db/queries';
import { processTick, recomputeAfterVote } from '$lib/server/mvp';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Lazy resolution: visiting the page closes any rounds whose deadline has
	// passed (or that already have enough votes) instead of waiting on a cron.
	await processTick(db);
	const player = locals.auth.player;
	// Fetch a generous window of results; the page shows the last 5 with "view all".
	const [results, openRounds, votedRounds] = await Promise.all([
		getRecentResults(db, 50),
		player ? getOpenRoundsForPlayer(db, player.id) : Promise.resolve([]),
		player ? getMyOpenVotes(db, player.id) : Promise.resolve([])
	]);
	// NB: name this `myId`, not `me` — the layout load already exposes `me` (the
	// player object the Nav uses for the avatar), and page data merges over layout
	// data, so reusing `me` here would clobber it and blank the nav avatar.
	return { openRounds, votedRounds, results, myId: player?.id ?? null };
};

export const actions: Actions = {
	vote: async ({ request, locals }) => {
		requireAuth(locals.auth);
		const voterId = locals.auth.player!.id;
		const form = await request.formData();
		const gameId = Number(form.get('gameId'));
		const nomineeId = Number(form.get('nomineeId'));
		if (!gameId || !nomineeId) return fail(400, { error: 'Pick a player' });
		const rw = await getRoundWithVotes(db, gameId);
		if (!rw || rw.round.status !== 'open')
			return fail(400, { error: 'Voting has closed for this game' });
		if (!rw.participantIds.includes(voterId))
			return fail(403, { error: 'You did not play this game' });
		if (!rw.participantIds.includes(nomineeId) || nomineeId === voterId)
			return fail(400, { error: 'Invalid MVP pick' });
		const outcome = await castVote(db, { gameId, voterId, nomineeId });
		if (outcome === 'duplicate') return fail(400, { error: 'You already voted' });
		await recomputeAfterVote(db, gameId);
		return { voted: gameId };
	}
};
