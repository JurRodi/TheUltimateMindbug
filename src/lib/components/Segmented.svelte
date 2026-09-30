<script lang="ts" generics="V extends string">
	// Pill segmented control. `mat` uses the global .segset look (dark
	// background); `card` is the tan variant for use on cream cards.
	let {
		options,
		value = $bindable(),
		onselect,
		tone = 'card',
		center = false
	}: {
		options: readonly { v: V; l: string }[];
		value: V;
		onselect?: (v: V) => void;
		tone?: 'card' | 'mat';
		center?: boolean;
	} = $props();
</script>

<div class={tone === 'mat' ? 'segset' : 'seg'} class:center>
	{#each options as o (o.v)}
		<button
			type="button"
			class:on={value === o.v}
			onclick={() => {
				value = o.v;
				onselect?.(o.v);
			}}>{o.l}</button
		>
	{/each}
</div>

<style>
	.center {
		margin: 0 auto;
	}
	.seg {
		display: flex;
		gap: 0.25rem;
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0.25rem;
		width: fit-content;
	}
	.seg button {
		border: none;
		background: transparent;
		color: var(--muted);
		font-family: var(--display);
		font-weight: 800;
		padding: 0.45rem 1.3rem;
		border-radius: 999px;
		cursor: pointer;
		font-size: 0.9rem;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.seg button:not(.on):hover {
		background: rgba(0, 0, 0, 0.06);
		color: var(--ink);
	}
	.seg button.on {
		background: var(--teal);
		color: #fff;
	}
</style>
