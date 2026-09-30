<script lang="ts">
	import { resolve } from '$app/paths';
	let { data } = $props();

	const STYLE = { rotating: '🔀 Rotating teams', fixed: '🛡️ Fixed teams', knockout: '🥊 Knockout' };
	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<div class="head">
	<h1>🏆 Tournaments</h1>
	{#if data.canCreate}<a class="btn" href={resolve('/tournaments/new')}>+ New tournament</a>{/if}
</div>

{#if data.tournaments.length === 0}
	<p class="card">No tournaments yet.</p>
{:else}
	<div class="card list">
		{#each data.tournaments as t (t.id)}
			<a
				class="row"
				class:abandoned={t.status === 'abandoned'}
				href={resolve('/tournaments/[id]', { id: String(t.id) })}
			>
				<span class="trophy"
					>{t.status === 'live' ? '⏳' : t.status === 'finished' ? '🏆' : '✖️'}</span
				>
				<span class="mid">
					<span class="name">{t.name}</span>
					<span class="meta"
						>{fmtDate(t.createdAt)} · {STYLE[t.style]} · {t.format} · {t.playerCount} players</span
					>
					{#if t.status === 'live'}
						<span class="meta">
							{#if t.progress.round}Round {t.progress.round} of {t.rounds} ·
							{/if}{t.progress.played}/{t.progress.total} games played
						</span>
					{:else if t.status === 'finished'}
						<span class="win">
							🥇
							{#each t.winners as w, i (i)}
								{#if i > 0}<span class="meta"> / </span>{/if}
								{w.members.map((m) => `${m.emoji} ${m.name}`).join(' + ')}
								{#if t.style === 'rotating'}<span class="meta">({w.points} pts)</span>{/if}
							{/each}
						</span>
					{:else}
						<span class="meta">Abandoned</span>
					{/if}
				</span>
				<span class="chips">
					{#if t.status === 'live'}<span class="chip live">● LIVE</span>{/if}
					<span class="chip" class:unr={!t.ranked}>{t.ranked ? 'Ranked' : 'Unranked'}</span>
				</span>
			</a>
		{/each}
	</div>
{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.btn {
		text-decoration: none;
	}
	/* Rows run edge to edge so the hover tint fills the card width (same
	   hover as the Players tab roster rows). */
	.list {
		margin-top: 1rem;
		padding: 0;
		overflow: hidden;
	}
	.row {
		display: grid;
		grid-template-columns: 44px 1fr auto;
		gap: 0.7rem;
		align-items: center;
		padding: 0.7rem 0.9rem;
		color: var(--ink);
		text-decoration: none;
		border-top: 1px solid var(--line-card);
		transition: background 0.14s ease;
	}
	.row:first-child {
		border-top: 0;
	}
	.row:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	.row.abandoned {
		opacity: 0.55;
	}
	.trophy {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		font-size: 1.3rem;
		background: linear-gradient(155deg, #edca66, #cf9a2c);
		border: 2px solid var(--edge);
	}
	.mid {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}
	.name,
	.win {
		font-weight: 800;
	}
	.meta {
		font-size: 0.8rem;
		color: var(--muted);
		font-weight: 600;
	}
	.chips {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: flex-end;
	}
	.chip.live {
		background: var(--coral);
		color: #fff;
	}
	.chip.unr {
		background: #cbb98f;
		color: #4a3d24;
	}
</style>
