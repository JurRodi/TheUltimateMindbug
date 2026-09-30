<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import TournamentMatchCard from '$lib/components/TournamentMatchCard.svelte';
	import TournamentStandings from '$lib/components/TournamentStandings.svelte';
	import KnockoutBracket from '$lib/components/KnockoutBracket.svelte';
	let { data, form } = $props();

	const STYLE = { rotating: '🔀 Rotating', fixed: '🛡️ Fixed teams', knockout: '🥊 Knockout' };
	const t = $derived(data.tournament);
	const fmt = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	const rounds = $derived([...new Set(data.matches.map((m) => m.round))].sort((a, b) => a - b));
	const inRound = (r: number) => data.matches.filter((m) => m.round === r);
	const champs = $derived(data.standings.filter((r) => r.position === 1));
	let selectedId = $state<number | null>(null);
	let confirming = $state<'abandon' | 'delete' | null>(null);
	let working = $state(false);
	let finishing = $state(false);
	const roundState = (r: number) => {
		const ms = inRound(r);
		if (ms.every((m) => m.winnerSide !== null)) return 'done';
		return r === data.progress.round ? 'now' : 'upcoming';
	};
	const pct = $derived(
		data.progress.total ? (100 * data.progress.played) / data.progress.total : 0
	);
</script>

<a class="backlink" href={resolve('/tournaments')}>← Tournaments</a>

<div class="card hero">
	<div class="top">
		<h1>{t.name}</h1>
		{#if t.status === 'live'}<span class="chip live">● LIVE</span
			>{:else if t.status === 'abandoned'}<span class="chip">Abandoned</span>{/if}
	</div>
	<div class="chips">
		<span class="chip">{STYLE[t.style]}</span><span class="chip">{t.format}</span>
		<span class="chip">{data.playerCount} players</span>
		{#if t.tables > 1 && t.style !== 'knockout'}<span class="chip">{t.tables} tables</span>{/if}
		<span class="chip">{t.ranked ? 'Ranked' : 'Unranked'}</span>
	</div>
	<p class="meta">
		Started {fmt(t.createdAt)}{#if t.creatorName}
			· by {t.creatorName}{/if}
	</p>
	{#if t.status === 'live'}
		<div class="bar"><i style="width: {pct}%"></i></div>
		<p class="meta">
			{data.progress.played} of {data.progress.total} games played{#if data.progress.round && t.style !== 'knockout'}
				· round {data.progress.round} of {data.totalRounds}{/if}
		</p>
	{/if}
</div>

{#if t.status === 'finished' && champs.length}
	<div class="card champ">
		<div class="big">🏆</div>
		{#each champs as c (c.key)}<div class="n">
				{c.members.map((m) => `${m.emoji} ${m.name}`).join(' + ')}
			</div>{/each}
		<div>Champion{champs.length > 1 ? 's' : ''} · {t.name}</div>
	</div>
{/if}

{#if form?.error}<p class="err">{form.error}</p>{/if}

{#if t.style === 'knockout' && data.roundNames}
	<h2>Bracket</h2>
	<KnockoutBracket matches={data.matches} roundNames={data.roundNames} />
{:else if t.style !== 'knockout'}
	<h2>{t.style === 'rotating' ? 'Standings' : 'Team standings'}</h2>
	<TournamentStandings rows={data.standings} style={t.style} />
{/if}

<h2>Schedule</h2>
<div class="card">
	{#each rounds as r (r)}
		<div class="round">
			<div class="rh">
				<span>{data.roundNames ? data.roundNames[r - 1] : `Round ${r}`}</span>
				{#if t.status === 'live'}
					{@const s = roundState(r)}
					<span class="chip" class:now={s === 'now'}>{s}</span>
				{/if}
			</div>
			{#each inRound(r) as m (m.id)}
				<TournamentMatchCard
					match={m}
					showTable={inRound(r).length > 1 && t.style !== 'knockout'}
					selected={selectedId === m.id}
					canEnter={data.canEnter}
					onselect={() => (selectedId = selectedId === m.id ? null : m.id)}
				/>
			{/each}
		</div>
	{/each}
</div>

{#if data.canManage || data.canDelete}
	<div class="manage">
		{#if data.canFinish}
			<form
				method="POST"
				action="?/finish"
				use:enhance={() => {
					working = finishing = true;
					return async ({ update }) => {
						await update();
						working = finishing = false;
					};
				}}
			>
				<button class="btn" type="submit" disabled={working}>
					{#if finishing}<span class="spin" aria-hidden="true"></span> Finishing…{:else}🏁 Finish
						tournament{/if}
				</button>
			</form>
		{/if}
		{#each [{ key: 'abandon', show: data.canManage, label: 'Abandon', cls: 'secondary' }, { key: 'delete', show: data.canDelete, label: '🗑 Delete', cls: 'danger' }] as const as a (a.key)}
			{#if a.show}
				{#if confirming === a.key}
					<form
						method="POST"
						action="?/{a.key}"
						class="sure"
						use:enhance={() => {
							working = true;
							return async ({ update }) => {
								await update();
								working = false;
								confirming = null;
							};
						}}
					>
						<span class="q">Sure?</span>
						<button class="btn danger" type="submit" disabled={working}>Yes</button>
						<button class="btn secondary" type="button" onclick={() => (confirming = null)}
							>Cancel</button
						>
					</form>
				{:else}
					<button class="btn {a.cls}" type="button" onclick={() => (confirming = a.key)}
						>{a.label}</button
					>
				{/if}
			{/if}
		{/each}
	</div>
{/if}

<style>
	.backlink {
		color: var(--teal);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 700;
	}
	h2 {
		font-size: 1.05rem;
		margin: 1.5rem 0 0.7rem;
	}
	.hero {
		margin-top: 0.6rem;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
	}
	.hero h1 {
		color: var(--ink);
		margin: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.4rem;
	}
	.chip.live {
		background: var(--coral);
		color: #fff;
	}
	.chip.now {
		background: var(--teal);
		color: #fff;
	}
	.meta {
		font-size: 0.82rem;
		color: var(--muted);
		margin: 0.4rem 0 0;
	}
	.bar {
		height: 8px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
		margin-top: 0.6rem;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--teal);
	}
	.champ {
		margin-top: 0.8rem;
		text-align: center;
		background: linear-gradient(155deg, #edca66, #cf9a2c);
		border-color: #a8791f;
		font-weight: 700;
	}
	.champ .big {
		font-size: 2rem;
	}
	.champ .n {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.15rem;
	}
	.round + .round {
		margin-top: 0.8rem;
	}
	.rh {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: 800;
		font-size: 0.88rem;
		margin-bottom: 0.4rem;
	}
	.manage {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.btn.danger {
		background: linear-gradient(160deg, #e5604a, #c23b28);
		color: #fff;
	}
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
	.err {
		color: var(--coral);
		font-weight: 800;
	}
</style>
