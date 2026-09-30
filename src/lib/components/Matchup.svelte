<script lang="ts">
	import PlayerChip from './PlayerChip.svelte';

	type Member = { id: number; name: string; emoji: string };
	let {
		teamA,
		teamB,
		winner = null,
		labelA = null,
		labelB = null,
		perspective = false,
		fadeLoser = false,
		link = true,
		youId = null,
		youLabel = null,
		checked = [],
		highlightA = false,
		connector = 'vs'
	}: {
		teamA: Member[];
		teamB: Member[];
		winner?: 'A' | 'B' | null;
		/** Shown instead of chips when a side isn't known yet (e.g. "Winner of Semi-finals M1"). */
		labelA?: string | null;
		labelB?: string | null;
		/** Team A is the viewer's side: its win shows green, its loss shows red around team B. */
		perspective?: boolean;
		/** Dim the losing team. */
		fadeLoser?: boolean;
		link?: boolean;
		youId?: number | null;
		/** Shown instead of the `youId` player's name (e.g. "You"). */
		youLabel?: string | null;
		/** Player ids that get a ✓ badge. */
		checked?: number[];
		/** Always tint team A green (the viewer's own side), whoever won. */
		highlightA?: boolean;
		/** Word between the teams, e.g. "def." / "lost to". */
		connector?: string;
	} = $props();

	const tone = (side: 'A' | 'B') => {
		if (highlightA) return side === 'A' ? 'win good' : '';
		if (winner !== side) return fadeLoser && winner ? 'lose' : '';
		return perspective && side === 'B' ? 'win bad' : 'win good';
	};
</script>

{#snippet team(members: Member[], label: string | null, cls: string)}
	<span class="teamgrp {cls}">
		{#if label}
			<span class="tbd">{label}</span>
		{:else}
			{#each members as p (p.id)}
				{@const you = youId !== null && p.id === youId}
				<PlayerChip
					{...p}
					{link}
					{you}
					label={you ? youLabel : null}
					checked={checked.includes(p.id)}
				/>
			{/each}
		{/if}
	</span>
{/snippet}

<div class="teams">
	{@render team(teamA, labelA, tone('A'))}
	<span class="vs">{connector}</span>
	{@render team(teamB, labelB, tone('B'))}
</div>

<style>
	.teams {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	/* On phones, stack the teams so "vs" sits between them rather than trailing
	   the first team when the row wraps. */
	@media (max-width: 560px) {
		.teams {
			flex-direction: column;
			align-items: flex-start;
			flex-wrap: nowrap;
			/* Shrink the column to the widest team group so the centered "vs"
			   lines up over the chips, not the full-width grid cell. */
			width: fit-content;
		}
		.teams .vs {
			align-self: center;
		}
	}
	.teamgrp {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		flex-wrap: wrap;
		padding: 0.2rem 0.3rem;
		border-radius: 9px;
		border: 1.5px solid transparent;
	}
	.teamgrp.win.good {
		background: rgba(15, 143, 106, 0.14);
		border-color: rgba(15, 143, 106, 0.5);
	}
	.teamgrp.win.bad {
		background: rgba(214, 74, 55, 0.13);
		border-color: rgba(214, 74, 55, 0.5);
	}
	.teamgrp.lose {
		opacity: 0.6;
	}
	.tbd {
		font-size: 0.74rem;
		font-style: italic;
		color: var(--muted);
	}
	.vs {
		font-family: var(--display);
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--muted);
		letter-spacing: 0.05em;
	}
</style>
