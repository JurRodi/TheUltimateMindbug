<script lang="ts">
	import { onMount } from 'svelte';
	import { getPushState, disablePush, pushSupported } from '$lib/push-client';
	import { createPushEnabler } from '$lib/push-ui.svelte';
	import PushHelpDialog from './PushHelpDialog.svelte';

	const push = createPushEnabler();
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
			pushState = (await push.enable()) ? 'subscribed' : await getPushState();
		}
		busy = false;
	}
</script>

{#if pushState === 'unsupported'}
	<p class="muted">This browser can't show notifications.</p>
	<button class="linkbtn" onclick={() => push.openHelp('unsupported')}>How to enable them →</button>
{:else if pushState === 'denied'}
	<p class="muted">Notifications are blocked for this site.</p>
	<button class="linkbtn" onclick={() => push.openHelp('permission')}>How to unblock →</button>
{:else}
	<button class="btn" onclick={toggle} disabled={busy || pushState === 'loading'}>
		{#if busy}<span class="spin"></span>{/if}
		{pushState === 'subscribed' ? 'Turn off notifications' : 'Enable notifications'}
	</button>
	{#if push.error}
		<p class="err">
			{push.error}
			<button class="linkbtn" onclick={() => (push.helpOpen = true)}>How to fix →</button>
		</p>
	{/if}
{/if}

<PushHelpDialog bind:open={push.helpOpen} kind={push.helpKind} />

<style>
	.muted {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 0.35rem;
	}
	.err {
		color: var(--danger);
		font-size: 0.82rem;
		font-weight: 700;
		margin: 0.5rem 0 0;
	}
	.linkbtn {
		border: none;
		background: transparent;
		padding: 0;
		cursor: pointer;
		color: var(--teal);
		font-weight: 800;
		font-size: 0.82rem;
	}
	.linkbtn:hover {
		text-decoration: underline;
	}
</style>
