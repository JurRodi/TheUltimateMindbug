<script lang="ts">
	// Gold emoji frame used for player avatars, previews and list icons.
	let { emoji, size = 88 }: { emoji: string; size?: number } = $props();
	const radius = $derived(size >= 80 ? 14 : size >= 44 ? 12 : 9);
</script>

<div
	class="avt"
	class:thin={size < 44}
	style:--s="{size}px"
	style:--r="{radius}px"
	aria-hidden="true"
>
	{emoji}
</div>

<style>
	.avt {
		width: var(--s);
		height: var(--s);
		flex: none;
		border-radius: var(--r);
		display: grid;
		place-items: center;
		font-size: calc(var(--s) * 0.55);
		line-height: 1;
		border: 2px solid var(--edge);
		background: var(--gold-art);
		box-shadow: inset 0 2px 6px rgba(255, 255, 255, 0.35);
	}
	.avt.thin {
		border-width: 1.5px;
		box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.4);
	}
</style>
