import { createHmac, timingSafeEqual } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const AUTH_COOKIE = 'mb_auth';

function safeEqual(a: string, b: string): boolean {
	const ba = Buffer.from(a);
	const bb = Buffer.from(b);
	return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export type Role = 'authorized' | 'admin';

export function cookieValue(role: Role = 'authorized'): string {
	return createHmac('sha256', env.AUTH_SECRET ?? '')
		.update(role)
		.digest('hex');
}

/** Which role a submitted password grants, or null. Admin wins if both match;
    an empty ADMIN_PASSWORD never authenticates anyone as admin. */
export function authenticate(input: string): Role | null {
	const admin = env.ADMIN_PASSWORD ?? '';
	if (admin && safeEqual(input, admin)) return 'admin';
	if (safeEqual(input, env.MINDBUG_PASSWORD ?? '')) return 'authorized';
	return null;
}

export function isAuthed(cookies: { get(name: string): string | undefined }): boolean {
	const value = cookies.get(AUTH_COOKIE);
	if (value === undefined) return false;
	return safeEqual(value, cookieValue('authorized')) || safeEqual(value, cookieValue('admin'));
}

export function isAdmin(cookies: { get(name: string): string | undefined }): boolean {
	const value = cookies.get(AUTH_COOKIE);
	return value !== undefined && safeEqual(value, cookieValue('admin'));
}

export function authCookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: true,
		maxAge: 60 * 60 * 24 * 365
	};
}

export function requireAuth(cookies: { get(name: string): string | undefined }): void {
	if (!isAuthed(cookies)) throw redirect(303, '/login');
}

export function requireAdmin(cookies: { get(name: string): string | undefined }): void {
	if (!isAdmin(cookies)) throw redirect(303, '/login');
}
