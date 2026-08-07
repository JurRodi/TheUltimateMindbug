<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	let format = $state<'2v2' | '3v3'>('2v2');
	let size = $derived(format === '2v2' ? 2 : 3);
	let winnerSide = $state<'A' | 'B'>('A');
</script>

<h1>Log a game</h1>

<form method="POST" use:enhance class="card">
	<input type="hidden" name="format" value={format} />
	<input type="hidden" name="winnerSide" value={winnerSide} />

	<div class="seg">
		<button type="button" class:on={format === '2v2'} onclick={() => (format = '2v2')}>2v2</button>
		<button type="button" class:on={format === '3v3'} onclick={() => (format = '3v3')}>3v3</button>
	</div>

	<div class="sides">
		<fieldset class:winner={winnerSide === 'A'}>
			<legend>Side A</legend>
			{#each Array(size).keys() as i (i)}
				<select name="sideA" required>
					<option value="">– player –</option>
					{#each data.players as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</select>
			{/each}
			<button type="button" class="btn secondary" onclick={() => (winnerSide = 'A')}>A won</button>
		</fieldset>

		<fieldset class:winner={winnerSide === 'B'}>
			<legend>Side B</legend>
			{#each Array(size).keys() as i (i)}
				<select name="sideB" required>
					<option value="">– player –</option>
					{#each data.players as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</select>
			{/each}
			<button type="button" class="btn secondary" onclick={() => (winnerSide = 'B')}>B won</button>
		</fieldset>
	</div>

	<label>Date <input type="date" name="playedAt" /></label>
	{#if form?.error}<p class="err">{form.error}</p>{/if}
	<button class="btn" type="submit">Save game</button>
</form>

<style>
	form {
		display: grid;
		gap: 1rem;
		margin-top: 1rem;
	}
	.seg {
		display: flex;
		gap: 0.25rem;
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0.25rem;
		width: fit-content;
	}
	.seg button {
		border: none;
		background: transparent;
		color: var(--muted);
		font-family: var(--display);
		padding: 0.4rem 1rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--accent);
		color: #06231a;
	}
	.sides {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	fieldset {
		border: 2px solid var(--surface-2);
		border-radius: var(--radius-sm);
		display: grid;
		gap: 0.5rem;
	}
	fieldset.winner {
		border-color: var(--accent);
	}
	select,
	input[type='date'] {
		padding: 0.6rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
	}
	.err {
		color: var(--danger);
		margin: 0;
	}
</style>
