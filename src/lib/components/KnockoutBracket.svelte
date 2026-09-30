<script lang="ts">
	import PlayerChip from './PlayerChip.svelte';

	type Member = { id: number; name: string; emoji: string };
	type Match = {
		id: number;
		round: number;
		slot: number;
		team1: Member[];
		team2: Member[];
		team1Label: string | null;
		team2Label: string | null;
		winnerSide: 'A' | 'B' | null;
	};
	let { matches, roundNames }: { matches: Match[]; roundNames: string[] } = $props();
	const inRound = (r: number) =>
		matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
</script>

<div class="card br" style="--cols: {roundNames.length}">
	{#each roundNames as name, i (name)}
		<div class="col">
			<div class="colh">{name}</div>
			<div class="games">
				{#each inRound(i + 1) as m (m.id)}
					<div class="bm">
						{#each [{ side: 'A', members: m.team1, label: m.team1Label }, { side: 'B', members: m.team2, label: m.team2Label }] as t (t.side)}
							<div
								class="slot"
								class:w={m.winnerSide === t.side}
								class:l={m.winnerSide !== null && m.winnerSide !== t.side}
							>
								{#if t.label}<span class="tbd">{t.label}</span
									>{:else}{#each t.members as p (p.id)}<PlayerChip {...p} />{/each}{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.br {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(9rem, 1fr));
		gap: 0.6rem;
		overflow-x: auto;
	}
	.col {
		display: flex;
		flex-direction: column;
	}
	.colh {
		font-size: 0.68rem;
		text-transform: uppercase;
		font-weight: 800;
		color: var(--muted);
		text-align: center;
		margin-bottom: 0.4rem;
	}
	.games {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 0.6rem;
		flex: 1;
	}
	.bm {
		background: var(--surface);
		border: 2px solid var(--line-card);
		border-radius: 10px;
		font-size: 0.76rem;
		overflow: hidden;
	}
	.slot {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
		padding: 0.3rem 0.4rem;
	}
	.slot + .slot {
		border-top: 1px solid var(--line-card);
	}
	/* Same winner tint as the shared Matchup look. */
	.slot.w {
		background: rgba(15, 143, 106, 0.14);
	}
	.slot.l {
		opacity: 0.6;
	}
	.tbd {
		color: var(--muted);
		font-style: italic;
	}
</style>
