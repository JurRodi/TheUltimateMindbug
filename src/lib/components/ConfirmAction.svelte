<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { track } from '$lib/enhance';

	// A button that turns into "Sure? [Yes] [Cancel]" and posts `action` on Yes.
	let {
		action,
		label,
		variant = 'secondary',
		question = 'Sure?',
		success,
		children
	}: {
		action: string;
		label: string;
		variant?: 'secondary' | 'danger';
		question?: string;
		/** Toast shown after a successful post. */
		success?: string;
		/** Hidden inputs posted with the form. */
		children?: Snippet;
	} = $props();

	let confirming = $state(false);
	let busy = $state(false);
</script>

{#if confirming}
	<form
		method="POST"
		{action}
		class="sure"
		use:enhance={track({
			pending: (on) => {
				busy = on;
				if (!on) confirming = false;
			},
			success
		})}
	>
		{@render children?.()}
		<span class="q">{question}</span>
		<button class="btn danger" type="submit" disabled={busy}>
			{#if busy}<span class="spin" aria-hidden="true"></span>{:else}Yes{/if}
		</button>
		<button class="btn secondary" type="button" onclick={() => (confirming = false)}>Cancel</button>
	</form>
{:else}
	<button class="btn {variant}" type="button" onclick={() => (confirming = true)}>{label}</button>
{/if}

<style>
	.sure {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.q {
		font-size: 0.78rem;
		font-weight: 800;
		color: var(--ink);
	}
</style>
