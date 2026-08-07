<script lang="ts">
	import { page } from '$app/state';
	const links = [
		{ href: '/', label: 'Board', icon: '📊' },
		{ href: '/players', label: 'Players', icon: '👾' },
		{ href: '/log', label: 'Log', icon: '➕' }
	];
	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<nav>
	<div class="brand"><span class="bug">🐛</span> Mindbug</div>
	{#each links as l}
		<a href={l.href} class:on={isActive(l.href)}>
			<span class="icon">{l.icon}</span><span class="label">{l.label}</span>
		</a>
	{/each}
</nav>

<style>
	nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 10;
		display: flex;
		justify-content: space-around;
		align-items: center;
		background: rgba(0, 0, 0, 0.32);
		backdrop-filter: blur(8px);
		border-top: 1px solid rgba(0, 0, 0, 0.3);
		padding: 0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom));
	}
	.brand {
		display: none;
	}
	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--onmat-muted);
		text-decoration: none;
		padding: 0.3rem 0.6rem;
		border-radius: 10px;
	}
	a .icon {
		font-size: 1.05rem;
	}
	a.on {
		color: #2a2014;
		background: var(--gold-grad);
	}

	@media (min-width: 820px) {
		nav {
			position: sticky;
			top: 0;
			bottom: auto;
			height: 100vh;
			flex-direction: column;
			justify-content: flex-start;
			align-items: stretch;
			gap: 0.35rem;
			width: 100%;
			padding: 1.2rem 0.9rem;
			border-top: 0;
			border-right: 1px solid rgba(0, 0, 0, 0.3);
			backdrop-filter: none;
		}
		.brand {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-family: var(--display);
			font-weight: 800;
			font-size: 1.1rem;
			color: var(--gold-2);
			margin-bottom: 1rem;
		}
		.brand .bug {
			font-size: 1.35rem;
		}
		a {
			flex-direction: row;
			justify-content: flex-start;
			gap: 0.55rem;
			font-size: 0.85rem;
			text-transform: none;
			letter-spacing: 0;
			padding: 0.58rem 0.7rem;
		}
	}
</style>
