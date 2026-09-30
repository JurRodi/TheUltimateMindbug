<script lang="ts">
	import { CREATURES } from '$lib/creatures';
	let { value = $bindable() }: { value: string } = $props();
</script>

<div class="picker">
	{#each CREATURES as c (c)}
		<button type="button" class:on={value === c} onclick={() => (value = c)}>{c}</button>
	{/each}
</div>

<style>
	.picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	button {
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
	button:not(.on):hover {
		border-color: var(--edge);
		transform: translateY(-1px);
	}
	button.on {
		border-color: var(--edge);
		background: var(--gold-grad);
		box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.4);
	}
</style>
