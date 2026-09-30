<script lang="ts">
	let { href, label }: { href: string; label: string } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolve()d href -->
<a class="backlink" {href}>← {label}</a>

<style>
	.backlink {
		color: var(--teal);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 700;
	}
	.backlink:hover {
		text-decoration: underline;
	}
</style>
