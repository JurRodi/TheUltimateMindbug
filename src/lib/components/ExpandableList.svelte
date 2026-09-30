<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	// A feed that shows the first `limit` items with a "View all" toggle.
	let {
		items,
		key,
		row,
		limit = 5,
		noun = '',
		gap = '0.5rem'
	}: {
		items: T[];
		key: (item: T) => string | number;
		row: Snippet<[T]>;
		limit?: number;
		/** Appended to the "All N" count, e.g. "games". */
		noun?: string;
		gap?: string;
	} = $props();

	let expanded = $state(false);
	const shown = $derived(expanded ? items : items.slice(0, limit));
</script>

<div class="head">
	<span class="count">
		{#if expanded}All {items.length}{noun ? ` ${noun}` : ''}{:else}Last {shown.length} of {items.length}{/if}
	</span>
	{#if items.length > limit}
		<button class="viewall" onclick={() => (expanded = !expanded)}>
			{expanded ? 'Show less ▴' : 'View all ▾'}
		</button>
	{/if}
</div>
<div class="list" style:gap>
	{#each shown as item (key(item))}
		{@render row(item)}
	{/each}
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.2rem;
	}
	.count {
		font-size: 0.78rem;
		color: var(--onmat-muted);
		font-weight: 700;
	}
	.viewall {
		font-family: var(--display);
		font-size: 0.75rem;
		font-weight: 800;
		cursor: pointer;
		border: none;
		background: var(--surface-2);
		color: var(--muted);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.viewall:hover {
		background: #dcc79b;
		color: var(--ink);
	}
	.list {
		display: flex;
		flex-direction: column;
		margin-top: 0.4rem;
	}
</style>
