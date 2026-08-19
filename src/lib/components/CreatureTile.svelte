<script lang="ts">
	type Chip = { text: string; tone?: 'w' | 'l' | 'none' | 'mvp' };
	let {
		rank,
		emoji,
		avatars = null,
		name,
		chips = [],
		power,
		powerLabel = 'RATING',
		href = null,
		king = false
	}: {
		rank: string | number;
		emoji?: string;
		/** Team line-up: renders an overlapping avatar cluster instead of `emoji`. */
		avatars?: string[] | null;
		name: string;
		chips?: Chip[];
		power: string | number;
		powerLabel?: string;
		href?: string | null;
		king?: boolean;
	} = $props();
</script>

{#snippet inner()}
	<span class="rankchip">{typeof rank === 'number' ? `#${rank}` : rank}</span>
	{#if avatars}
		<div class="art team">
			<div class="tcluster">
				{#each avatars as a, ai (ai)}<span class="av">{a}</span>{/each}
			</div>
		</div>
	{:else}
		<div class="art" class:gold={king}>{emoji}</div>
	{/if}
	<div class="body">
		<div class="tname">{name}</div>
		<div class="chips">
			{#each chips as c, ci (ci)}<span class="chip {c.tone ?? ''}">{c.text}</span>{/each}
		</div>
	</div>
	<div class="power"><b>{power}</b><small>{powerLabel}</small></div>
{/snippet}

{#if href}
	<!-- prettier-ignore -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `href` is caller-supplied (already built via resolve() at the call site, e.g. /players/[id]); this generic tile component just forwards an opaque string prop, so the rule can't see it was resolved. -->
	<a class="tile" class:king {href}>{@render inner()}</a>
{:else}
	<div class="tile" class:king>{@render inner()}</div>
{/if}

<style>
	.tile {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--card);
		color: var(--ink);
		border: 2px solid var(--edge);
		border-radius: 14px;
		padding: 7px;
		box-shadow: 0 5px 0 rgba(0, 0, 0, 0.28);
		position: relative;
		text-decoration: none;
	}
	.tile.king {
		border-color: var(--gold);
	}
	.rankchip {
		position: absolute;
		top: -8px;
		left: -8px;
		min-width: 22px;
		height: 22px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--edge);
		color: #2a1c06;
		font-size: 0.66rem;
		font-weight: 800;
		display: grid;
		place-items: center;
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.25);
	}
	.tile.king .rankchip {
		background: var(--gold);
	}
	.art {
		width: 48px;
		height: 58px;
		flex: none;
		font-size: 1.7rem;
	}
	/* Team line-up: overlapping avatar cluster inside the green art card.
	   Fixed width fits a 3-player cluster; a 2-player line-up centres in it,
	   so 2v2 and 3v3 team cards are the same width. */
	.art.team {
		width: 84px;
		padding: 0;
	}
	.tcluster {
		display: flex;
		align-items: center;
	}
	.tcluster .av {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: #fbf4e2;
		border: 1.5px solid var(--edge);
		display: grid;
		place-items: center;
		font-size: 1.05rem;
		margin-left: -8px;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
	}
	.tcluster .av:first-child {
		margin-left: 0;
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
	}
	.tname {
		font-weight: 800;
		font-size: 0.98rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.28rem;
	}
	.power {
		text-align: center;
		min-width: 3.4rem;
	}
	.power b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.4rem;
		font-variant-numeric: tabular-nums;
		display: block;
		line-height: 1;
	}
	.power small {
		font-size: 0.52rem;
		letter-spacing: 0.1em;
		color: var(--muted);
		font-weight: 800;
	}
</style>
