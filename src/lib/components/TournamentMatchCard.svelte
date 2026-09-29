<script lang="ts">
	import { enhance } from '$app/forms';
	type Member = { id: number; name: string; emoji: string };
	type Match = {
		id: number;
		slot: number;
		team1: Member[];
		team2: Member[];
		team1Label: string | null;
		team2Label: string | null;
		winnerSide: 'A' | 'B' | null;
		editable: boolean;
	};
	let {
		match,
		showTable,
		selected,
		canEnter,
		onselect
	}: {
		match: Match;
		/** Show "Table N" (more than one match in the round). */
		showTable: boolean;
		selected: boolean;
		/** Viewer may enter results for unplayed matches (signed in, live). */
		canEnter: boolean;
		onselect: () => void;
	} = $props();

	const known = $derived(match.team1.length > 0 && match.team2.length > 0);
	// Tappable: an unplayed match with both teams (anyone signed in), or a
	// played one the viewer may change (creator/admin, knockout rule).
	const tappable = $derived(known && (match.winnerSide === null ? canEnter : match.editable));
	const names = (ms: Member[]) => ms.map((m) => `${m.emoji} ${m.name}`).join(' + ');
	let busy = $state(false);
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<div class="m" class:sel={selected && tappable}>
	<button type="button" class="face" disabled={!tappable} onclick={onselect}>
		{#if showTable}<span class="tbl">Table {match.slot + 1}</span>{/if}
		<span class="side" class:w={match.winnerSide === 'A'} class:l={match.winnerSide === 'B'}>
			<span class="tn">Team 1</span>{match.team1Label ?? names(match.team1)}
		</span>
		<span class="vs">VS</span>
		<span class="side" class:w={match.winnerSide === 'B'} class:l={match.winnerSide === 'A'}>
			<span class="tn">Team 2</span>{match.team2Label ?? names(match.team2)}
		</span>
	</button>
	{#if selected && tappable}
		<div class="act">
			{#each ['A', 'B'] as const as side (side)}
				<form method="POST" action="?/result" use:enhance={submit}>
					<input type="hidden" name="gameId" value={match.id} />
					<input type="hidden" name="winner" value={side} />
					<button class="btn" class:current={match.winnerSide === side} disabled={busy}
						>Team {side === 'A' ? 1 : 2} won</button
					>
				</form>
			{/each}
			{#if match.winnerSide !== null}
				<form method="POST" action="?/clear" use:enhance={submit}>
					<input type="hidden" name="gameId" value={match.id} />
					<button class="btn secondary small" disabled={busy}>✏️ Clear result</button>
				</form>
			{/if}
		</div>
	{/if}
</div>

<style>
	.m {
		background: var(--surface);
		border: 2px solid var(--line-card);
		border-radius: 12px;
		margin-bottom: 0.45rem;
		transition: border-color 0.15s ease;
	}
	.m.sel {
		border-color: var(--teal);
		box-shadow: 0 0 0 2px var(--teal) inset;
	}
	.face {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 0.4rem;
		align-items: center;
		width: 100%;
		padding: 0.5rem;
		background: none;
		border: 0;
		font: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.face:disabled {
		cursor: default;
	}
	.tbl {
		grid-column: 1 / 4;
		font-size: 0.68rem;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--muted);
	}
	.side {
		padding: 0.25rem 0.4rem;
		border-radius: 8px;
		font-weight: 700;
		font-size: 0.84rem;
	}
	.side.w {
		background: #cfeee2;
		color: #0b5e45;
	}
	.side.l {
		opacity: 0.55;
	}
	.tn {
		display: block;
		font-size: 0.6rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.vs {
		color: var(--muted);
		font-weight: 800;
		font-size: 0.7rem;
	}
	.act {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
		padding: 0 0.5rem 0.55rem;
	}
	.btn.current {
		outline: 3px solid var(--gold);
	}
	.btn.small {
		font-size: 0.78rem;
	}
</style>
