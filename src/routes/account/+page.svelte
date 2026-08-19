<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import { CREATURES, creatureFor } from '$lib/creatures';
	import Toast from '$lib/components/Toast.svelte';
	import NotificationToggle from '$lib/components/NotificationToggle.svelte';

	let { data, form } = $props();

	// `picked` holds an explicit user choice; until they pick, the selection
	// falls back to the stored avatar. Blank means "no explicit avatar" (the
	// deterministic fallback creature). The preview resolves to the same emoji
	// the rest of the app shows.
	let picked = $state<string | null>(null);
	const selected = $derived(picked ?? data.player.avatar ?? '');
	const preview = $derived(selected || creatureFor(data.player.id, data.player.avatar));

	let saving = $state(false);
	let signingOut = $state(false);
	let toast = $state<string | null>(null);

	const pct = (w: number) => `${Math.round(w * 100)}%`;
	const streakText = (s: number) => (s > 0 ? `W${s} 🔥` : s < 0 ? `L${-s}` : '–');

	async function signOut() {
		signingOut = true;
		await authClient.signOut();
		goto(resolve('/'), { invalidateAll: true });
	}
</script>

<h1>Account</h1>

{#if toast}<Toast message={toast} ondone={() => (toast = null)} />{/if}

<div class="card hero">
	<div class="avatar">{preview}</div>
	<div class="hero-body">
		<div class="hero-top">
			<h1>{data.player.name}</h1>
			{#if data.rank}<span class="rank">#{data.rank} of {data.rankTotal}</span>{/if}
		</div>
		{#if data.email}<span class="email">✉️ {data.email}</span>{/if}
		<div class="statrow">
			<div class="stat">
				<span class="n">{data.rating ?? '—'}</span><span class="l">Rating</span>
			</div>
			<div class="stat">
				<span class="n">{data.stats.wins}–{data.stats.losses}</span><span class="l">Record</span>
			</div>
			<div class="stat">
				<span class="n">{pct(data.stats.winRate)}</span><span class="l">Win rate</span>
			</div>
			{#if data.stats.games > 0}
				<span class="chip {data.stats.streak > 0 ? 'w' : data.stats.streak < 0 ? 'l' : 'none'}"
					>{streakText(data.stats.streak)}</span
				>
			{/if}
		</div>
	</div>
</div>

<h2>Edit profile</h2>
<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			saving = false;
			if (result.type === 'success') toast = 'Profile saved ✓';
		};
	}}
	class="card edit"
>
	<label class="field">
		<span class="lbl">Display name</span>
		<input name="name" type="text" value={data.player.name} maxlength="40" autocomplete="off" />
	</label>

	<span class="lbl">Avatar</span>
	<div class="previewrow">
		<div class="pv">{preview}</div>
		<span class="hint">Pick a creature — this shows up next to your name everywhere.</span>
	</div>
	<input type="hidden" name="avatar" value={selected} />
	<div class="picker">
		{#each CREATURES as c (c)}
			<button type="button" class:on={selected === c} onclick={() => (picked = c)}>{c}</button>
		{/each}
	</div>

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

<div class="signout-row">
	<span class="hint"
		>Signed in with Google{#if data.email}
			· {data.email}{/if}</span
	>
	<button class="btn danger" onclick={signOut} disabled={signingOut}>
		{#if signingOut}<span class="spin" aria-hidden="true"></span> Signing out…{:else}Sign out{/if}
	</button>
</div>

<style>
	h2 {
		font-size: 1.05rem;
		margin: 1.5rem 0 0.7rem;
	}

	/* Hero — mirrors the public player page's hero card. */
	.hero {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-top: 0.6rem;
	}
	.avatar {
		width: 88px;
		height: 88px;
		flex: 0 0 auto;
		border-radius: 14px;
		display: grid;
		place-items: center;
		font-size: 3rem;
		border: 2px solid var(--edge);
		background: linear-gradient(155deg, #edca66, #cf9a2c);
		box-shadow: inset 0 2px 6px rgba(255, 255, 255, 0.35);
	}
	.hero-body {
		min-width: 0;
		flex: 1;
	}
	.hero-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.hero h1 {
		margin: 0;
		color: var(--ink);
	}
	.rank {
		color: var(--muted);
		font-weight: 800;
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
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
	.statrow {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		margin-top: 0.7rem;
		align-items: center;
	}
	.stat {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.stat .n {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.15rem;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.stat .l {
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		font-weight: 800;
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
	.previewrow .pv {
		width: 52px;
		height: 52px;
		flex: none;
		border-radius: 12px;
		display: grid;
		place-items: center;
		font-size: 1.9rem;
		border: 2px solid var(--edge);
		background: linear-gradient(155deg, #edca66, #cf9a2c);
	}
	.hint {
		font-size: 0.8rem;
		color: var(--muted);
		font-weight: 600;
	}
	.picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.picker button {
		font-size: 1.3rem;
		width: 2.6rem;
		height: 2.6rem;
		display: grid;
		place-items: center;
		border: 1.5px solid var(--surface-2);
		background: var(--bg);
		border-radius: 10px;
		cursor: pointer;
		padding: 0;
		transition:
			border-color 0.15s ease,
			transform 0.1s ease;
	}
	.picker button:not(.on):hover {
		border-color: var(--edge);
		transform: translateY(-1px);
	}
	.picker button.on {
		border-color: var(--edge);
		background: var(--gold-grad);
		box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.4);
	}
	.formactions {
		margin-top: 1rem;
	}
	.err {
		color: var(--danger);
		font-weight: 700;
		margin: 0.6rem 0 0;
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
	.btn.danger {
		background: #f6ddd4;
		color: #b63d28;
	}
	.btn.danger:hover {
		filter: none;
		background: #f0cabd;
	}
</style>
