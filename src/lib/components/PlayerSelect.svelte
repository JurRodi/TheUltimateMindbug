<script lang="ts">
	import { creatureFor } from '$lib/creatures';
	import type { Player } from '$lib/types';

	// Unique, SSR/hydration-stable id for the listbox (wires up aria-controls).
	const uid = $props.id();
	const listId = `player-list-${uid}`;

	let {
		players,
		name,
		value = $bindable<number | null>(null),
		exclude = new Set<number>(),
		placeholder = 'Search player…'
	}: {
		players: Pick<Player, 'id' | 'name' | 'avatar'>[];
		name: string;
		value?: number | null;
		exclude?: Set<number>;
		placeholder?: string;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let active = $state(0); // highlighted index within `matches`
	let root: HTMLDivElement;
	let inputEl = $state<HTMLInputElement | null>(null);

	const selected = $derived(players.find((p) => p.id === value) ?? null);
	const emoji = (p: Pick<Player, 'id' | 'avatar'>) => creatureFor(p.id, p.avatar);
	const disabled = (id: number) => exclude.has(id) && id !== value;

	// While the field just shows the current selection (nothing new typed), list
	// everyone; once the user edits the text, filter by it.
	const showingSelection = $derived(!!selected && query === selected.name);
	const matches = $derived(
		showingSelection
			? players
			: players.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
	);

	function openList() {
		open = true;
		active = Math.max(
			0,
			matches.findIndex((p) => p.id === value)
		);
		inputEl?.select();
	}
	function close() {
		open = false;
		query = selected ? selected.name : ''; // keep the text consistent with the value
	}
	function pick(id: number) {
		const p = players.find((x) => x.id === id);
		if (!p || disabled(id)) return;
		value = id;
		query = p.name;
		open = false;
	}
	function onInput() {
		open = true;
		active = 0;
		if (query.trim() === '') value = null;
	}
	function moveActive(step: number) {
		if (matches.length === 0) return;
		let i = active;
		for (let n = 0; n < matches.length; n++) {
			i = (i + step + matches.length) % matches.length;
			if (!disabled(matches[i].id)) break;
		}
		active = i;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open) openList();
			else moveActive(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			moveActive(-1);
		} else if (e.key === 'Enter') {
			if (open && matches[active]) {
				e.preventDefault();
				pick(matches[active].id);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	function onWindowPointer(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) close();
	}
</script>

<svelte:window onclick={onWindowPointer} />

<div class="combo" class:open bind:this={root}>
	<input type="hidden" {name} value={value ?? ''} />
	<div class="field">
		<span class="adorn">{showingSelection && selected ? emoji(selected) : '🔍'}</span>
		<input
			class="combo-input"
			type="text"
			{placeholder}
			role="combobox"
			aria-expanded={open}
			aria-controls={listId}
			aria-autocomplete="list"
			bind:value={query}
			bind:this={inputEl}
			onfocus={openList}
			oninput={onInput}
			onkeydown={onKey}
		/>
		<span class="chev">▼</span>
	</div>

	{#if open}
		<div class="combo-pop">
			<ul class="combo-list" role="listbox" id={listId}>
				{#each matches as p, i (p.id)}
					<li role="option" aria-selected={p.id === value}>
						<button
							type="button"
							class="opt"
							class:active={i === active}
							class:sel={p.id === value}
							disabled={disabled(p.id)}
							onclick={() => pick(p.id)}
							onmouseenter={() => (active = i)}
						>
							<span class="em">{emoji(p)}</span><span class="nm">{p.name}</span>
							{#if p.id === value}<span class="tag">✓ selected</span>
							{:else if disabled(p.id)}<span class="tag">in game</span>{/if}
						</button>
					</li>
				{:else}
					<li class="empty">No players match “{query}”.</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.combo {
		position: relative;
	}
	.field {
		position: relative;
		display: flex;
		align-items: center;
	}
	.adorn {
		position: absolute;
		left: 0.55rem;
		font-size: 1.15rem;
		line-height: 1;
		pointer-events: none;
	}
	.chev {
		position: absolute;
		right: 0.6rem;
		color: var(--muted);
		font-size: 0.7rem;
		pointer-events: none;
	}
	.combo-input {
		width: 100%;
		padding: 0.55rem 1.7rem 0.55rem 2.1rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--surface-2);
		background: var(--bg);
		color: var(--ink);
		font-family: var(--body);
		font-size: 0.92rem;
		font-weight: 700;
	}
	.combo-input::placeholder {
		color: var(--muted);
		font-weight: 600;
	}
	.combo-input:focus {
		outline: none;
		border-color: var(--teal);
	}
	.combo-pop {
		position: absolute;
		z-index: 20;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		background: var(--card-hi);
		border: 2px solid var(--edge);
		border-radius: var(--radius-sm);
		box-shadow: 0 10px 22px rgba(0, 0, 0, 0.28);
		overflow: hidden;
	}
	.combo-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		max-height: 200px;
		overflow-y: auto;
	}
	.opt {
		width: 100%;
		text-align: left;
		border: none;
		background: transparent;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.5rem;
		border-radius: 8px;
		cursor: pointer;
		font-family: var(--body);
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--ink);
	}
	.opt .em {
		font-size: 1.15rem;
		line-height: 1;
	}
	.opt .nm {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.opt.active {
		background: #d7efe0;
	}
	.opt:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: transparent;
	}
	.opt .tag {
		margin-left: auto;
		font-size: 0.62rem;
		font-weight: 800;
		color: var(--muted);
		white-space: nowrap;
	}
	.combo-list li.empty {
		padding: 0.6rem 0.5rem;
		color: var(--muted);
		font-weight: 600;
		font-size: 0.85rem;
	}
</style>
