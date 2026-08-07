import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		MINDBUG_PASSWORD: 'hunter2',
		AUTH_SECRET: 'test-secret'
	}
}));

describe('auth', () => {
	it('verifies the shared password (timing-safe)', async () => {
		const { verifyPassword } = await import('./auth');
		expect(verifyPassword('hunter2')).toBe(true);
		expect(verifyPassword('wrong')).toBe(false);
		expect(verifyPassword('')).toBe(false);
	});

	it('issues a cookie value that isAuthed accepts and rejects tampering', async () => {
		const { cookieValue, isAuthed, AUTH_COOKIE } = await import('./auth');
		const value = cookieValue();
		const good = { get: (n: string) => (n === AUTH_COOKIE ? value : undefined) };
		const bad = { get: (n: string) => (n === AUTH_COOKIE ? value + 'x' : undefined) };
		const none = { get: () => undefined };
		expect(isAuthed(good)).toBe(true);
		expect(isAuthed(bad)).toBe(false);
		expect(isAuthed(none)).toBe(false);
	});
});
