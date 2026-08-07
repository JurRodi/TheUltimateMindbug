<script lang="ts">
	type Chip = { text: string; tone?: 'w' | 'l' | 'none' };
	let {
		rank,
		emoji,
		name,
		chips = [],
		power,
		powerLabel = 'RATING',
		href = null,
		king = false
	}: {
		rank: string | number;
		emoji: string;
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
	<div class="art" class:gold={king}>{emoji}</div>
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
