import { mount, unmount, flushSync } from 'svelte';
import { afterEach, expect, test } from 'vitest';
import Podium from './Podium.svelte';

type Item = {
	rank: 1 | 2 | 3;
	emoji: string;
	name: string;
	power: string | number;
	powerLabel?: string;
	chips?: { text: string; tone?: 'w' | 'l' | 'none' }[];
	href?: string | null;
};

const item = (rank: 1 | 2 | 3, name: string, power: number): Item => ({
	rank,
	name,
	power,
	emoji: '🐛',
	powerLabel: 'RATING',
	chips: [],
	href: null
});

let cleanup: (() => void) | null = null;
afterEach(() => {
	cleanup?.();
	cleanup = null;
});

// Regression: switching the format tab feeds the Podium a brand-new `items`
// prop. The component must re-render the new top 3 — an earlier version
// computed the podium order into a plain `const` (evaluated once at mount),
// so it went stale on every tab switch.
test('re-renders the top 3 when the items prop changes', () => {
	const props = $state<{ items: Item[] }>({
		items: [item(1, 'Alice', 1200), item(2, 'Bob', 1100), item(3, 'Cara', 1000)]
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(Podium, { target, props });
	cleanup = () => {
		unmount(app);
		target.remove();
	};

	flushSync();
	expect(target.textContent).toContain('Alice');
	expect(target.textContent).toContain('1200');

	// Simulate a format-tab switch: entirely different players and ratings.
	props.items = [item(1, 'Xander', 1500), item(2, 'Yuki', 1400), item(3, 'Zed', 1300)];
	flushSync();

	expect(target.textContent).toContain('Xander');
	expect(target.textContent).toContain('1500');
	expect(target.textContent).not.toContain('Alice');
});
