<script lang="ts">
	let { message, ondone }: { message: string; ondone?: () => void } = $props();

	// Auto-dismiss after a short beat.
	$effect(() => {
		const t = setTimeout(() => ondone?.(), 2600);
		return () => clearTimeout(t);
	});
</script>

<div class="toast" role="status" aria-live="polite">{message}</div>

<style>
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(1.2rem + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		z-index: 120;
		background: var(--go-grad);
		color: #fff;
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.9rem;
		padding: 0.6rem 1rem;
		border-radius: 999px;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
		animation: toastpop 0.25s ease;
	}
	@keyframes toastpop {
		from {
			transform: translate(-50%, 10px);
			opacity: 0;
		}
		to {
			transform: translate(-50%, 0);
			opacity: 1;
		}
	}
	/* Sit above the fixed bottom nav on phones (sidebar nav kicks in at 820px). */
	@media (max-width: 819px) {
		.toast {
			bottom: calc(4.6rem + env(safe-area-inset-bottom));
		}
	}
</style>
