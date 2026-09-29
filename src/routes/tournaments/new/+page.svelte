<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { creatureFor } from '$lib/creatures';
	import { validateSetup, maxTables, MAX_ROUNDS } from '$lib/tournament/validate';
	import { generateSchedule } from '$lib/tournament/schedule';
	import { randomSeed } from '$lib/tournament/rng';
	import type { TournamentStyle } from '$lib/tournament/types';
	import type { Format } from '$lib/types';
	let { data, form } = $props();

	const STYLES: { v: TournamentStyle; icon: string; label: string; text: string }[] = [
		{
			v: 'rotating',
			icon: '🔀',
			label: 'Rotating teams',
			text: 'New random teams every round. Individual points.'
		},
		{
			v: 'fixed',
			icon: '🛡️',
			label: 'Fixed teams',
			text: 'Teams drawn once, everyone plays everyone.'
		},
		{
			v: 'knockout',
			icon: '🥊',
			label: 'Knockout',
			text: "Lose and you're out. Bracket to a final."
		}
	];

	let name = $state(
		`Tournament ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
	);
	let style = $state<TournamentStyle>('rotating');
	let format = $state<Format>('2v2');
	let selected = $state<number[]>([]);
	let rounds = $state(5);
	let tables = $state(1);
	let ranked = $state(true);
	let seed = $state(randomSeed());
	let submitting = $state(false);

	const byId = $derived(new Map(data.players.map((p) => [p.id, p])));
	const label = (id: number) => {
		const p = byId.get(id);
		return p ? `${creatureFor(p.id, p.avatar)} ${p.name}` : `#${id}`;
	};
	const toggle = (id: number) =>
		(selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

	const cap = $derived(maxTables(format, selected.length));
	const result = $derived(
		validateSetup({
			style,
			format,
			playerIds: selected,
			rounds: style === 'rotating' ? rounds : null,
			tables
		})
	);
	const schedule = $derived(result.ok ? generateSchedule(result.setup, seed) : null);
	const sitting = (round: number) => {
		if (!schedule || style !== 'rotating') return [];
		const playing = new Set(
			schedule.games.filter((g) => g.round === round).flatMap((g) => [...g.sideA!, ...g.sideB!])
		);
		return selected.filter((id) => !playing.has(id));
	};
	const previewRounds = $derived(schedule ? [...new Set(schedule.games.map((g) => g.round))] : []);
	const side = (ids: number[] | null) => (ids ? ids.map(label).join(' + ') : 'TBD');
</script>

<a class="backlink" href={resolve('/tournaments')}>← Tournaments</a>
<h1>New tournament</h1>

<form
	method="POST"
	class="card"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	<input type="hidden" name="style" value={style} />
	<input type="hidden" name="format" value={format} />
	<input type="hidden" name="seed" value={seed} />
	<input type="hidden" name="ranked" value={String(ranked)} />
	{#if style === 'rotating'}<input type="hidden" name="rounds" value={rounds} />{/if}
	<input type="hidden" name="tables" value={Math.min(tables, cap)} />
	{#each selected as id (id)}<input type="hidden" name="playerIds" value={id} />{/each}

	<label class="sec" for="tname">Name</label>
	<input id="tname" class="text" name="name" bind:value={name} maxlength="60" required />

	<div class="sec">Style</div>
	<div class="styles">
		{#each STYLES as s (s.v)}
			<button type="button" class="style" class:on={style === s.v} onclick={() => (style = s.v)}>
				<b>{s.icon} {s.label}</b>{s.text}
			</button>
		{/each}
	</div>

	<div class="sec">Format</div>
	<div class="segset">
		{#each ['1v1', '2v2', '3v3'] as const as f (f)}
			<button type="button" class:on={format === f} onclick={() => (format = f)}>{f}</button>
		{/each}
	</div>

	<div class="sec">Players <span class="count">({selected.length} selected)</span></div>
	<div class="players">
		{#each data.players as p (p.id)}
			<button
				type="button"
				class="pl"
				class:on={selected.includes(p.id)}
				onclick={() => toggle(p.id)}
			>
				{creatureFor(p.id, p.avatar)}
				{p.name}
			</button>
		{/each}
	</div>

	{#if style === 'rotating'}
		<label class="field">
			<span><b>Rounds</b></span>
			<input class="num" type="number" min="1" max={MAX_ROUNDS} bind:value={rounds} />
		</label>
	{/if}
	<label class="field">
		<span
			><b>Matches at once</b><span class="hint">Up to {cap} with {selected.length} players</span
			></span
		>
		<input class="num" type="number" min="1" max={cap} bind:value={tables} />
	</label>
	<label class="field">
		<span><b>Ranked</b><span class="hint">Games count for Elo, board and stats</span></span>
		<input type="checkbox" class="switch" bind:checked={ranked} />
	</label>

	<div class="sec">Draw preview</div>
	{#if !result.ok}
		<p class="hint">{result.error}</p>
	{:else if schedule}
		<div class="draw">
			{#each previewRounds as r (r)}
				{#each schedule.games.filter((g) => g.round === r) as g (g.slot)}
					<div class="m">
						<b
							>R{r}{schedule.games.filter((x) => x.round === r).length > 1
								? ` · T${g.slot + 1}`
								: ''}</b
						>
						<span>{side(g.sideA)}</span><span class="vs">VS</span><span>{side(g.sideB)}</span>
					</div>
				{/each}
				{#if sitting(r).length}
					<div class="out">Sits out: {sitting(r).map(label).join(', ')}</div>
				{/if}
			{/each}
		</div>
	{/if}

	{#if form?.error}<p class="err">{form.error}</p>{/if}
	<div class="actions">
		<button
			type="button"
			class="btn secondary"
			onclick={() => (seed = randomSeed())}
			disabled={!result.ok}>🎲 Reshuffle</button
		>
		<button class="btn" type="submit" disabled={!result.ok || !name.trim() || submitting}>
			{#if submitting}<span class="spin" aria-hidden="true"></span> Starting…{:else}Start tournament{/if}
		</button>
	</div>
</form>

<style>
	.backlink {
		color: var(--teal);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 700;
	}
	form {
		display: grid;
		gap: 0.6rem;
		margin-top: 1rem;
	}
	.sec {
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		margin-top: 0.6rem;
	}
	.count {
		text-transform: none;
		font-weight: 600;
	}
	.text,
	.num {
		padding: 0.45rem 0.6rem;
		border-radius: 9px;
		border: 2px solid var(--line-card);
		background: var(--bg);
		font: inherit;
		font-weight: 700;
		color: var(--ink);
	}
	.num {
		width: 4.5rem;
		text-align: center;
	}
	.styles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 0.5rem;
	}
	.style {
		text-align: left;
		border: 2px solid var(--line-card);
		border-radius: 12px;
		padding: 0.55rem;
		background: var(--surface);
		font: inherit;
		font-size: 0.8rem;
		color: var(--ink);
		cursor: pointer;
	}
	.style b {
		display: block;
		font-size: 0.88rem;
	}
	.style.on {
		border-color: var(--teal);
		box-shadow: 0 0 0 2px var(--teal) inset;
	}
	.players {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.pl {
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		border: 2px solid var(--line-card);
		background: var(--surface);
		font: inherit;
		font-weight: 700;
		font-size: 0.85rem;
		color: var(--ink);
		cursor: pointer;
	}
	.pl.on {
		border-color: var(--teal);
		background: #d6efe9;
	}
	.field {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-top: 0.4rem;
	}
	.hint {
		display: block;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.switch {
		appearance: none;
		width: 42px;
		height: 24px;
		border-radius: 999px;
		background: var(--surface-2);
		position: relative;
		cursor: pointer;
		flex: none;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s ease;
	}
	.switch:checked {
		background: var(--teal);
	}
	.switch:checked::after {
		transform: translateX(18px);
	}
	.draw {
		background: var(--surface);
		border: 2px solid var(--line-card);
		border-radius: 12px;
		padding: 0.4rem 0.7rem;
		font-size: 0.82rem;
		max-height: 22rem;
		overflow: auto;
	}
	.m {
		display: grid;
		grid-template-columns: 3.4rem 1fr auto 1fr;
		gap: 0.4rem;
		align-items: center;
		padding: 0.3rem 0;
		border-top: 1px dashed var(--line-card);
	}
	.m:first-child {
		border-top: 0;
	}
	.vs {
		color: var(--muted);
		font-weight: 800;
		font-size: 0.7rem;
	}
	.out {
		color: var(--muted);
		font-size: 0.75rem;
		padding: 0 0 0.3rem 3.8rem;
	}
	.err {
		color: var(--danger);
		font-weight: 700;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
</style>
