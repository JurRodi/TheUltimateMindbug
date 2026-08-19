import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					// Server tests spin up a fresh pglite instance per `makeTestDb()` and
					// apply every Drizzle migration; under parallel load that can exceed
					// vitest's default 5s (e.g. the migration smoke test). Give them room.
					testTimeout: 20000,
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: './vite.config.ts',
				// Client project: mounts Svelte components in a DOM so we can assert
				// reactive behaviour (e.g. a component re-rendering when a prop
				// changes). `.svelte.test.ts` files get runes support from the
				// compiler, so tests can wrap props in `$state`. The browser
				// resolve condition makes `svelte` resolve to its client build.
				resolve: { conditions: ['browser'] },
				test: {
					name: 'client',
					environment: 'happy-dom',
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
