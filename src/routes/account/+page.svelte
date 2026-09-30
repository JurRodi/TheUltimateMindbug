<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import { creatureFor } from '$lib/creatures';
	import { FLAGS, FLAG_KEYS } from '$lib/flags';
	import { pct } from '$lib/format';
	import { track } from '$lib/enhance';
	import NotificationToggle from '$lib/components/NotificationToggle.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Stat from '$lib/components/Stat.svelte';
	import AvatarTile from '$lib/components/AvatarTile.svelte';
	import AvatarPicker from '$lib/components/AvatarPicker.svelte';
	import StreakChip from '$lib/components/StreakChip.svelte';

	let { data, form } = $props();

	// `picked` holds an explicit user choice; until they pick, the selection
	// falls back to the stored avatar. Blank means "no explicit avatar" (the
	// deterministic fallback creature). The preview resolves to the same emoji
	// the rest of the app shows.
	let picked = $state<string | null>(null);
	const selected = $derived(picked ?? data.player.avatar ?? '');
	const preview = $derived(selected || creatureFor(data.player.id, data.player.avatar));

	let saving = $state(false);
	// The key of the flag whose toggle is mid-request, or null when idle.
	let flagSaving = $state<string | null>(null);
	let signingOut = $state(false);

	async function signOut() {
		signingOut = true;
		await authClient.signOut();
		goto(resolve('/'), { invalidateAll: true });
	}
</script>

<h1>Account</h1>

<Hero title={data.player.name} rank={data.rank ? `#${data.rank} of ${data.rankTotal}` : null}>
	{#snippet art()}<AvatarTile emoji={preview} />{/snippet}
	{#snippet meta()}
		{#if data.email}<span class="email">✉️ {data.email}</span>{/if}
	{/snippet}
	{#snippet stats()}
		<Stat n={data.rating ?? '—'} label="Rating" />
		<Stat n="{data.stats.wins}–{data.stats.losses}" label="Record" />
		<Stat n={pct(data.stats.winRate)} label="Win rate" />
		{#if data.stats.games > 0}<StreakChip streak={data.stats.streak} />{/if}
	{/snippet}
</Hero>

<h2>Edit profile</h2>
<form
	method="POST"
	action="?/save"
	use:enhance={track({
		pending: (on) => (saving = on),
		success: 'Profile saved ✓',
		reset: false
	})}
	class="card edit"
>
	<label class="field">
		<span class="lbl">Display name</span>
		<input name="name" type="text" value={data.player.name} maxlength="40" autocomplete="off" />
	</label>

	<span class="lbl">Avatar</span>
	<div class="previewrow">
		<AvatarTile emoji={preview} size={52} />
		<span class="hint">Pick a creature — this shows up next to your name everywhere.</span>
	</div>
	<input type="hidden" name="avatar" value={selected} />
	<AvatarPicker bind:value={() => selected, (c) => (picked = c)} />

	<div class="formactions">
		<button class="btn" type="submit" disabled={saving}>
			{#if saving}<span class="spin" aria-hidden="true"></span> Saving…{:else}Save changes{/if}
		</button>
	</div>
	{#if form?.error}<p class="err">{form.error}</p>{/if}
</form>

<h2>Notifications</h2>
<div class="card">
	<NotificationToggle />
</div>

{#if data.isAdmin}
	<h2>Feature flags</h2>
	<div class="card flags">
		{#each FLAG_KEYS as key (key)}
			{@const on = data.flags[key]}
			<div class="flag">
				<div class="flag-text">
					<span class="flag-name">{FLAGS[key].label} {on ? '⭐' : ''}</span>
					<span class="hint">{FLAGS[key].description}</span>
				</div>
				<form
					method="POST"
					action="?/setFlag"
					use:enhance={track({
						pending: (busy) => (flagSaving = busy ? key : null),
						success: () => `${FLAGS[key].label} ${data.flags[key] ? 'disabled' : 'enabled'} ✓`,
						reset: false
					})}
				>
					<input type="hidden" name="key" value={key} />
					<input type="hidden" name="enabled" value={on ? 'false' : 'true'} />
					<button class="btn" class:danger-soft={on} type="submit" disabled={flagSaving === key}>
						{#if flagSaving === key}<span class="spin" aria-hidden="true"></span>{/if}
						{on ? 'Disable' : 'Enable'}
					</button>
				</form>
			</div>
		{/each}
	</div>
{/if}

<div class="signout-row">
	<span class="hint"
		>Signed in with Google{#if data.email}
			· {data.email}{/if}</span
	>
	<button class="btn danger-soft" onclick={signOut} disabled={signingOut}>
		{#if signingOut}<span class="spin" aria-hidden="true"></span> Signing out…{:else}Sign out{/if}
	</button>
</div>

<style>
	h2 {
		font-size: 1.05rem;
		margin: 1.5rem 0 0.7rem;
	}

	.email {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.5rem;
		font-size: 0.82rem;
		color: var(--muted);
		font-weight: 700;
		background: #ece0c0;
		border: 1px solid var(--line-card);
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Edit form */
	.edit {
		display: block;
	}
	.field {
		display: block;
		margin-bottom: 0.9rem;
	}
	.lbl {
		display: block;
		font-family: var(--display);
		font-size: 0.7rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		font-weight: 800;
		color: var(--muted);
		margin-bottom: 0.35rem;
	}
	.edit input[type='text'] {
		width: 100%;
		font-family: var(--body);
		font-size: 1rem;
		font-weight: 700;
		color: var(--ink);
		background: var(--bg);
		border: 2px solid var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.75rem;
	}
	.previewrow {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-bottom: 0.7rem;
	}
	.hint {
		font-size: 0.8rem;
		color: var(--muted);
		font-weight: 600;
	}
	.formactions {
		margin-top: 1rem;
	}
	.err {
		color: var(--danger);
		font-weight: 700;
		margin: 0.6rem 0 0;
	}

	/* Feature flags (admin only) */
	.flags {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.flag {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.flag-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.flag-name {
		font-family: var(--display);
		font-weight: 800;
		color: var(--ink);
	}

	/* Sign out, set apart at the foot of the page. */
	.signout-row {
		margin-top: 1.5rem;
		padding-top: 1.2rem;
		border-top: 1px solid rgba(255, 255, 255, 0.14);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.signout-row .hint {
		color: var(--onmat-muted);
	}
</style>
