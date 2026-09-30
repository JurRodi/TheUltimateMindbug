<script lang="ts">
	import { resolve } from '$app/paths';
	import ListRow from '$lib/components/ListRow.svelte';
	import AvatarTile from '$lib/components/AvatarTile.svelte';
	import { fullDate, STYLE_LABEL } from '$lib/format';
	let { data } = $props();
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
			<ListRow
				href={resolve('/tournaments/[id]', { id: String(t.id) })}
				dim={t.status === 'abandoned'}
			>
				{#snippet icon()}
					<AvatarTile
						emoji={t.status === 'live' ? '⏳' : t.status === 'finished' ? '🏆' : '✖️'}
						size={44}
					/>
				{/snippet}
				<span class="name">{t.name}</span>
				<span class="meta"
					>{fullDate(t.createdAt)} · {STYLE_LABEL[t.style]} · {t.format} · {t.playerCount} players</span
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
				{#snippet aside()}
					<span class="chips">
						{#if t.status === 'live'}<span class="chip live">● LIVE</span>{/if}
						<span class="chip" class:unr={!t.ranked}>{t.ranked ? 'Ranked' : 'Unranked'}</span>
					</span>
				{/snippet}
			</ListRow>
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
	.name,
	.win {
		font-weight: 800;
	}
	.meta {
		font-size: 0.8rem;
		color: var(--muted);
		font-weight: 600;
	}
	.list {
		margin-top: 1rem;
	}
	.chips {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: flex-end;
	}
	.chip.unr {
		background: #cbb98f;
		color: #4a3d24;
	}
</style>
