import type { FlagKey, Flags } from './flags';

export type NavHref = '/' | '/tournaments' | '/mvp' | '/players' | '/log' | '/games';
export type NavLink = { href: NavHref; label: string; icon: string };

export type NavContext = { isAdmin: boolean; flags: Flags };

/** A nav link plus the conditions under which it appears.

    `adminOnly` links show only to admins; `flag` links show only while that
    feature flag is on. A link with neither is always shown. New links slot in
    here declaratively — no per-link branching in `navLinks`.

    Players and Log are admin-only management pages, requireAdmin/requireAuth-gated
    server-side, so hiding them here is convenience, not the security boundary.
    Games is public (browse the history); only its delete action is admin-gated. */
type LinkDef = NavLink & { adminOnly?: boolean; flag?: FlagKey };

const CANDIDATES: LinkDef[] = [
	{ href: '/', label: 'Board', icon: '📊' },
	{ href: '/tournaments', label: 'Tournaments', icon: '🏆' },
	{ href: '/mvp', label: 'MVP', icon: '⭐', flag: 'mvp' },
	{ href: '/players', label: 'Players', icon: '👾', adminOnly: true },
	{ href: '/log', label: 'Log', icon: '➕' },
	{ href: '/games', label: 'Games', icon: '🎲' }
];

function visible(link: LinkDef, ctx: NavContext): boolean {
	if (link.adminOnly && !ctx.isAdmin) return false;
	if (link.flag && !ctx.flags[link.flag]) return false;
	return true;
}

/** The primary nav links visible to the current viewer. */
export function navLinks(ctx: NavContext): NavLink[] {
	return CANDIDATES.filter((l) => visible(l, ctx)).map(({ href, label, icon }) => ({
		href,
		label,
		icon
	}));
}
