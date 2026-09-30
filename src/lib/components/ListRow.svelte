<script lang="ts">
	import type { Snippet } from 'svelte';

	// One edge-to-edge row inside a `.card.list`: icon · body · trailing side.
	let {
		href,
		dim = false,
		icon,
		children,
		aside
	}: {
		href: string;
		/** Fade the row (e.g. an abandoned tournament). */
		dim?: boolean;
		icon: Snippet;
		children: Snippet;
		aside?: Snippet;
	} = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolve()d href -->
<a class="row" class:dim {href}>
	{@render icon()}
	<span class="mid">{@render children()}</span>
	<span class="aside">{@render aside?.()}</span>
</a>

<style>
	.row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.7rem;
		align-items: center;
		padding: 0.7rem 0.9rem;
		color: var(--ink);
		text-decoration: none;
		border-top: 1px solid var(--line-card);
		transition: background 0.14s ease;
	}
	.row:first-child {
		border-top: 0;
	}
	.row:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	.row.dim {
		opacity: 0.55;
	}
	.mid {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}
</style>
