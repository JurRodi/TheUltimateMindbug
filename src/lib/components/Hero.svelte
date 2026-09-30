<script lang="ts">
	import type { Snippet } from 'svelte';

	// Detail-page header card: art on the left; name, badges and rank on top,
	// then an optional meta line, the stat row and any extra content.
	let {
		title,
		rank = null,
		art,
		badges,
		meta,
		stats,
		children
	}: {
		title: string;
		/** e.g. "#2 of 9" — pinned to the right of the title row. */
		rank?: string | null;
		art: Snippet;
		badges?: Snippet;
		meta?: Snippet;
		/** Row of <Stat>s (chips fit too). */
		stats?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<div class="card hero">
	{@render art()}
	<div class="body">
		<div class="top">
			<h1>{title}</h1>
			{@render badges?.()}
			{#if rank}<span class="rank">{rank}</span>{/if}
		</div>
		{@render meta?.()}
		{#if stats}<div class="statrow">{@render stats()}</div>{/if}
		{@render children?.()}
	</div>
</div>

<style>
	.hero {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-top: 0.6rem;
	}
	.body {
		min-width: 0;
		flex: 1;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	h1 {
		margin: 0;
		color: var(--ink);
	}
	.rank {
		margin-left: auto;
		color: var(--muted);
		font-weight: 800;
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}
	.statrow {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		margin-top: 0.6rem;
		align-items: center;
	}
</style>
