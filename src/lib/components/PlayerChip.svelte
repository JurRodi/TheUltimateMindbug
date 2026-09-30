<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		id,
		name,
		emoji,
		link = true,
		you = false
	}: {
		id: number;
		name: string;
		emoji: string;
		/** Link to the player page. Off inside other interactive elements (e.g. a button). */
		link?: boolean;
		/** Highlight gold (the viewed player on their own page). */
		you?: boolean;
	} = $props();
</script>

{#if link}
	<a class="pchip" class:you href={resolve('/players/[id]', { id: String(id) })}
		><span class="em">{emoji}</span>{name}</a
	>
{:else}
	<span class="pchip" class:you><span class="em">{emoji}</span>{name}</span>
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
		padding: 0.1rem 0.5rem 0.1rem 0.28rem;
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
</style>
