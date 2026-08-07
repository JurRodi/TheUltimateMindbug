<script lang="ts">
	type Chip = { text: string; tone?: 'w' | 'l' | 'none' };
	type Item = {
		rank: 1 | 2 | 3;
		emoji: string;
		name: string;
		power: string | number;
		powerLabel?: string;
		chips?: Chip[];
		href?: string | null;
	};
	let { items }: { items: Item[] } = $props();
	const byRank = (r: number) => items.find((i) => i.rank === r);
	// Visual order: 2nd, 1st (centre), 3rd.
	const order = [byRank(2), byRank(1), byRank(3)].filter(Boolean) as Item[];
	const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
	const pos = (r: number) => (r === 1 ? 'p1' : r === 2 ? 'p2' : 'p3');
</script>

<div class="podium">
	{#each order as it (it.rank)}
		<!-- prettier-ignore -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `href` is caller-supplied (e.g. /players/[id]), a route that doesn't exist in this branch yet, so it can't be wrapped in resolve() here; this generic podium component just forwards the prop. -->
		<a class="bigcard {pos(it.rank)}" href={it.href ?? undefined}>
			<span class="medal">{medal(it.rank)}</span>
			<div class="bart" class:gold={it.rank === 1}>{it.emoji}</div>
			<div class="bn">{it.name}</div>
			<div class="bp">{it.power}<small>{it.powerLabel ?? 'RATING'}</small></div>
			<div class="chips">
				{#each it.chips ?? [] as c, ci (ci)}<span class="chip {c.tone ?? ''}">{c.text}</span>{/each}
			</div>
		</a>
	{/each}
</div>

<style>
	.podium {
		display: grid;
		grid-template-columns: 1fr 1.18fr 1fr;
		gap: 0.6rem;
		align-items: end;
		margin-bottom: 0.7rem;
	}
	.bigcard {
		background: var(--card);
		color: var(--ink);
		border: 2px solid var(--edge);
		border-radius: 14px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.22rem;
		box-shadow: 0 5px 0 rgba(0, 0, 0, 0.28);
		text-align: center;
		text-decoration: none;
	}
	.medal {
		font-size: 1.3rem;
		line-height: 1;
	}
	.bart {
		width: 100%;
		border-radius: 9px;
		display: grid;
		place-items: center;
		background: linear-gradient(155deg, #31b7a9, #0e7a74);
		border: 1.5px solid var(--edge);
	}
	.bart.gold {
		background: linear-gradient(155deg, #edca66, #cf9a2c);
	}
	.bn {
		font-weight: 800;
		font-size: 0.9rem;
	}
	.bp {
		font-family: var(--display);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1.05;
	}
	.bp small {
		display: block;
		font-size: 0.5rem;
		letter-spacing: 0.1em;
		color: var(--muted);
		font-weight: 800;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.28rem;
	}
	.p1 {
		border-color: var(--gold);
		transform: translateY(-10px);
	}
	.p1 .bart {
		height: 92px;
		font-size: 2.4rem;
	}
	.p1 .bp {
		font-size: 1.6rem;
	}
	.p2 .bart {
		height: 78px;
		font-size: 2rem;
	}
	.p2 .bp {
		font-size: 1.35rem;
	}
	.p3 .bart {
		height: 64px;
		font-size: 1.7rem;
	}
	.p3 .bp {
		font-size: 1.2rem;
	}
</style>
