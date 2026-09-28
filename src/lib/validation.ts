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

/** Hostname suffixes of the real Web Push services. A subscription `endpoint`
    is later POSTed to by the server (web-push), so accepting an arbitrary URL
    would let an authenticated user aim those requests at any host (SSRF). We
    restrict endpoints to the known browser push gateways. */
const PUSH_HOST_SUFFIXES = [
	'.googleapis.com', // Chrome / Chromium (fcm.googleapis.com)
	'.push.services.mozilla.com', // Firefox
	'.notify.windows.com', // Edge / Windows (WNS)
	'.push.apple.com' // Safari / Apple
];

/** True when `endpoint` is an https URL served by a recognised push gateway. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:') return false;
	const host = url.hostname.toLowerCase();
	return PUSH_HOST_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s));
}

/** Parse a client-supplied timestamp into an ISO string, or null when it is not
    a real date (guards against `new Date('garbage').toISOString()` throwing). */
export function parseTimestamp(input: string): string | null {
	const t = new Date(input);
	return Number.isNaN(t.getTime()) ? null : t.toISOString();
}
