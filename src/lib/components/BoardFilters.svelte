<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	let { view, format, range }: { view: string; format: string; range: string } = $props();

	function setParam(key: string, value: string) {
		// Always emit all three params (current values + the one being changed) so
		// the board URL stays complete and shareable, and the server persists the
		// full selection. This component only renders on the home route ("/"), so
		// resolving against that literal route id satisfies
		// svelte/no-navigation-without-resolve while keeping query-param-only nav.
		const qs = new URLSearchParams({ view, format, range, [key]: value }).toString();
		goto(resolve(`/?${qs}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	const views = [
		{ v: 'players', l: 'Players' },
		{ v: 'teams', l: 'Teams' }
	];
	// 1v1 games have no team, so the 1v1 segment only appears in the Players view.
	const formats = $derived(
		view === 'teams'
			? [
					{ v: 'total', l: 'Total' },
					{ v: '2v2', l: '2v2' },
					{ v: '3v3', l: '3v3' }
				]
			: [
					{ v: 'total', l: 'Total' },
					{ v: '1v1', l: '1v1' },
					{ v: '2v2', l: '2v2' },
					{ v: '3v3', l: '3v3' }
				]
	);
	const ranges = [
		{ v: 'all', l: 'All time' },
		{ v: 'month', l: 'Month' },
		{ v: 'week', l: 'Week' }
	];
</script>

<div class="filters">
	<div class="frow view">
		<span class="flabel">Show</span>
		<div class="segset">
			{#each views as o (o.v)}
				<button class:on={view === o.v} onclick={() => setParam('view', o.v)}>{o.l}</button>
			{/each}
		</div>
	</div>
	<div class="frow fmt">
		<span class="flabel">Format</span>
		<div class="segset">
			{#each formats as o (o.v)}
				<button class:on={format === o.v} onclick={() => setParam('format', o.v)}>{o.l}</button>
			{/each}
		</div>
	</div>
	<div class="frow range">
		<span class="flabel">Range</span>
		<div class="segset">
			{#each ranges as o (o.v)}
				<button class:on={range === o.v} onclick={() => setParam('range', o.v)}>{o.l}</button>
			{/each}
		</div>
	</div>
</div>

<style>
	/* Desktop: single inline row — Show on the left, Format + Range on the right.
	   Segmented-control colors/active state come from the global .segset rules. */
	.filters {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 0.75rem 0 0.5rem;
	}
	.frow {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.frow.fmt {
		margin-left: auto; /* pushes Format + Range to the right */
	}
	.flabel {
		display: none;
	}

	/* Mobile: one cohesive filter panel with labelled, full-width controls. */
	@media (max-width: 640px) {
		.filters {
			display: grid;
			gap: 0.65rem;
			background: rgba(0, 0, 0, 0.22);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 16px;
			padding: 0.8rem;
		}
		.frow {
			display: grid;
			grid-template-columns: 54px 1fr;
			gap: 0.6rem;
		}
		.frow.fmt {
			margin-left: 0;
		}
		.flabel {
			display: inline;
			font-family: var(--display);
			font-size: 0.62rem;
			font-weight: 800;
			letter-spacing: 0.07em;
			text-transform: uppercase;
			color: var(--onmat-muted);
		}
		.filters :global(.segset) {
			display: flex;
		}
		.filters :global(.segset button) {
			flex: 1;
			white-space: nowrap;
		}
	}
</style>
