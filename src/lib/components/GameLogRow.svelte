<script lang="ts">
	import Matchup from './Matchup.svelte';
	import GameTags from './GameTags.svelte';

	type Member = { id: number; name: string; emoji: string };
	let {
		won,
		format,
		playedAt,
		us,
		opponents,
		youId = null,
		valueText,
		valueUp,
		ranked = true,
		tournament = null
	}: {
		won: boolean;
		format: string;
		playedAt: string;
		/** The viewing side (player's team, or the team on a team page). */
		us: Member[];
		opponents: Member[];
		/** When set, that member's chip is highlighted gold (the "you" on a player page). */
		youId?: number | null;
		/** Right-hand metric already formatted (e.g. "+12", "-3"). */
		valueText: string;
		valueUp: boolean;
		/** False = casual/unranked game: shows a badge. */
		ranked?: boolean;
		/** Set when the game belongs to a tournament: shows a link to it. */
		tournament?: { id: number; name: string; round: number } | null;
	} = $props();

	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
</script>

<div class="card row">
	<div class="res {won ? 'w' : 'l'}">{won ? 'W' : 'L'}</div>
	<div class="mid">
		<div class="line1">
			<GameTags {format} date={fmtDate(playedAt)} {ranked} {tournament} />
		</div>
		<!-- The winning team is highlighted: green when "us" won, red around the
		     opponents when "us" lost. -->
		<div class="mu">
			<Matchup teamA={us} teamB={opponents} winner={won ? 'A' : 'B'} perspective {youId} />
		</div>
	</div>
	<div class="val {valueUp ? 'up' : 'down'}">{valueText}</div>
</div>

<style>
	.row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.7rem;
		padding: 0.6rem 0.7rem;
	}
	.res {
		width: 30px;
		height: 30px;
		flex: 0 0 auto;
		border-radius: 9px;
		display: grid;
		place-items: center;
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.9rem;
	}
	.res.w {
		background: #d7efe0;
		color: var(--up);
	}
	.res.l {
		background: #f6ddd4;
		color: var(--down);
	}
	.mid {
		min-width: 0;
	}
	.line1 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.mu {
		margin-top: 0.3rem;
	}
	.val {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.val.up {
		color: var(--up);
	}
	.val.down {
		color: var(--down);
	}
</style>
