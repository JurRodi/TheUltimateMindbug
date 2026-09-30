<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		id,
		name,
		emoji,
		link = true,
		you = false,
		label = null,
		checked = false
	}: {
		id: number;
		name: string;
		emoji: string;
		/** Link to the player page. Off inside other interactive elements (e.g. a button). */
		link?: boolean;
		/** Highlight gold (the viewed player on their own page). */
		you?: boolean;
		/** Text shown instead of the name (e.g. "You"). */
		label?: string | null;
		/** Green ✓ badge (e.g. "has voted"). */
		checked?: boolean;
	} = $props();
</script>

{#snippet body()}
	<span class="em">{emoji}</span>{label ?? name}
	{#if checked}<span class="check" title="Voted">✓</span>{/if}
{/snippet}

<!-- The viewed player's own chip never links: we're already on their page. -->
{#if link && !you}
	<a class="pchip" class:you class:checked href={resolve('/players/[id]', { id: String(id) })}
		>{@render body()}</a
	>
{:else}
	<span class="pchip" class:you class:checked>{@render body()}</span>
{/if}

<style>
	.pchip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0.26rem 0.6rem 0.26rem 0.45rem;
		border: 1.5px solid transparent;
		white-space: nowrap;
		transition:
			transform 0.12s ease,
			filter 0.12s ease;
	}
	a.pchip:hover {
		transform: translateY(-1px);
		filter: brightness(0.97);
	}
	.em {
		font-size: 0.9rem;
		line-height: 1;
	}
	.pchip.you {
		background: var(--gold-2);
		border-color: var(--gold);
		font-weight: 800;
	}
	.pchip.checked {
		border-color: var(--up);
		padding-right: 0.32rem;
	}
	.check {
		display: inline-grid;
		place-items: center;
		width: 15px;
		height: 15px;
		border-radius: 50%;
		background: var(--up);
		color: #fff;
		font-size: 10px;
		font-weight: 900;
		line-height: 1;
		margin-left: 0.05rem;
	}
</style>
