/** Server-side input validation shared by the write actions. These are pure and
    unit-tested; the equivalent client-side checks are cosmetic because a raw
    POST (e.g. curl) bypasses them, so the server must re-validate everything
    before it reaches the DB. */

/** Max length for a player name. The DB `name` column is unbounded text, so the
    cap is enforced here rather than by a column constraint. */
export const MAX_NAME_LEN = 40;

/** Trim a submitted name; return it when non-empty and within the cap, else null. */
export function normalizeName(input: string): string | null {
	const name = input.trim();
	return name.length >= 1 && name.length <= MAX_NAME_LEN ? name : null;
}

/** Loose email sanity check — one @, non-empty local/domain, a dotted domain and
    no whitespace. Enough to reject obvious junk before the DB unique index; not
    meant to be RFC-exhaustive. */
export function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Parse a client-supplied timestamp into an ISO string, or null when it is not
    a real date (guards against `new Date('garbage').toISOString()` throwing). */
export function parseTimestamp(input: string): string | null {
	const t = new Date(input);
	return Number.isNaN(t.getTime()) ? null : t.toISOString();
}
