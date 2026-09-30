<script lang="ts">
	// Label + hint on the left, iOS-style switch on the right.
	let {
		checked = $bindable(false),
		label,
		hint = ''
	}: { checked?: boolean; label: string; hint?: string } = $props();
</script>

<label class="field">
	<span>
		<b>{label}</b>{#if hint}<span class="hint">{hint}</span>{/if}
	</span>
	<input type="checkbox" class="switch" bind:checked />
</label>

<style>
	.field {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.hint {
		display: block;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.switch {
		appearance: none;
		width: 42px;
		height: 24px;
		border-radius: 999px;
		background: var(--surface-2);
		position: relative;
		cursor: pointer;
		flex: none;
		transition: background 0.15s ease;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s ease;
	}
	.switch:checked {
		background: var(--teal);
	}
	.switch:checked::after {
		transform: translateX(18px);
	}
</style>
