<script lang="ts">
	import { enhance } from '$app/forms';
	import Matchup from './Matchup.svelte';
	import PlayerChip from './PlayerChip.svelte';
	import { track } from '$lib/enhance';

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
		/** Toggles selection (also used by Cancel). */
		onselect: () => void;
	} = $props();

	const known = $derived(match.team1.length > 0 && match.team2.length > 0);
	const played = $derived(match.winnerSide !== null);
	// Tappable: an unplayed match with both teams (anyone signed in), or a
	// played one the viewer may change (creator/admin, knockout rule).
	const tappable = $derived(known && (played ? match.editable : canEnter));
	const open = $derived(selected && tappable);
	const sides = $derived([
		{ side: 'A' as const, n: 1, members: match.team1 },
		{ side: 'B' as const, n: 2, members: match.team2 }
	]);

	let busy = $state(false);
	// Done: collapse the card (an error keeps it open next to the banner).
	const submit = track({ pending: (on) => (busy = on), onSuccess: () => onselect() });
</script>

<div class="m" class:open>
	{#if open}
		<div class="tbl">
			{showTable ? `Table ${match.slot + 1} · ` : ''}{played ? 'Editing' : 'Result'}
		</div>
		<p class="ask">{played ? 'Change the winner' : 'Who won? Tap a team'}</p>
		<div class="pick" class:busy>
			{#each sides as s (s.side)}
				{@const cur = match.winnerSide === s.side}
				<form method="POST" action="?/result" use:enhance={submit}>
					<input type="hidden" name="gameId" value={match.id} />
					<input type="hidden" name="winner" value={s.side} />
					<button class="opt" class:cur disabled={busy || cur}>
						<small>{cur ? `🏆 Team ${s.n} · won` : `Team ${s.n}`}</small>
						<span class="chips">
							{#each s.members as p (p.id)}<PlayerChip {...p} link={false} />{/each}
						</span>
					</button>
				</form>
				{#if s.side === 'A'}<span class="vs">VS</span>{/if}
			{/each}
		</div>
		<div class="foot">
			{#if played}
				<form method="POST" action="?/clear" use:enhance={submit}>
					<input type="hidden" name="gameId" value={match.id} />
					<button class="btn secondary small" disabled={busy}>✏️ Clear result</button>
				</form>
			{/if}
			<button type="button" class="btn secondary small cancel" disabled={busy} onclick={onselect}
				>Cancel</button
			>
		</div>
	{:else}
		<button type="button" class="face" disabled={!tappable} onclick={onselect}>
			{#if showTable}<span class="tbl">Table {match.slot + 1}</span>{/if}
			<Matchup
				teamA={match.team1}
				teamB={match.team2}
				labelA={match.team1Label}
				labelB={match.team2Label}
				winner={match.winnerSide}
				fadeLoser
				link={false}
			/>
		</button>
	{/if}
</div>

<style>
	.m {
		background: var(--surface);
		border: 2px solid var(--line-card);
		border-radius: 12px;
		margin-bottom: 0.45rem;
		transition:
			box-shadow 0.15s ease,
			transform 0.15s ease;
	}
	.m.open {
		border-color: var(--edge);
		box-shadow: 0 3px 0 rgba(0, 0, 0, 0.12);
		transform: translateY(-1px);
		padding: 0.5rem;
	}
	.face {
		display: block;
		width: 100%;
		padding: 0.5rem;
		background: none;
		border: 0;
		border-radius: 10px;
		font: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		transition: background 0.14s ease;
	}
	.face:not(:disabled):hover {
		background: rgba(0, 0, 0, 0.04);
	}
	.face:disabled {
		cursor: default;
	}
	.tbl {
		display: block;
		font-size: 0.62rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
		margin-bottom: 0.3rem;
	}
	.ask {
		margin: 0 0 0.4rem;
		font-size: 0.78rem;
		font-weight: 800;
		color: var(--muted);
	}
	.pick {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 0.4rem;
		align-items: stretch;
	}
	.pick.busy {
		opacity: 0.6;
	}
	.pick form {
		display: flex;
	}
	.opt {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.3rem;
		padding: 0.45rem;
		border: 2px dashed var(--edge);
		border-radius: 11px;
		background: #fff9e8;
		font: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		transition:
			background 0.14s ease,
			border-color 0.14s ease;
	}
	.opt:not(:disabled):hover {
		border-style: solid;
		border-color: var(--up);
		background: #e9f6ef;
	}
	.opt:disabled {
		cursor: default;
	}
	.opt small {
		font-size: 0.62rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.opt.cur {
		border-style: solid;
		border-color: var(--up);
		background: #e1f3e9;
	}
	.opt.cur small {
		color: var(--up);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.vs {
		align-self: center;
		font-family: var(--display);
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--muted);
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}
	.cancel {
		margin-left: auto;
	}
	.btn.small {
		font-size: 0.78rem;
		padding: 0.4rem 0.8rem;
	}
</style>
