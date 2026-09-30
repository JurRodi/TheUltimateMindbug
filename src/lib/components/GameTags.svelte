<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		format,
		date,
		ranked = true,
		tournament = null
	}: {
		format: string;
		/** Already formatted for the page (pages use different date styles). */
		date: string;
		/** False = casual/unranked game: shows a badge. */
		ranked?: boolean;
		/** Set when the game belongs to a tournament: shows a link to it. */
		tournament?: { id: number; name: string; round: number } | null;
	} = $props();
</script>

<span class="fmt">{format}</span><span class="date">{date}</span>
{#if !ranked}<span class="fmt unr">Unranked</span>{/if}
{#if tournament}
	<a class="tlink" href={resolve('/tournaments/[id]', { id: String(tournament.id) })}
		>🏆 {tournament.name} · R{tournament.round}</a
	>
{/if}

<style>
	.fmt {
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		padding: 0.08rem 0.4rem;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--muted);
	}
	.fmt.unr {
		background: #cbb98f;
		color: #4a3d24;
	}
	.date {
		font-size: 0.72rem;
		color: var(--muted);
		font-weight: 700;
	}
	.tlink {
		font-size: 0.72rem;
		font-weight: 800;
		color: var(--teal);
		text-decoration: none;
	}
	.tlink:hover {
		text-decoration: underline;
	}
</style>
