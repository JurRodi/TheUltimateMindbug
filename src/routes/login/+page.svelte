<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { page } from '$app/state';
	let submitting = $state(false);

	async function signIn() {
		submitting = true;
		const requested = page.url.searchParams.get('redirectTo');
		const to =
			requested && requested.startsWith('/') && !/^\/[\\/]/.test(requested) ? requested : '/';
		await authClient.signIn.social({ provider: 'google', callbackURL: to });
	}
</script>

<h1>Sign in</h1>
<p class="muted">Use the Google account your admin added. New here? Ask an admin to add you.</p>

<button class="btn" onclick={signIn} disabled={submitting}>
	{#if submitting}<span class="spin" aria-hidden="true"></span> Redirecting…{:else}Sign in with
		Google{/if}
</button>

<style>
	.muted {
		color: var(--muted);
	}
	button {
		margin-top: 1rem;
	}
</style>
