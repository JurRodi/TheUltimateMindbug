<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { creatureFor } from '$lib/creatures';
	const board = { href: '/', label: 'Board', icon: '📊' } as const;
	const mvp = { href: '/mvp', label: 'MVP', icon: '⭐' } as const;
	const players = { href: '/players', label: 'Players', icon: '👾' } as const;
	const log = { href: '/log', label: 'Log', icon: '➕' } as const;
	const games = { href: '/games', label: 'Games', icon: '🎲' } as const;
	// Players and Games are admin-only management pages; both are requireAdmin-gated
	// server-side, so hiding them here is convenience, not the security boundary.
	// (Public player detail still lives at /players/[id], linked from the board.)
	const links = $derived(page.data.isAdmin ? [board, mvp, players, log, games] : [board, mvp, log]);
	// Match on a path boundary, not a bare prefix: a bare `startsWith('/log')`
	// also matches `/login`, so the Log tab lit up on the sign-in page. Active =
	// the exact route or a sub-path of it (e.g. Players stays active on /players/3).
	const isActive = (href: string) =>
		href === '/'
			? page.url.pathname === '/'
			: page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	const me = $derived(page.data.me as { id: number; name: string; avatar: string | null } | null);
</script>

<nav>
	<div class="brand"><span class="bug">🐛</span> Mindbug</div>
	{#each links as l (l.href)}
		<a href={resolve(l.href)} class:on={isActive(l.href)}>
			<span class="icon">{l.icon}</span><span class="label">{l.label}</span>
		</a>
	{/each}
	{#if me}
		<a class="acct" href={resolve('/account')} class:on={isActive('/account')}>
			<span class="icon crea">{creatureFor(me.id, me.avatar)}</span><span class="label"
				>Account</span
			>
		</a>
	{:else}
		<a class="signin" href={resolve('/login')} class:on={isActive('/login')}>
			<span class="icon">🔑</span><span class="label">Sign in</span>
		</a>
	{/if}
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
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	a .icon {
		font-size: 1.05rem;
	}
	a:not(.on):hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--onmat);
	}
	a.on {
		color: #2a2014;
		background: var(--gold-grad);
	}
	/* .acct and .signin are ordinary nav anchors — the base `a` rules above
	   (layout, hover, and the gold `.on` active state) style them. */

	/* The Account item shows the player's creature in a gold avatar card, like
	   the hero/player-list avatars. The solid edge border keeps it defined both
	   on the dark mat (inactive) and on the gold active background. */
	.acct .crea {
		display: grid;
		place-items: center;
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 8px;
		font-size: 0.95rem;
		background: linear-gradient(155deg, #edca66, #cf9a2c);
		border: 1.5px solid var(--edge);
		box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.4);
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
			gap: 0.65rem;
			font-size: 0.95rem;
			text-transform: none;
			letter-spacing: 0;
			padding: 0.68rem 0.8rem;
		}
		a .icon {
			font-size: 1.2rem;
		}
		.acct .crea {
			width: 2rem;
			height: 2rem;
			border-radius: 9px;
			font-size: 1.1rem;
		}
		/* Pin the account affordance (Account / Sign in) to the bottom of the
		   full-height sidebar, set apart from the main nav links. */
		.acct,
		.signin {
			margin-top: auto;
		}
	}
</style>
