import { auth } from '$lib/server/betterauth';
import type { RequestHandler } from './$types';

// Better Auth owns every /api/auth/* endpoint (sign-in, callback, session, …).
// Handling them through an explicit catch-all route — rather than only the
// `svelteKitHandler` origin check in hooks — means the request reaches
// `auth.handler` regardless of which origin/alias Vercel serves it on, so a
// BETTER_AUTH_URL that doesn't exactly match the browsing origin can't turn
// these into 404s.
export const GET: RequestHandler = ({ request }) => auth.handler(request);
export const POST: RequestHandler = ({ request }) => auth.handler(request);
