<script lang="ts">
	import { navigating } from '$app/state';
</script>

{#if navigating.to}
	<div class="navprog" role="progressbar" aria-label="Loading"></div>
{/if}

<style>
	.navprog {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		z-index: 100;
		background: linear-gradient(90deg, transparent, var(--gold-2), var(--teal), transparent);
		background-size: 42% 100%;
		background-repeat: no-repeat;
		animation: navslide 1s ease-in-out infinite;
	}
	@keyframes navslide {
		0% {
			background-position: -42% 0;
		}
		100% {
			background-position: 142% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.navprog {
			animation: none;
			background: var(--gold-2);
			opacity: 0.85;
		}
	}
</style>
