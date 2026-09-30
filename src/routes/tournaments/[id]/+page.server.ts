import { error, fail, redirect } from '@sveltejs/kit';
import { requireAdmin, requireAuth } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { getPlayers } from '$lib/server/db/queries';
import {
	abandonTournament,
	canManage,
	clearResult,
	deleteTournament,
	finishTournament,
	getTournament,
	recordResult,
	type Actor,
	type ActionResult
} from '$lib/server/db/tournaments';
import { standings } from '$lib/tournament/standings';
import {
	canChangeKnockoutResult,
	knockoutRoundsOf,
	roundName,
	totalRounds
} from '$lib/tournament/advance';
import { progress } from '$lib/tournament/summary';
import { creatureFor } from '$lib/creatures';
import type { Actions, PageServerLoad } from './$types';

const actorOf = (locals: App.Locals): Actor => ({
	playerId: locals.auth.player?.id ?? null,
	isAdmin: locals.auth.isAdmin
});

function parseId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) throw error(404, 'Tournament not found');
	return id;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = parseId(params.id);
	const [data, players] = await Promise.all([getTournament(db, id), getPlayers(db)]);
	if (!data) throw error(404, 'Tournament not found');
	const byId = new Map(players.map((p) => [p.id, p]));
	const member = (pid: number) => ({
		id: pid,
		name: byId.get(pid)?.name ?? `#${pid}`,
		emoji: creatureFor(pid, byId.get(pid)?.avatar ?? null)
	});
	const t = data.tournament;
	const actor = actorOf(locals);
	const manage = canManage(t, actor);
	const live = t.status === 'live';
	// Knockout: from the roster, so an abandoned bracket (unplayed rounds
	// deleted) keeps its round names.
	const total = t.style === 'knockout' ? knockoutRoundsOf(data.roster) : totalRounds(data.games);
	// The visible match number is the game's 1-based position among its
	// round's existing games (byes have no game), not slot + 1.
	const feederLabel = (round: number, slot: number) => {
		const prev = data.games.filter((g) => g.round === round - 1);
		const n = prev.findIndex((g) => g.slot === slot) + 1;
		return `Winner of ${roundName(round - 1, total)} M${n}`;
	};

	const matches = data.games.map((g) => ({
		id: g.id,
		round: g.round,
		slot: g.slot,
		team1: g.sideA.map(member),
		team2: g.sideB.map(member),
		team1Label: g.sideA.length
			? null
			: t.style === 'knockout'
				? feederLabel(g.round, g.slot * 2)
				: 'TBD',
		team2Label: g.sideB.length
			? null
			: t.style === 'knockout'
				? feederLabel(g.round, g.slot * 2 + 1)
				: 'TBD',
		winnerSide: g.winnerSide,
		editable:
			live &&
			manage &&
			g.winnerSide !== null &&
			(t.style !== 'knockout' || canChangeKnockoutResult(data.games, g))
	}));

	const rows = standings(data).map((r) => ({ ...r, members: r.playerIds.map(member) }));
	const prog = progress(data);

	return {
		tournament: {
			...t,
			creatorName: t.createdBy != null ? (byId.get(t.createdBy)?.name ?? null) : null
		},
		playerCount: data.roster.length,
		totalRounds: total,
		roundNames:
			t.style === 'knockout'
				? Array.from({ length: total }, (_, i) => roundName(i + 1, total))
				: null,
		matches,
		standings: rows,
		progress: prog,
		canEnter: live && actor.playerId !== null,
		canManage: live && manage,
		canFinish: live && manage && prog.total > 0 && prog.played === prog.total,
		canDelete: locals.auth.isAdmin
	};
};

async function run(locals: App.Locals, fn: (actor: Actor) => Promise<ActionResult>) {
	requireAuth(locals.auth);
	const res = await fn(actorOf(locals));
	return res.ok ? { ok: true } : fail(400, { error: res.error });
}

const gameIdOf = async (request: Request) => {
	const form = await request.formData();
	return { gameId: Number(form.get('gameId')), winner: String(form.get('winner')) };
};

export const actions: Actions = {
	result: async ({ request, params, locals }) => {
		const id = parseId(params.id);
		const { gameId, winner } = await gameIdOf(request);
		if (winner !== 'A' && winner !== 'B') return fail(400, { error: 'Pick the winning team' });
		return run(locals, (actor) => recordResult(db, actor, id, gameId, winner));
	},
	clear: async ({ request, params, locals }) => {
		const id = parseId(params.id);
		const { gameId } = await gameIdOf(request);
		return run(locals, (actor) => clearResult(db, actor, id, gameId));
	},
	finish: async ({ params, locals }) =>
		run(locals, (actor) => finishTournament(db, actor, parseId(params.id))),
	abandon: async ({ params, locals }) =>
		run(locals, (actor) => abandonTournament(db, actor, parseId(params.id))),
	delete: async ({ params, locals }) => {
		requireAdmin(locals.auth);
		await deleteTournament(db, parseId(params.id));
		throw redirect(303, '/tournaments');
	}
};
