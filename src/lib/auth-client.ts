import { createAuthClient } from 'better-auth/svelte';

// Same-origin: baseURL is inferred from the page, so no secret is needed here.
export const authClient = createAuthClient();
