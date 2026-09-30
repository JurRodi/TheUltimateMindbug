<script lang="ts">
	import { enhance } from '$app/forms';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { CREATURES, creatureFor } from '$lib/creatures';
	import { track } from '$lib/enhance';
	import AvatarTile from '$lib/components/AvatarTile.svelte';
	import AvatarPicker from '$lib/components/AvatarPicker.svelte';
	let { data, form } = $props();
	let avatar = $state(CREATURES[0]);

	let addingSubmitting = $state(false);
	let togglingId = $state<number | null>(null);

	// Which players have their manage panel expanded. Several may be open at once
	// so opening one player never discards an unsaved edit in another.
	const open = new SvelteSet<number>();
	const toggleManage = (id: number) => (open.has(id) ? open.delete(id) : open.add(id));

	// Per-player avatar picked in the manage panel. Defaults to the player's
	// current avatar (or their deterministic fallback) until the admin changes it.
	const chosen = new SvelteMap<number, string>();
	const avatarFor = (p: { id: number; avatar: string | null }) =>
		chosen.get(p.id) ?? creatureFor(p.id, p.avatar);
</script>

<h1>Players</h1>

<form
	method="POST"
	action="?/add"
	use:enhance={track({
		pending: (on) => (addingSubmitting = on),
		success: 'Player added ✓'
	})}
	class="card add"
>
	<div class="head">
		<AvatarTile emoji={avatar} size={37} />
		<span class="grow">New player</span>
	</div>
	<div class="inputs">
		<input name="name" placeholder="Player name" />
		<input name="email" type="email" placeholder="Google email (optional)" autocomplete="off" />
	</div>
	<input type="hidden" name="avatar" value={avatar} />
	<AvatarPicker bind:value={avatar} />
	<div class="actions">
		<button class="btn" type="submit" disabled={addingSubmitting}>
			{#if addingSubmitting}<span class="spin" aria-hidden="true"></span> Adding…{:else}Add player{/if}
		</button>
	</div>
</form>
{#if form?.error}<p class="err">{form.error}</p>{/if}

<ul class="roster">
	{#each data.players as p (p.id)}
		<li class="card" class:open={open.has(p.id)}>
			<button
				type="button"
				class="prow"
				aria-expanded={open.has(p.id)}
				onclick={() => toggleManage(p.id)}
			>
				<AvatarTile emoji={creatureFor(p.id, p.avatar)} size={37} />
				<span class="name" class:inactive={!p.isActive}>{p.name}</span>
				<span class="tags">
					{#if !p.isActive}<span class="chip off">Inactive</span>{/if}
					{#if p.isAdmin}<span class="chip admin">Admin</span>{/if}
					{#if p.email}<span class="chip live">Login set</span>{/if}
				</span>
				<span class="chev" aria-hidden="true">▾</span>
			</button>

			{#if open.has(p.id)}
				<div class="panel">
					<form
						id="profile-{p.id}"
						method="POST"
						action="?/saveProfile"
						use:enhance={track({
							success: 'Profile updated ✓',
							// Keep the typed name/email in the inputs after a save.
							reset: false
						})}
						class="fieldrow"
					>
						<input type="hidden" name="id" value={p.id} />
						<input type="hidden" name="avatar" value={avatarFor(p)} />

						<label for="name-{p.id}">Name</label>
						<input id="name-{p.id}" name="name" value={p.name} maxlength="40" />

						<AvatarPicker bind:value={() => avatarFor(p), (c) => chosen.set(p.id, c)} />

						<label for="email-{p.id}">Google login email</label>
						<input
							id="email-{p.id}"
							name="email"
							type="email"
							value={p.email ?? ''}
							placeholder="no login yet"
						/>
					</form>

					<div class="actions">
						<form
							method="POST"
							action="?/toggle"
							use:enhance={track({
								pending: (on) => (togglingId = on ? p.id : null),
								success: () => (p.isActive ? 'Player deactivated' : 'Player activated')
							})}
						>
							<input type="hidden" name="id" value={p.id} />
							<input type="hidden" name="active" value={(!p.isActive).toString()} />
							<button class="btn secondary" type="submit" disabled={togglingId === p.id}>
								{#if togglingId === p.id}<span class="spin" aria-hidden="true"
									></span>{:else}{p.isActive ? 'Deactivate' : 'Activate'}{/if}
							</button>
						</form>

						<form
							method="POST"
							action="?/setAdmin"
							use:enhance={track({
								success: () => (p.isAdmin ? 'Admin removed' : 'Admin granted')
							})}
						>
							<input type="hidden" name="id" value={p.id} />
							<input type="hidden" name="isAdmin" value={(!p.isAdmin).toString()} />
							<button class="btn secondary" type="submit">
								{p.isAdmin ? 'Revoke admin' : 'Make admin'}
							</button>
						</form>

						<button class="btn" type="submit" form="profile-{p.id}">Save</button>
					</div>
				</div>
			{/if}
		</li>
	{/each}
</ul>

<style>
	/* ---- Add form: inputs stack (and never overflow), controls get own rows ---- */
	.add {
		display: grid;
		gap: 0.7rem;
		margin: 1rem 0;
	}
	.add .head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.add .head .grow {
		flex: 1;
		min-width: 0;
		font-family: var(--display);
		font-weight: 800;
		color: var(--muted);
	}
	.inputs {
		display: grid;
		gap: 0.5rem;
	}
	@media (min-width: 460px) {
		.inputs {
			grid-template-columns: 1fr 1fr;
		}
	}
	.add input {
		width: 100%;
		min-width: 0;
		padding: 0.7rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
	}
	.add .actions {
		display: flex;
		justify-content: flex-end;
	}

	/* ---- Roster: the whole row is a toggle for its manage panel ---- */
	.roster {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}
	li {
		padding: 0;
		overflow: hidden;
	}
	.prow {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.7rem 0.9rem;
		border: none;
		background: transparent;
		text-align: left;
		font-family: var(--body);
		color: var(--ink);
		cursor: pointer;
		transition: background 0.14s ease;
	}
	.prow:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	.name {
		font-size: 1rem;
		font-weight: 700;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name.inactive {
		opacity: 0.5;
		text-decoration: line-through;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.chip.admin {
		background: #f3e2b0;
		color: #9a6d12;
	}
	.chip.off {
		background: #f0ddd6;
		color: var(--down);
	}
	.chip.live {
		background: #d7efe0;
		color: var(--up);
	}
	.chev {
		margin-left: auto;
		flex: none;
		color: var(--muted);
		font-size: 0.9rem;
		transition: transform 0.15s ease;
	}
	li.open .chev {
		transform: rotate(180deg);
	}

	.panel {
		border-top: 1px dashed var(--line-card);
		margin: 0 0.9rem;
		padding: 0.8rem 0 0.9rem;
		display: grid;
		gap: 0.8rem;
	}
	.fieldrow {
		display: grid;
		gap: 0.4rem;
	}
	.panel label {
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	/* min-width:0 lets the inputs shrink inside the tile instead of forcing it
	   wider; max-width keeps them (and the aligned Save button) a sensible size. */
	.panel input:not([type='hidden']) {
		width: 100%;
		max-width: 26rem;
		min-width: 0;
		padding: 0.55rem 0.6rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
	}
	/* Deactivate + Make-admin + Save share one right-aligned row, Save last (the
	   rightmost, primary action). Each toggle is its own <form>; Save submits the
	   profile form via form=. */
	.panel .actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.err {
		color: var(--danger);
	}
</style>
