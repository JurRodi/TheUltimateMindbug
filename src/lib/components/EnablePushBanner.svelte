<script lang="ts">
	import { onMount } from 'svelte';
	import { getPushState, enablePush, pushSupported } from '$lib/push-client';

	let show = $state(false);

	onMount(async () => {
		if (!pushSupported()) return;
		if (localStorage.getItem('mb_push_dismissed') === '1') return;
		show = (await getPushState()) === 'unsubscribed';
	});

	function dismiss() {
		localStorage.setItem('mb_push_dismissed', '1');
		show = false;
	}

	async function enable() {
		if (await enablePush()) show = false;
	}
</script>

{#if show}
	<div class="pushbanner">
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="#3a2b06"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path
				d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
			/></svg
		>
		<span class="txt">Get notified when it's time to vote for the MVP.</span>
		<button class="btn small" onclick={enable}>Enable</button>
		<button class="x" aria-label="Dismiss" onclick={dismiss}>✕</button>
	</div>
{/if}

<style>
	.pushbanner {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.7rem 0.9rem;
		border-radius: 14px;
		background: var(--gold-grad);
		color: #3a2b06;
		margin-bottom: 1rem;
		box-shadow: 0 4px 0 rgba(0, 0, 0, 0.2);
	}
	.txt {
		flex: 1;
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.88rem;
	}
	.btn.small {
		background: #3a2b06;
		padding: 0.45rem 0.8rem;
	}
	.x {
		border: none;
		background: transparent;
		color: #3a2b06;
		cursor: pointer;
		font-weight: 800;
		opacity: 0.65;
	}
</style>
