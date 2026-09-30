// Display formatting shared by pages and components, so labels and dates read
// the same everywhere.
import type { TournamentStyle } from '$lib/tournament/types';

/** Win rate (0–1) as a whole percentage, e.g. 0.642 → "64%". */
export const pct = (w: number) => `${Math.round(w * 100)}%`;

/** Signed streak: "W3" / "L2" / "–" (optionally with a 🔥 on win streaks). */
export const streakText = (s: number, fire = false) =>
	s > 0 ? `W${s}${fire ? ' 🔥' : ''}` : s < 0 ? `L${-s}` : '–';

/** Chip tone for a streak: `w` / `l` / `none`. */
export const streakTone = (s: number): 'w' | 'l' | 'none' => (s > 0 ? 'w' : s < 0 ? 'l' : 'none');

/** Medal emoji for a podium finish, else the position (or "—"). */
export const medal = (p: number | null) =>
	p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : (p ?? '—');

export const STYLE_LABEL: Record<TournamentStyle, string> = {
	rotating: '🔀 Rotating',
	fixed: '🛡️ Fixed teams',
	knockout: '🥊 Knockout'
};

/** "Sep 30" — compact, for game rows. */
export const shortDate = (iso: string) =>
	new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "30 Sept 2026". */
export const fullDate = (iso: string) =>
	new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "30 Sept 2026, 14:05". */
export const dateTime = (iso: string) =>
	new Date(iso).toLocaleString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
