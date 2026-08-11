import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		MINDBUG_PASSWORD: 'hunter2',
		ADMIN_PASSWORD: 'admin-pw',
		AUTH_SECRET: 'test-secret'
	}
}));

describe('authenticate', () => {
	it('maps each password to its role and rejects unknown input', async () => {
		const { authenticate } = await import('./auth');
		expect(authenticate('admin-pw')).toBe('admin');
		expect(authenticate('hunter2')).toBe('authorized');
		expect(authenticate('nope')).toBe(null);
		expect(authenticate('')).toBe(null);
	});
});

describe('cookie roles', () => {
	it('isAdmin accepts only the admin value; isAuthed accepts both', async () => {
		const { cookieValue, isAuthed, isAdmin, AUTH_COOKIE } = await import('./auth');
		const asAdmin = { get: (n: string) => (n === AUTH_COOKIE ? cookieValue('admin') : undefined) };
		const asUser = {
			get: (n: string) => (n === AUTH_COOKIE ? cookieValue('authorized') : undefined)
		};
		const tampered = { get: (n: string) => (n === AUTH_COOKIE ? 'deadbeef' : undefined) };
		const none = { get: () => undefined };

		expect(isAdmin(asAdmin)).toBe(true);
		expect(isAdmin(asUser)).toBe(false);
		expect(isAuthed(asAdmin)).toBe(true);
		expect(isAuthed(asUser)).toBe(true);
		expect(isAuthed(tampered)).toBe(false);
		expect(isAuthed(none)).toBe(false);
	});
});

describe('authenticate with no admin password', () => {
	it('never grants admin when ADMIN_PASSWORD is empty', async () => {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({
			env: { MINDBUG_PASSWORD: 'hunter2', ADMIN_PASSWORD: '', AUTH_SECRET: 'test-secret' }
		}));
		const { authenticate } = await import('./auth');
		expect(authenticate('')).toBe(null);
		expect(authenticate('hunter2')).toBe('authorized');
		vi.doUnmock('$env/dynamic/private');
		vi.resetModules();
	});
});
