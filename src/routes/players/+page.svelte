<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { CREATURES, creatureFor } from '$lib/creatures';
	let { data, form } = $props();
	let avatar = $state(CREATURES[0]);
</script>

<h1>Players</h1>

{#if data.canEdit}
	<form method="POST" action="?/add" use:enhance class="card add">
		<div class="row1">
			<span class="preview">{avatar}</span>
			<input name="name" placeholder="New player name" />
			<button class="btn" type="submit">Add</button>
		</div>
		<input type="hidden" name="avatar" value={avatar} />
		<div class="picker">
			{#each CREATURES as c (c)}
				<button type="button" class:on={avatar === c} onclick={() => (avatar = c)}>{c}</button>
			{/each}
		</div>
	</form>
	{#if form?.error}<p class="err">{form.error}</p>{/if}
{:else}
	<p class="pill">
		Viewing only — <a href={resolve('/login?redirectTo=/players')}>unlock</a> to edit.
	</p>
{/if}

<ul>
	{#each data.players as p (p.id)}
		<li class="card">
			<a href={resolve('/players/[id]', { id: String(p.id) })} class:inactive={!p.isActive}>
				<span class="crea">{creatureFor(p.id, p.avatar)}</span>{p.name}
			</a>
			{#if data.canEdit}
				<form method="POST" action="?/toggle" use:enhance>
					<input type="hidden" name="id" value={p.id} />
					<input type="hidden" name="active" value={(!p.isActive).toString()} />
					<button class="btn secondary" type="submit"
						>{p.isActive ? 'Deactivate' : 'Activate'}</button
					>
				</form>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.add {
		display: grid;
		gap: 0.6rem;
		margin: 1rem 0;
	}
	.row1 {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.preview {
		font-size: 1.4rem;
		width: 2.2rem;
		height: 2.2rem;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: #e7d6ad;
		flex: none;
	}
	.row1 input {
		flex: 1;
		padding: 0.7rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
	}
	.picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.picker button {
		font-size: 1.1rem;
		border: 1.5px solid var(--surface-2);
		background: var(--bg);
		border-radius: 9px;
		padding: 0.2rem 0.35rem;
		cursor: pointer;
	}
	.picker button.on {
		border-color: var(--teal);
		background: #d7efe0;
	}
	ul {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	li a {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ink);
		text-decoration: none;
		font-weight: 700;
	}
	.crea {
		font-size: 1.2rem;
	}
	a.inactive {
		opacity: 0.5;
		text-decoration: line-through;
	}
	.err {
		color: var(--danger);
	}
</style>
