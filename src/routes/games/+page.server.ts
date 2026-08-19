import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { getAllGames, getPlayers, deleteGame } from '$lib/server/db/queries';
import { creatureFor } from '$lib/creatures';
import { paginateByDate } from '$lib/stats/paginate';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 12;

export const load: PageServerLoad = async ({ locals, url }) => {
	// Public page: anyone can browse the game history. The delete action below
	// stays admin-only, and the delete UI is hidden for non-admins client-side.
	const [players, games] = await Promise.all([getPlayers(db), getAllGames(db)]);
	const nameById = new Map(players.map((p) => [p.id, p.name]));
	const avatarById = new Map(players.map((p) => [p.id, p.avatar]));
	const resolve = (id: number) => ({
		name: nameById.get(id) ?? `#${id}`,
		emoji: creatureFor(id, avatarById.get(id))
	});
	const rows = [...games]
		.sort((a, b) => (a.playedAt === b.playedAt ? b.id - a.id : a.playedAt < b.playedAt ? 1 : -1))
		.map((g) => ({
			id: g.id,
			playedAt: g.playedAt,
			format: g.format,
			winnerSide: g.winnerSide,
			sideA: g.sideA.map(resolve),
			sideB: g.sideB.map(resolve)
		}));

	// Date window: a custom from/to wins over a preset range (rolling windows).
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	let range = url.searchParams.get('range') ?? 'all';
	let start: string | null = null;
	let end: string | null = null;
	const iso = (d: Date) => d.toISOString().slice(0, 10);
	const dayMs = 86_400_000;
	const now = new Date();
	if (fromParam || toParam) {
		range = 'custom';
		start = fromParam || null;
		end = toParam || null;
	} else if (range === 'today') {
		start = iso(now);
		end = iso(now);
	} else if (range === 'week') start = iso(new Date(now.getTime() - 6 * dayMs));
	else if (range === 'month') start = iso(new Date(now.getTime() - 29 * dayMs));
	else range = 'all';

	const paged = paginateByDate(rows, {
		start,
		end,
		page: Number(url.searchParams.get('page')) || 1,
		size: PAGE_SIZE
	});

	return {
		games: paged.items,
		page: paged.page,
		pageCount: paged.pageCount,
		total: paged.total,
		range,
		from: fromParam ?? '',
		to: toParam ?? '',
		isAdmin: locals.auth.isAdmin
	};
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		requireAdmin(locals.auth);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid game' });
		await deleteGame(db, id);
		return { ok: true };
	}
};
