<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Toast from '$lib/components/Toast.svelte';
	let { data } = $props();

	let confirmingId = $state<number | null>(null);
	let deletingId = $state<number | null>(null);
	let toast = $state<string | null>(null);

	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
	const fmtDateTime = (iso: string) =>
		new Date(iso).toLocaleString('nl-NL', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	const presets = [
		{ v: 'all', l: 'All' },
		{ v: 'today', l: 'Today' },
		{ v: 'week', l: 'Week' },
		{ v: 'month', l: 'Month' }
	];
	// Local editable copies of the date inputs, seeded from the URL-derived data
	// and re-synced whenever navigation changes it (the component persists across
	// same-route navigations, so a plain initializer would go stale).
	let customFrom = $state(untrack(() => data.from));
	let customTo = $state(untrack(() => data.to));
	$effect(() => {
		customFrom = data.from;
		customTo = data.to;
	});
	const filtered = $derived(data.range !== 'all');

	function nav(qs: string) {
		goto(resolve(qs ? `/games?${qs}` : '/games'), { keepFocus: true, noScroll: true });
	}
	function selectPreset(r: string) {
		nav(r === 'all' ? '' : `range=${r}`);
	}
	function applyCustom() {
		const parts: string[] = [];
		if (customFrom) parts.push(`from=${customFrom}`);
		if (customTo) parts.push(`to=${customTo}`);
		nav(parts.join('&'));
	}
	function clearFilter() {
		nav('');
	}
	function pageHref(n: number) {
		const parts: string[] = [];
		if (data.range !== 'all' && data.range !== 'custom') parts.push(`range=${data.range}`);
		if (data.from) parts.push(`from=${data.from}`);
		if (data.to) parts.push(`to=${data.to}`);
		parts.push(`page=${n}`);
		return resolve(`/games?${parts.join('&')}`);
	}
</script>

<h1>Games 🎲</h1>
{#if data.isAdmin}
	<p class="sub">Delete a mistaken or joke game. Permanent — ratings recompute automatically.</p>
{:else}
	<p class="sub">Every game logged, newest first.</p>
{/if}

{#if toast}<Toast message={toast} ondone={() => (toast = null)} />{/if}

<div class="filters">
	<div class="segset">
		{#each presets as o (o.v)}
			<button class:on={data.range === o.v} onclick={() => selectPreset(o.v)}>{o.l}</button>
		{/each}
	</div>
	<div class="range">
		<label>From <input type="date" bind:value={customFrom} onchange={applyCustom} /></label>
		<label>To <input type="date" bind:value={customTo} onchange={applyCustom} /></label>
		{#if data.range === 'custom'}
			<button class="clear" onclick={clearFilter}>Clear</button>
		{/if}
	</div>
</div>

{#if data.games.length === 0}
	<p class="card">{filtered ? 'No games match this filter.' : 'No games logged yet.'}</p>
{:else}
	<div class="log">
		{#each data.games as g (g.id)}
			<div class="card row">
				<div class="mid">
					<div class="line1">
						<span class="fmt">{g.format}</span><span class="date">{fmtDate(g.playedAt)}</span>
						{#if data.isAdmin}
							<span class="audit">
								Entered by {g.enteredBy ?? 'unknown'}{#if g.createdAt}
									· {fmtDateTime(g.createdAt)}{/if}
							</span>
						{/if}
					</div>
					<div class="teams">
						<span class="side" class:win={g.winnerSide === 'A'}>
							{#each g.sideA as p (p.name)}<span class="pl"
									><span class="em">{p.emoji}</span>{p.name}</span
								>{/each}
						</span>
						<span class="vs">vs</span>
						<span class="side" class:win={g.winnerSide === 'B'}>
							{#each g.sideB as p (p.name)}
								<span class="pl">
									<span class="em">{p.emoji}</span>{p.name}
								</span>
							{/each}
						</span>
					</div>
				</div>
				{#if data.isAdmin}
					<div class="actions">
						{#if confirmingId === g.id}
							<form
								method="POST"
								action="?/delete"
								use:enhance={() => {
									deletingId = g.id;
									return async ({ result, update }) => {
										await update();
										deletingId = null;
										confirmingId = null;
										if (result.type === 'success') toast = 'Game deleted ✓';
									};
								}}
							>
								<input type="hidden" name="id" value={g.id} />
								<span class="q">Delete?</span>
								<button class="btn danger" type="submit" disabled={deletingId === g.id}>
									{#if deletingId === g.id}<span class="spin" aria-hidden="true"
										></span>{:else}Yes{/if}
								</button>
								<button class="btn secondary" type="button" onclick={() => (confirmingId = null)}
									>Cancel</button
								>
							</form>
						{:else}
							<button class="btn secondary" type="button" onclick={() => (confirmingId = g.id)}
								>🗑 Delete</button
							>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="pager">
		{#if data.page > 1}
			<a class="pbtn" href={pageHref(data.page - 1)}>‹ Prev</a>
		{:else}
			<span class="pbtn disabled">‹ Prev</span>
		{/if}
		<span class="pmeta">Page {data.page} of {data.pageCount} · {data.total} games</span>
		{#if data.page < data.pageCount}
			<a class="pbtn" href={pageHref(data.page + 1)}>Next ›</a>
		{:else}
			<span class="pbtn disabled">Next ›</span>
		{/if}
	</div>
{/if}

<style>
	.sub {
		color: var(--onmat-muted);
		font-size: 0.9rem;
		margin: 0.2rem 0 1rem;
	}
	.log {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.6rem 0.8rem;
	}
	.mid {
		flex: 1;
		min-width: 0;
	}
	.line1 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.fmt {
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		padding: 0.08rem 0.4rem;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--muted);
	}
	.date {
		font-size: 0.72rem;
		color: var(--muted);
		font-weight: 700;
	}
	.teams {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}
	.side {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
		padding: 0.15rem 0.35rem;
		border-radius: 9px;
	}
	.side.win {
		background: rgba(15, 143, 106, 0.14);
	}
	.pl {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--ink);
	}
	.pl .em {
		font-size: 0.95rem;
	}
	.vs {
		font-family: var(--display);
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--muted);
	}
	.audit {
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--muted);
	}
	.actions form {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.q {
		font-size: 0.78rem;
		font-weight: 800;
		color: var(--ink);
	}
	.btn.danger {
		background: linear-gradient(160deg, #e5604a, #c23b28);
		color: #fff;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 0.9rem;
		margin-bottom: 1rem;
	}
	.range {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.range label {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 800;
		color: var(--onmat-muted);
	}
	.range input {
		padding: 0.3rem 0.4rem;
		border-radius: 8px;
		border: 1.5px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
		font-size: 0.8rem;
	}
	.clear {
		border: none;
		background: rgba(0, 0, 0, 0.24);
		color: var(--onmat-muted);
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.72rem;
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.9rem;
		margin-top: 1rem;
	}
	.pbtn {
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.8rem;
		color: var(--onmat);
		text-decoration: none;
		background: rgba(0, 0, 0, 0.24);
		border-radius: 999px;
		padding: 0.4rem 0.85rem;
	}
	.pbtn.disabled {
		opacity: 0.4;
	}
	.pmeta {
		font-size: 0.78rem;
		color: var(--onmat-muted);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
