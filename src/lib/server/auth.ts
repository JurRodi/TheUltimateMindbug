import { createHmac, timingSafeEqual } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const AUTH_COOKIE = 'mb_auth';

function safeEqual(a: string, b: string): boolean {
	const ba = Buffer.from(a);
	const bb = Buffer.from(b);
	return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function verifyPassword(input: string): boolean {
	return safeEqual(input, env.MINDBUG_PASSWORD ?? '');
}

export function cookieValue(): string {
	return createHmac('sha256', env.AUTH_SECRET ?? '')
		.update('authorized')
		.digest('hex');
}

export function isAuthed(cookies: { get(name: string): string | undefined }): boolean {
	const value = cookies.get(AUTH_COOKIE);
	return value !== undefined && safeEqual(value, cookieValue());
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
