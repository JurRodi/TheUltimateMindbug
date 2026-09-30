<script lang="ts">
	import { resolve } from '$app/paths';
	import { medal, pct } from '$lib/format';
	type Member = { id: number; name: string; emoji: string };
	type Row = {
		key: string;
		members: Member[];
		position: number | null;
		played: number;
		wins: number;
		losses: number;
		points: number;
		winRate: number;
	};
	let { rows, style }: { rows: Row[]; style: 'rotating' | 'fixed' } = $props();
</script>

<div class="card tbl">
	<table>
		<thead>
			<tr>
				<th>#</th><th class="l">{style === 'rotating' ? 'Player' : 'Team'}</th><th>P</th><th>W</th
				><th>L</th>
				<th>{style === 'rotating' ? 'Pts' : 'Win%'}</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.key)}
				<tr>
					<td class="pos">{medal(r.position)}</td>
					<td class="l">
						{#each r.members as m, i (m.id)}{#if i > 0}&nbsp;+&nbsp;{/if}<a
								href={resolve('/players/[id]', { id: String(m.id) })}>{m.emoji} {m.name}</a
							>{/each}
					</td>
					<td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td>
					<td class="pts">{style === 'rotating' ? r.points : pct(r.winRate)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if style === 'rotating'}<p class="note">Tiebreak: win% → head-to-head</p>{/if}
</div>

<style>
	.tbl {
		padding: 0.5rem 0.7rem;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.86rem;
	}
	th {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
		text-align: right;
		padding: 0.25rem 0.4rem;
	}
	td {
		padding: 0.4rem;
		border-top: 1px solid var(--line-card);
		text-align: right;
	}
	.l {
		text-align: left;
		font-weight: 800;
	}
	.l a {
		color: var(--ink);
		text-decoration: none;
	}
	.pos {
		text-align: center;
		font-weight: 800;
		width: 2rem;
	}
	.pts {
		font-weight: 900;
		color: var(--up);
	}
	.note {
		margin: 0.4rem 0 0;
		font-size: 0.75rem;
		color: var(--muted);
	}
</style>
