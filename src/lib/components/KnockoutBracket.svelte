<script lang="ts">
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
	const names = (ms: Member[]) => ms.map((m) => `${m.emoji} ${m.name}`).join(' + ');
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
						<div class:w={m.winnerSide === 'A'} class:tbd={!!m.team1Label}>
							{m.team1Label ?? names(m.team1)}
						</div>
						<div class:w={m.winnerSide === 'B'} class:tbd={!!m.team2Label}>
							{m.team2Label ?? names(m.team2)}
						</div>
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
	.bm div {
		padding: 0.25rem 0.4rem;
	}
	.bm div + div {
		border-top: 1px solid var(--line-card);
	}
	.w {
		background: #cfeee2;
		font-weight: 800;
	}
	.tbd {
		color: var(--muted);
		font-style: italic;
	}
</style>
