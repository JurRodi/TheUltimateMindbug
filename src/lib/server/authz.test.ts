import { describe, it, expect } from 'vitest';
import { requireAuth, requireAdmin, type AuthContext } from './authz';
import type { AdminPlayer } from '$lib/types';

const mkPlayer = (isAdmin: boolean): AdminPlayer => ({
	id: 1,
	name: 'Jur',
	avatar: null,
	isActive: true,
	createdAt: '2026-01-01T00:00:00Z',
	email: 'jur@example.com',
	isAdmin
});

const signedOut: AuthContext = { player: null, isAdmin: false };
const asUser: AuthContext = { player: mkPlayer(false), isAdmin: false };
const asAdmin: AuthContext = { player: mkPlayer(true), isAdmin: true };

const expectLoginRedirect = (fn: () => void) => {
	try {
		fn();
	} catch (e) {
		expect(e).toMatchObject({ status: 303, location: '/login' });
		return;
	}
	throw new Error('expected a redirect to be thrown');
};

describe('requireAuth', () => {
	it('allows a resolved player', () => expect(() => requireAuth(asUser)).not.toThrow());
	it('redirects when signed out or unlinked', () =>
		expectLoginRedirect(() => requireAuth(signedOut)));
});

describe('requireAdmin', () => {
	it('allows an admin', () => expect(() => requireAdmin(asAdmin)).not.toThrow());
	it('redirects a non-admin player', () => expectLoginRedirect(() => requireAdmin(asUser)));
	it('redirects when signed out', () => expectLoginRedirect(() => requireAdmin(signedOut)));
});
