<script lang="ts">
	import { enhance } from '$app/forms';
	import PlayerSelect from '$lib/components/PlayerSelect.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import SwitchField from '$lib/components/SwitchField.svelte';
	import { track } from '$lib/enhance';
	let { data, form } = $props();

	let format = $state<'1v1' | '2v2' | '3v3'>('2v2');
	let size = $derived(format === '1v1' ? 1 : format === '2v2' ? 2 : 3);
	let winnerSide = $state<'A' | 'B'>('A');
	let ranked = $state(true);

	// Fixed-length backing arrays; only the first `size` slots are rendered/submitted.
	let sideA = $state<(number | null)[]>([null, null, null]);
	let sideB = $state<(number | null)[]>([null, null, null]);

	// Players already chosen in the visible slots — passed to every select so a
	// player can't be picked twice in one game.
	const chosen = $derived(
		new Set(
			[...sideA.slice(0, size), ...sideB.slice(0, size)].filter((v): v is number => v != null)
		)
	);

	const today = new Date().toISOString().slice(0, 10);
	let playedAt = $state(today);

	// Every visible slot on both sides must be filled before the game can be saved.
	const valid = $derived(
		sideA.slice(0, size).every((v) => v != null) && sideB.slice(0, size).every((v) => v != null)
	);
	let submitting = $state(false);
	const formats = [
		{ v: '1v1', l: '1v1' },
		{ v: '2v2', l: '2v2' },
		{ v: '3v3', l: '3v3' }
	] as const;
</script>

<h1>Log a game</h1>

<form method="POST" use:enhance={track({ pending: (on) => (submitting = on) })} class="card">
	<input type="hidden" name="format" value={format} />
	<input type="hidden" name="winnerSide" value={winnerSide} />
	<input type="hidden" name="ranked" value={String(ranked)} />

	<Segmented options={formats} bind:value={format} center />

	<div class="sides">
		<div class="side" class:winner={winnerSide === 'A'}>
			<div class="lbl">Side A <span class="ribbon">🏆 Winner</span></div>
			{#each Array(size).keys() as i (i)}
				<PlayerSelect players={data.players} name="sideA" bind:value={sideA[i]} exclude={chosen} />
			{/each}
			<button
				type="button"
				class="wonbtn"
				class:won={winnerSide === 'A'}
				onclick={() => (winnerSide = 'A')}>🏆 Side A won</button
			>
		</div>

		<div class="side" class:winner={winnerSide === 'B'}>
			<div class="lbl">Side B <span class="ribbon">🏆 Winner</span></div>
			{#each Array(size).keys() as i (i)}
				<PlayerSelect players={data.players} name="sideB" bind:value={sideB[i]} exclude={chosen} />
			{/each}
			<button
				type="button"
				class="wonbtn"
				class:won={winnerSide === 'B'}
				onclick={() => (winnerSide = 'B')}>🏆 Side B won</button
			>
		</div>
	</div>

	<SwitchField
		bind:checked={ranked}
		label="Ranked"
		hint="Off = casual game: logged, but no Elo or stats impact"
	/>

	<label class="datefield">
		<span class="dlbl"
			>Date played {#if playedAt === today}<span class="todaytag">Today</span>{/if}</span
		>
		<input type="date" name="playedAt" bind:value={playedAt} max={today} />
	</label>

	{#if form?.error}<p class="err">{form.error}</p>{/if}
	<button class="btn save" type="submit" disabled={!valid || submitting}>
		{#if submitting}<span class="spin" aria-hidden="true"></span> Saving…{:else}💾 Save game{/if}
	</button>
</form>

<style>
	form {
		display: grid;
		gap: 1.1rem;
		margin-top: 1rem;
	}
	.sides {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	@media (max-width: 520px) {
		.sides {
			grid-template-columns: 1fr;
		}
	}
	.side {
		position: relative;
		border: 2px solid var(--line-card);
		border-radius: var(--radius-sm);
		background: var(--surface);
		display: grid;
		gap: 0.5rem;
		padding: 0.8rem 0.7rem;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.side.winner {
		border-color: var(--gold);
		background: linear-gradient(180deg, rgba(224, 165, 42, 0.14), rgba(224, 165, 42, 0.04));
	}
	.lbl {
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.side.winner .lbl {
		color: #9a6b12;
	}
	.ribbon {
		display: none;
		margin-left: auto;
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		background: var(--gold);
		color: #3a2a08;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
	}
	.side.winner .ribbon {
		display: inline-block;
	}
	.wonbtn {
		margin-top: 0.15rem;
		width: 100%;
		cursor: pointer;
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.9rem;
		padding: 0.6rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--muted);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		transition: transform 0.08s;
	}
	.wonbtn:hover {
		border-color: var(--gold);
		color: var(--ink);
	}
	.wonbtn.won {
		border-color: transparent;
		color: #3a2a08;
		background: var(--gold-art);
		box-shadow: 0 3px 0 rgba(0, 0, 0, 0.22);
	}
	.wonbtn.won:active {
		transform: translateY(1px);
	}
	.datefield {
		display: grid;
		gap: 0.3rem;
	}
	.dlbl {
		font-weight: 800;
		color: var(--muted);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.todaytag {
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.62rem;
		font-weight: 800;
		background: #d7efe0;
		color: var(--up);
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
	}
	.datefield input {
		padding: 0.6rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
		font-family: var(--body);
		font-weight: 700;
	}
	.save {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		font-size: 1rem;
	}
	.err {
		color: var(--danger);
		margin: 0;
	}
</style>
