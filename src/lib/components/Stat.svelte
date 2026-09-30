<script lang="ts">
	// Big number over a small uppercase label (hero stat rows).
	let {
		n,
		label,
		tone = null
	}: { n: string | number; label: string; tone?: 'up' | 'down' | null } = $props();
</script>

<div class="stat">
	<span class="n {tone ?? ''}">{n}</span><span class="l">{label}</span>
</div>

<style>
	.stat {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.n {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.15rem;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.n.up {
		color: var(--up);
	}
	.n.down {
		color: var(--down);
	}
	.l {
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		font-weight: 800;
	}
</style>
