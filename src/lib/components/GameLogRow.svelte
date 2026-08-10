<script lang="ts">
	import { resolve } from '$app/paths';

	type Member = { id: number; name: string; emoji: string };
	let {
		won,
		format,
		playedAt,
		us,
		opponents,
		youId = null,
		valueText,
		valueUp
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
	} = $props();

	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
</script>

<div class="card row">
	<div class="res {won ? 'w' : 'l'}">{won ? 'W' : 'L'}</div>
	<div class="mid">
		<div class="line1">
			<span class="fmt">{format}</span><span class="date">{fmtDate(playedAt)}</span>
		</div>
		<div class="teams">
			<!-- The winning team is highlighted: green when "us" won, red around the
			     opponents when "us" lost. -->
			<span class="teamgrp {won ? 'win good' : ''}">
				{#each us as p (p.id)}
					<a
						class="pchip"
						class:you={youId !== null && p.id === youId}
						href={resolve('/players/[id]', { id: String(p.id) })}
						><span class="em">{p.emoji}</span>{p.name}</a
					>
				{/each}
			</span>
			<span class="vs">vs</span>
			<span class="teamgrp {won ? '' : 'win bad'}">
				{#each opponents as p (p.id)}
					<a class="pchip" href={resolve('/players/[id]', { id: String(p.id) })}
						><span class="em">{p.emoji}</span>{p.name}</a
					>
				{/each}
			</span>
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
	.fmt {
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		padding: 0.08rem 0.4rem;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--muted);
	}
	.date {
		font-size: 0.72rem;
		color: var(--muted);
		font-weight: 700;
	}
	.teams {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}
	.teamgrp {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		flex-wrap: wrap;
		padding: 0.2rem 0.3rem;
		border-radius: 9px;
		border: 1.5px solid transparent;
	}
	.teamgrp.win.good {
		background: rgba(15, 143, 106, 0.14);
		border-color: rgba(15, 143, 106, 0.5);
	}
	.teamgrp.win.bad {
		background: rgba(214, 74, 55, 0.13);
		border-color: rgba(214, 74, 55, 0.5);
	}
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
	}
	.pchip .em {
		font-size: 0.9rem;
		line-height: 1;
	}
	.pchip.you {
		background: var(--gold-2);
		border-color: var(--gold);
		font-weight: 800;
	}
	.vs {
		font-family: var(--display);
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--muted);
		letter-spacing: 0.05em;
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
