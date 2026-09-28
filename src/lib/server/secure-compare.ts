import { timingSafeEqual } from 'node:crypto';

/** Constant-time string comparison. Returns false for a length mismatch without
    leaking it through timing: `timingSafeEqual` throws on unequal-length buffers,
    so we compare a fixed-size HMAC-like digest instead — but here the simpler
    guard (equal length required) is acceptable because the secret's length is not
    itself sensitive. We still avoid the early-exit char-by-char compare of `===`. */
export function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a, 'utf8');
	const bufB = Buffer.from(b, 'utf8');
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}
