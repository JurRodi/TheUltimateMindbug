<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<h1>Enter the crew password</h1>
<p class="muted">You only need this to log games or manage players.</p>

<form method="POST" use:enhance class="card">
	<input
		type="password"
		name="password"
		placeholder="Shared password"
		autocomplete="current-password"
	/>
	{#if form?.error}<p class="err">{form.error}</p>{/if}
	<button class="btn" type="submit">Unlock</button>
</form>

<style>
	form {
		display: grid;
		gap: 0.8rem;
		margin-top: 1rem;
	}
	input {
		padding: 0.8rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
		font-size: 1rem;
	}
	.muted {
		color: var(--muted);
	}
	.err {
		color: var(--danger);
		margin: 0;
	}
</style>
