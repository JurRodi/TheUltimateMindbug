<script lang="ts">
	type Chip = { text: string; tone?: 'w' | 'l' | 'none' | 'mvp' };
	type Member = { emoji: string; name: string };
	type Item = {
		rank: 1 | 2 | 3;
		/** Single avatar (players). Ignored when `members` is set. */
		emoji?: string;
		/** Single name (players) or a fallback joined name. Ignored when `members` is set. */
		name: string;
		/** Team line-up: renders an avatar cluster + member names instead of `emoji`/`name`. */
		members?: Member[];
		power: string | number;
		powerLabel?: string;
		chips?: Chip[];
		href?: string | null;
	};
	let { items }: { items: Item[] } = $props();
	const byRank = (r: number) => items.find((i) => i.rank === r);
	// Visual order: 2nd, 1st (centre), 3rd. Must be `$derived`: the `items` prop
	// changes on every format/range tab switch, and the podium has to re-render
	// the new top 3 rather than keep the values captured at mount.
	const order = $derived([byRank(2), byRank(1), byRank(3)].filter(Boolean) as Item[]);
	const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
	const pos = (r: number) => (r === 1 ? 'p1' : r === 2 ? 'p2' : 'p3');
</script>

<div class="podium">
	{#each order as it (it.rank)}
		<!-- prettier-ignore -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `href` is caller-supplied (already built via resolve() at the call site, e.g. /players/[id]); this generic podium component just forwards an opaque string prop, so the rule can't see it was resolved. -->
		<a class="bigcard {pos(it.rank)}" href={it.href ?? undefined}>
			<span class="medal">{medal(it.rank)}</span>
			<div class="bart" class:gold={it.rank === 1}>
				{#if it.members}
					<div class="cluster">
						{#each it.members as m (m.name)}<span class="av">{m.emoji}</span>{/each}
					</div>
				{:else}
					{it.emoji}
				{/if}
			</div>
			{#if it.members}
				<div class="bn team">
					{#each it.members as m, mi (m.name)}<span class="mname">{m.name}</span
						>{#if mi < it.members.length - 1}<span class="plus"> + </span>{/if}{/each}
				</div>
			{:else}
				<div class="bn">{it.name}</div>
			{/if}
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
		/* Grow to fill whatever height the name + stats leave in the fixed-height
		   card (below), so a wrapped name shrinks the bar rather than growing the
		   card — keeping the podium tier intact regardless of team size. */
		flex: 1;
		min-height: 32px;
	}
	.bart.gold {
		background: linear-gradient(155deg, #edca66, #cf9a2c);
	}
	.bn {
		font-weight: 800;
		font-size: 0.9rem;
	}
	/* Team line-up: overlapping avatar cluster inside the bart. */
	.cluster {
		display: flex;
		justify-content: center;
	}
	.cluster .av {
		border-radius: 50%;
		background: #fbf4e2;
		border: 1.5px solid var(--edge);
		display: grid;
		place-items: center;
		margin-left: -8px;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
	}
	.cluster .av:first-child {
		margin-left: 0;
	}
	.p1 .cluster .av {
		width: 50px;
		height: 50px;
		font-size: 1.7rem;
	}
	.p2 .cluster .av {
		width: 43px;
		height: 43px;
		font-size: 1.45rem;
	}
	.p3 .cluster .av {
		width: 38px;
		height: 38px;
		font-size: 1.25rem;
	}
	.bn.team {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0 0.15rem;
	}
	/* Phones: stack member names and shrink avatars so line-ups fit the columns.
	   The podium tier itself (fixed heights + flex bar) is defined in the base
	   rules above and applies at every width. */
	@media (max-width: 520px) {
		.bn.team {
			flex-direction: column;
			gap: 0;
			line-height: 1.2;
		}
		.bn.team .plus {
			display: none;
		}
		.cluster .av {
			margin-left: -6px;
		}
		.p1 .cluster .av {
			width: 30px;
			height: 30px;
			font-size: 1rem;
		}
		.p2 .cluster .av {
			width: 26px;
			height: 26px;
			font-size: 0.85rem;
		}
		.p3 .cluster .av {
			width: 24px;
			height: 24px;
			font-size: 0.8rem;
		}
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
	/* Fixed height per rank → a clear, consistent podium tier at every width,
	   independent of how many players a team has or how its name wraps; the bar
	   (flex: 1 above) absorbs the difference. Bottom-aligned via the `.podium`
	   grid so shorter cards drop to form the steps. */
	.p1 {
		border-color: var(--gold);
		height: 256px;
	}
	.p2 {
		height: 230px;
	}
	.p3 {
		height: 205px;
	}
	.p1 .bart {
		font-size: 2.4rem;
	}
	.p1 .bp {
		font-size: 1.6rem;
	}
	.p2 .bart {
		font-size: 2rem;
	}
	.p2 .bp {
		font-size: 1.35rem;
	}
	.p3 .bart {
		font-size: 1.7rem;
	}
	.p3 .bp {
		font-size: 1.2rem;
	}
</style>
