<script lang="ts">
	import { onMount } from 'svelte';
	import { getPushState, enablePush, disablePush, pushSupported } from '$lib/push-client';

	let pushState = $state<'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'>(
		'loading'
	);
	let busy = $state(false);

	onMount(async () => {
		pushState = pushSupported() ? await getPushState() : 'unsupported';
	});

	async function toggle() {
		busy = true;
		if (pushState === 'subscribed') {
			await disablePush();
			pushState = 'unsubscribed';
		} else {
			pushState = (await enablePush()) ? 'subscribed' : await getPushState();
		}
		busy = false;
	}
</script>

{#if pushState === 'unsupported'}
	<p class="muted">Push notifications aren't supported on this device/browser.</p>
{:else if pushState === 'denied'}
	<p class="muted">Notifications are blocked. Enable them in your browser settings, then reload.</p>
{:else}
	<button class="btn" onclick={toggle} disabled={busy || pushState === 'loading'}>
		{#if busy}<span class="spin"></span>{/if}
		{pushState === 'subscribed' ? 'Turn off notifications' : 'Enable notifications'}
	</button>
{/if}

<style>
	.muted {
		color: var(--muted);
		font-size: 0.85rem;
	}
</style>
