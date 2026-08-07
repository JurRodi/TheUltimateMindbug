<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	let { view }: { view: string } = $props();

	function set(value: string) {
		const url = new URL(page.url);
		url.searchParams.set('view', value);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<div class="tabs">
	<button class:on={view === 'players'} onclick={() => set('players')}>Players</button>
	<button class:on={view === 'teams'} onclick={() => set('teams')}>Teams</button>
</div>

<style>
	.tabs {
		display: flex;
		gap: 0.25rem;
		background: var(--surface);
		border-radius: 999px;
		padding: 0.3rem;
		margin-top: 0.75rem;
	}
	button {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--muted);
		font-family: var(--display);
		font-size: 0.9rem;
		padding: 0.5rem;
		border-radius: 999px;
		cursor: pointer;
	}
	button.on {
		background: var(--accent);
		color: #06231a;
	}
</style>
