import { describe, it, expect } from 'vitest';
import {
	normalizeName,
	isValidEmail,
	parseTimestamp,
	isAllowedPushEndpoint,
	MAX_NAME_LEN
} from './validation';

describe('normalizeName', () => {
	it('trims and accepts a normal name', () => {
		expect(normalizeName('  Alice  ')).toBe('Alice');
	});
	it('rejects an empty / whitespace-only name', () => {
		expect(normalizeName('')).toBeNull();
		expect(normalizeName('   ')).toBeNull();
	});
	it('rejects a name over the length cap', () => {
		expect(normalizeName('x'.repeat(MAX_NAME_LEN))).toBe('x'.repeat(MAX_NAME_LEN));
		expect(normalizeName('x'.repeat(MAX_NAME_LEN + 1))).toBeNull();
	});
});

describe('isValidEmail', () => {
	it('accepts a plausible address', () => {
		expect(isValidEmail('a@b.co')).toBe(true);
		expect(isValidEmail('first.last@example.com')).toBe(true);
	});
	it('rejects junk', () => {
		expect(isValidEmail('nope')).toBe(false);
		expect(isValidEmail('a@b')).toBe(false);
		expect(isValidEmail('a b@c.com')).toBe(false);
		expect(isValidEmail('')).toBe(false);
	});
});

describe('isAllowedPushEndpoint', () => {
	it('accepts real push gateways over https', () => {
		expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
		expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/xyz')).toBe(
			true
		);
		expect(isAllowedPushEndpoint('https://db5p.notify.windows.com/w/?token=q')).toBe(true);
		expect(isAllowedPushEndpoint('https://web.push.apple.com/xyz')).toBe(true);
	});
	it('rejects non-push hosts (SSRF guard)', () => {
		expect(isAllowedPushEndpoint('https://evil.example.com/steal')).toBe(false);
		expect(isAllowedPushEndpoint('http://169.254.169.254/latest/meta-data')).toBe(false);
		expect(isAllowedPushEndpoint('https://notgoogleapis.com/x')).toBe(false);
	});
	it('rejects non-https and garbage', () => {
		expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
		expect(isAllowedPushEndpoint('not a url')).toBe(false);
		expect(isAllowedPushEndpoint('')).toBe(false);
	});
	it('is not fooled by a lookalike subdomain', () => {
		expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
	});
});

describe('parseTimestamp', () => {
	it('returns an ISO string for a valid date', () => {
		expect(parseTimestamp('2026-08-18T10:00:00.000Z')).toBe('2026-08-18T10:00:00.000Z');
	});
	it('returns null for garbage', () => {
		expect(parseTimestamp('not-a-date')).toBeNull();
		expect(parseTimestamp('')).toBeNull();
	});
});
