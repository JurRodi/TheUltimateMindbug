<script lang="ts">
	import type { PushErrorKind } from '$lib/push-client';

	let { open = $bindable(false), kind = 'unknown' as PushErrorKind } = $props();

	let dlg = $state<HTMLDialogElement | null>(null);

	// Sync the native <dialog> with the `open` prop.
	$effect(() => {
		if (!dlg) return;
		if (open && !dlg.open) dlg.showModal();
		else if (!open && dlg.open) dlg.close();
	});

	const titles: Record<PushErrorKind, string> = {
		'push-service': "Your browser's notification service is off",
		permission: 'Notifications are blocked',
		unsupported: 'Notifications not available here',
		server: 'Please sign in again',
		unconfigured: 'Notifications not set up yet',
		unknown: "Couldn't turn on notifications"
	};

	// Whether to show the "on your computer" (OS) section.
	const showSystem = $derived(
		kind === 'push-service' || kind === 'permission' || kind === 'unknown'
	);
</script>

<dialog
	bind:this={dlg}
	onclose={() => (open = false)}
	onclick={(e) => e.target === dlg && (open = false)}
>
	<div class="body">
		<div class="head">
			<h3>{titles[kind]}</h3>
			<button class="x" aria-label="Close" onclick={() => (open = false)}>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.4"
					stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg
				>
			</button>
		</div>

		{#if kind === 'push-service'}
			<p>
				Your browser blocked the notification service, so it couldn't register. This is common in
				<b>Brave</b>, which turns off Google's push service by default.
			</p>
			<div class="step-title">In Brave</div>
			<ol>
				<li>Open a new tab and go to <code>brave://settings/privacy</code></li>
				<li>Turn on <b>“Use Google services for push messaging”</b></li>
				<li><b>Fully quit and reopen Brave</b> (this is required for it to take effect)</li>
			</ol>
			<p class="note">Other browsers (Chrome, Edge, Firefox) don't need this step.</p>
		{:else if kind === 'permission'}
			<p>Notifications are turned off for this site in your browser. Turn them back on:</p>
			<ol>
				<li>Click the site-info icon (the lock or sliders) at the left of the address bar</li>
				<li>Find <b>Notifications</b> and set it to <b>Allow</b></li>
				<li>Reload this page</li>
			</ol>
		{:else if kind === 'unsupported'}
			<p>
				This browser can't show web notifications. Try <b>Chrome</b>, <b>Edge</b>, or
				<b>Firefox</b> on a computer.
			</p>
			<p class="note">
				On iPhone/iPad, first add this app to your Home Screen (Share → “Add to Home Screen”), open
				it from there, then enable notifications.
			</p>
		{:else if kind === 'server'}
			<p>Your session may have expired. Please sign in again, then try enabling notifications.</p>
		{:else if kind === 'unconfigured'}
			<p>
				Push notifications aren't configured on the server yet. Please let the admin know — nothing
				you can fix on your side.
			</p>
		{:else}
			<p>Something went wrong turning on notifications. A couple of things to check:</p>
			<ol>
				<li>
					Make sure notifications are <b>allowed</b> for this site (site-info icon → Notifications)
				</li>
				<li>
					If you use <b>Brave</b>, enable “Use Google services for push messaging” and restart it
				</li>
			</ol>
		{/if}

		{#if showSystem}
			<div class="step-title">On your computer</div>
			<ol>
				<li>
					<b>Mac:</b> System Settings → <b>Notifications</b> → find your browser → turn on
					<b>“Allow notifications”</b>
				</li>
				<li>
					<b>Windows:</b> Settings → System → <b>Notifications</b> → make sure your browser is on
				</li>
			</ol>
			<p class="note">Then come back here and click <b>Enable notifications</b> again.</p>
		{/if}

		<div class="foot">
			<button class="btn" onclick={() => (open = false)}>Got it</button>
		</div>
	</div>
</dialog>

<style>
	dialog {
		width: min(92vw, 30rem);
		border: 2px solid var(--edge);
		border-radius: var(--radius);
		background: var(--card);
		color: var(--ink);
		padding: 0;
		box-shadow: 0 10px 0 rgba(0, 0, 0, 0.28);
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.5);
	}
	.body {
		padding: 1rem 1.1rem 1.1rem;
	}
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.6rem;
		margin-bottom: 0.5rem;
	}
	h3 {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.05rem;
		color: var(--ink);
		margin: 0;
	}
	.x {
		flex: none;
		border: none;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		padding: 0.15rem;
		line-height: 0;
	}
	.x:hover {
		color: var(--ink);
	}
	p {
		font-size: 0.88rem;
		line-height: 1.5;
		margin: 0.5rem 0;
	}
	.note {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.step-title {
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
		margin: 0.9rem 0 0.3rem;
	}
	ol {
		margin: 0.3rem 0;
		padding-left: 1.2rem;
		font-size: 0.88rem;
		line-height: 1.55;
	}
	li {
		margin: 0.2rem 0;
	}
	code {
		background: var(--surface-2);
		border-radius: 5px;
		padding: 0.05rem 0.3rem;
		font-size: 0.82rem;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		margin-top: 1rem;
	}
</style>
