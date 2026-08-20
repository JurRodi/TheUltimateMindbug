<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Toast from '$lib/components/Toast.svelte';
	let { data, form } = $props();

	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

	const countdown = (iso: string) => {
		const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3.6e6));
		return `${h}h left`;
	};

	// One radio selection per open round, keyed by gameId.
	let picked = $state<Record<number, number | undefined>>({});

	// Whether a given player has already cast a ballot in a round — drives both
	// the ✓ badge on their chip and the live turnout count. Works for open and
	// voted rounds alike (both carry `voterIds`).
	const didVote = (voterIds: number[], id: number) => voterIds.includes(id);

	// Candidates exclude the voter — you can't vote for yourself.
	const candidatesFor = (r: (typeof data.openRounds)[number]) =>
		[...r.us, ...r.them].filter((p) => p.id !== data.myId);

	// "us" is always rendered first (the viewer's own team); the connecting word
	// reflects the real result instead of assuming a win. Accepts either an open
	// ballot round or a voted round (same side/winnerSide shape).
	const wonRound = (r: { side: string; winnerSide: string }) => r.side === r.winnerSide;

	// Static quorum figure: how many of the game's participants need to vote before
	// the round can resolve. A fixed fact about the round (not a live tally), so it
	// leaks nothing.
	const quorum = (r: { us: unknown[]; them: unknown[] }) => {
		const total = r.us.length + r.them.length;
		return { needed: Math.ceil(total / 2), total };
	};

	// Recent results: show the last 5, expandable to all (like the player page log).
	let expanded = $state(false);
	const shownResults = $derived(expanded ? data.results : data.results.slice(0, 5));

	// In-flight vote submissions, keyed by gameId, so each ballot shows its own
	// button spinner without disabling the others.
	let submitting = $state<Record<number, boolean>>({});

	// On a successful vote, run the default enhance behavior — which re-runs `load`,
	// so the round leaves "Awaiting" (count drops) and reappears under "Voted" — then
	// show a confirmation toast. `submitting` gates the button while the request is
	// in flight (set true when the form submits, cleared once `update()` resolves).
	let toast = $state<string | null>(null);
	const voteEnhance =
		(gameId: number): SubmitFunction =>
		() => {
			submitting[gameId] = true;
			return async ({ result, update }) => {
				await update();
				submitting[gameId] = false;
				if (result.type === 'success') toast = 'Vote locked in ✓';
			};
		};
</script>

{#if toast}<Toast message={toast} ondone={() => (toast = null)} />{/if}

<h1>Most Valuable Play</h1>
<p class="sub">Vote for the standout player after every game.</p>

{#if data.openRounds.length}
	<div class="sechead">
		<h2>Awaiting your vote</h2>
		<span class="chip count">{data.openRounds.length}</span>
	</div>
	<div class="stack">
		{#each data.openRounds as r (r.gameId)}
			{@const q = quorum(r)}
			<form method="POST" action="?/vote" use:enhance={voteEnhance(r.gameId)} class="card ballot">
				<input type="hidden" name="gameId" value={r.gameId} />
				<div class="top">
					<div class="meta">
						<span class="fmt">{r.format}</span>
						<span class="date">{fmtDate(r.playedAt)}</span>
					</div>
					<span class="cd">
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
							stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg
						>
						{countdown(r.deadline)}
					</span>
				</div>

				<div class="matchup">
					<span class="teamgrp us">
						{#each r.us as p (p.id)}
							<span
								class="pchip"
								class:you={p.id === data.myId}
								class:voted={didVote(r.voterIds, p.id)}
							>
								<span class="em">{p.emoji}</span>{p.id === data.myId ? 'You' : p.name}
								{#if didVote(r.voterIds, p.id)}<span class="vcheck" title="Voted">✓</span>{/if}
							</span>
						{/each}
					</span>
					<span class="def">{wonRound(r) ? 'def.' : 'lost to'}</span>
					<span class="teamgrp">
						{#each r.them as p (p.id)}
							<span class="pchip" class:voted={didVote(r.voterIds, p.id)}>
								<span class="em">{p.emoji}</span>{p.name}
								{#if didVote(r.voterIds, p.id)}<span class="vcheck" title="Voted">✓</span>{/if}
							</span>
						{/each}
					</span>
				</div>

				<div class="divider"></div>

				<div class="q">Who was the MVP?</div>
				<div class="cands">
					{#each candidatesFor(r) as p (p.id)}
						<label class="cand" class:on={picked[r.gameId] === p.id}>
							<input
								type="radio"
								name="nomineeId"
								value={p.id}
								bind:group={picked[r.gameId]}
								hidden
							/>
							<span class="av">{p.emoji}</span>{p.name}
							{#if picked[r.gameId] === p.id}
								<svg
									width="15"
									height="15"
									viewBox="0 0 24 24"
									fill="none"
									stroke="var(--up)"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg
								>
							{/if}
						</label>
					{/each}
				</div>

				<div class="warn">
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M12 9v4" /><path d="M12 17h.01" /><path
							d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
						/></svg
					>
					One vote each — final and can't be changed.
				</div>

				{#if form?.error}<p class="err">{form.error}</p>{/if}

				<div class="footer">
					<span class="turnout">
						<span class="kc">✓</span>
						<b>{r.voterIds.length}</b> of {q.total} voted
						<span class="need">({q.needed} needed to count)</span>
					</span>
					<button class="btn" type="submit" disabled={!picked[r.gameId] || submitting[r.gameId]}>
						{#if submitting[r.gameId]}<span class="spin"></span>Casting…{:else}Cast final vote{/if}
					</button>
				</div>
			</form>
		{/each}
	</div>
{/if}

{#if data.votedRounds.length}
	<div class="sechead">
		<h2>Voted · awaiting results</h2>
		<span class="chip count done">{data.votedRounds.length}</span>
	</div>
	<div class="stack">
		{#each data.votedRounds as r (r.gameId)}
			{@const q = quorum(r)}
			<div class="card voted-card">
				<div class="top">
					<div class="meta">
						<span class="fmt">{r.format}</span>
						<span class="date">{fmtDate(r.playedAt)}</span>
					</div>
					<span class="cd">
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
							stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg
						>
						{countdown(r.deadline)}
					</span>
				</div>
				<div class="matchup">
					<span class="teamgrp us">
						{#each r.us as p (p.id)}
							<span
								class="pchip"
								class:you={p.id === data.myId}
								class:voted={didVote(r.voterIds, p.id)}
							>
								<span class="em">{p.emoji}</span>{p.id === data.myId ? 'You' : p.name}
								{#if didVote(r.voterIds, p.id)}<span class="vcheck" title="Voted">✓</span>{/if}
							</span>
						{/each}
					</span>
					<span class="def">{wonRound(r) ? 'def.' : 'lost to'}</span>
					<span class="teamgrp">
						{#each r.them as p (p.id)}
							<span class="pchip" class:voted={didVote(r.voterIds, p.id)}>
								<span class="em">{p.emoji}</span>{p.name}
								{#if didVote(r.voterIds, p.id)}<span class="vcheck" title="Voted">✓</span>{/if}
							</span>
						{/each}
					</span>
				</div>
				<div class="divider"></div>
				<div class="votedrow">
					{#if r.myVote}
						<span class="votedfor">
							<span class="av">{r.myVote.emoji}</span>You voted for {r.myVote.name}
						</span>
					{/if}
					<span class="turnout">
						<span class="kc">✓</span>
						<b>{r.voterIds.length}</b> of {q.total} voted
						<span class="need">({q.needed} needed to count)</span>
					</span>
					<span class="hidden-note">
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><rect x="3" y="11" width="18" height="10" rx="2" /><path
								d="M7 11V7a5 5 0 0 1 10 0v4"
							/></svg
						>
						Results hidden until voting closes.
					</span>
				</div>
			</div>
		{/each}
	</div>
{/if}

{#if data.results.length}
	<h2 class="sectitle">Recent MVPs</h2>
	<div class="games-head">
		<span class="rescount">
			{#if expanded}All {data.results.length}{:else}Last {shownResults.length} of {data.results
					.length}{/if}
		</span>
		{#if data.results.length > 5}
			<button class="viewall" onclick={() => (expanded = !expanded)}>
				{expanded ? 'Show less ▴' : 'View all ▾'}
			</button>
		{/if}
	</div>
	<div class="stack">
		{#each shownResults as res (res.gameId)}
			<div class="card result">
				{#if res.status === 'void'}
					<span class="muted"
						>{res.format} · {fmtDate(res.playedAt)} · no MVP (not enough votes)</span
					>
				{:else}
					<div class="artcluster" aria-hidden="true">
						{#each res.winners as w, wi (w.id)}
							<div class="art gold" style:margin-left={wi > 0 ? '-14px' : '0'}>{w.emoji}</div>
						{/each}
					</div>
					<div class="rbody">
						<div class="rname">
							<span>{res.winners.map((w) => w.name).join(' & ')}</span>
							<span class="chip mvp">{res.winners.length > 1 ? 'CO-MVP' : 'MVP'}</span>
						</div>
						<div class="rsub">
							{res.format} · {fmtDate(res.playedAt)}
							{#if res.winners.length > 1}· tied at {res.topVotes} votes each{/if}
						</div>
					</div>
					<div class="rvotes">
						<b>{res.topVotes}</b>
						<small>{res.winners.length > 1 ? 'EACH' : 'VOTES'}</small>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

{#if !data.openRounds.length && !data.votedRounds.length && !data.results.length}
	<p class="card">No MVP activity yet — play a 2v2 or 3v3 game to start voting.</p>
{/if}

<style>
	.sub {
		color: var(--onmat-muted);
		font-size: 0.92rem;
		font-weight: 700;
		margin: 0.3rem 0 1.3rem;
	}
	.sechead {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.7rem;
	}
	.sectitle {
		margin-bottom: 0.7rem;
	}
	.sechead + .stack {
		margin-bottom: 1.5rem;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		margin-bottom: 1.5rem;
	}
	.chip.count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.3rem;
		background: var(--coral);
		color: #fff;
	}
	.chip.count.done {
		background: var(--surface-2);
		color: var(--muted);
	}

	/* ---- "view all" header for the results feed (mirrors the player page log) ---- */
	.games-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: -0.4rem 0 0.7rem;
	}
	.rescount {
		font-size: 0.78rem;
		color: var(--onmat-muted);
		font-weight: 700;
	}
	.viewall {
		font-family: var(--display);
		font-size: 0.75rem;
		font-weight: 800;
		cursor: pointer;
		border: none;
		background: rgba(0, 0, 0, 0.24);
		color: var(--onmat-muted);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.viewall:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--onmat);
	}

	/* ---- ballot card ---- */
	.ballot {
		display: flex;
		flex-direction: column;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.fmt {
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		padding: 0.08rem 0.4rem;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--muted);
	}
	.date {
		font-size: 0.72rem;
		color: var(--muted);
		font-weight: 700;
	}
	.cd {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: #f6ecd0;
		color: #a8791f;
		font-size: 0.72rem;
		font-weight: 800;
		border: 1.5px solid var(--edge);
	}
	.matchup {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		margin-top: 0.65rem;
	}
	.teamgrp {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		flex-wrap: wrap;
		padding: 0.2rem 0.35rem;
		border-radius: 9px;
		border: 1.5px solid transparent;
	}
	.teamgrp.us {
		background: rgba(15, 143, 106, 0.14);
		border-color: rgba(15, 143, 106, 0.5);
	}
	.def {
		font-family: var(--display);
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--muted);
	}
	.pchip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--ink);
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0.1rem 0.5rem 0.1rem 0.28rem;
	}
	.pchip .em {
		font-size: 0.9rem;
	}
	.pchip.you {
		background: var(--gold-2);
		border: 1.5px solid var(--gold);
		font-weight: 800;
		padding: 0.1rem 0.5rem 0.1rem 0.24rem;
	}
	.divider {
		height: 1px;
		background: var(--line-card);
		margin: 0.85rem 0;
	}
	.q {
		font-family: var(--display);
		font-weight: 800;
		font-size: 0.9rem;
		color: var(--ink);
		margin-bottom: 0.55rem;
	}
	.cands {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.cand {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		font-family: var(--body);
		font-weight: 700;
		font-size: 0.85rem;
		padding: 0.4rem 0.75rem 0.4rem 0.45rem;
		border-radius: 999px;
		background: #fff;
		border: 2px solid var(--line-card);
		color: var(--ink);
	}
	.cand .av {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--card);
		border: 1.5px solid var(--edge);
		font-size: 0.95rem;
	}
	.cand.on {
		background: var(--gold-2);
		border-color: var(--gold);
		font-weight: 800;
		box-shadow: 0 3px 0 rgba(0, 0, 0, 0.18);
	}
	.cand.on .av {
		background: #fff;
	}
	.warn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.65rem;
		border-radius: 10px;
		background: #f6ecd0;
		border: 1.5px solid var(--edge);
		color: #8a6414;
		font-size: 0.76rem;
		font-weight: 800;
		margin-top: 0.9rem;
	}
	.warn svg {
		flex: none;
	}
	.footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		margin-top: 0.75rem;
	}
	/* Live turnout: how many of the game's participants have voted so far, plus
	   the quorum needed to count. Turnout only — never reveals who leads. */
	.turnout {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.75rem;
		color: var(--muted);
		font-weight: 700;
	}
	.turnout .kc {
		display: inline-grid;
		place-items: center;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--up);
		color: #fff;
		font-size: 9px;
		font-weight: 900;
	}
	.turnout b {
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.turnout .need {
		color: var(--muted);
		font-weight: 700;
	}
	/* ✓ badge on the chip of a player who has already voted. */
	.pchip.voted {
		border: 1.5px solid var(--up);
		padding-right: 0.32rem;
	}
	.vcheck {
		display: inline-grid;
		place-items: center;
		width: 15px;
		height: 15px;
		border-radius: 50%;
		background: var(--up);
		color: #fff;
		font-size: 10px;
		font-weight: 900;
		line-height: 1;
		margin-left: 0.05rem;
	}
	/* In-flight vote: the button becomes a spinner + "Casting…" and disables. */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
	.spin {
		width: 15px;
		height: 15px;
		border-radius: 50%;
		border: 2.5px solid rgba(255, 255, 255, 0.4);
		border-top-color: #fff;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.err {
		color: var(--danger);
		font-weight: 700;
		font-size: 0.82rem;
		margin: 0.7rem 0 0;
	}

	/* ---- voted (awaiting results) ---- */
	.votedrow {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.votedfor {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		font-weight: 800;
		color: var(--ink);
		background: var(--gold-2);
		border: 1.5px solid var(--gold);
		border-radius: 999px;
		padding: 0.28rem 0.7rem 0.28rem 0.4rem;
	}
	.votedfor .av {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #fff;
		border: 1.5px solid var(--edge);
		font-size: 0.9rem;
	}
	.hidden-note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		justify-content: flex-start;
		color: var(--muted);
		font-size: 0.76rem;
		font-weight: 700;
	}
	.hidden-note svg {
		flex: none;
	}

	/* ---- results feed ---- */
	.result {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.75rem 0.9rem;
	}
	.result .muted {
		color: var(--muted);
		font-weight: 700;
		font-size: 0.85rem;
	}
	.artcluster {
		display: flex;
		flex: none;
	}
	.art {
		width: 46px;
		height: 56px;
		font-size: 1.7rem;
	}
	.rbody {
		flex: 1;
		min-width: 0;
	}
	.rname {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.05rem;
		color: var(--ink);
	}
	.chip.mvp {
		background: var(--gold-grad);
		color: #3a2b06;
	}
	.rsub {
		font-size: 0.76rem;
		color: var(--muted);
		font-weight: 700;
		margin-top: 0.15rem;
	}
	.rvotes {
		text-align: center;
		min-width: 3rem;
	}
	.rvotes b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.5rem;
		line-height: 1;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		display: block;
	}
	.rvotes small {
		font-size: 0.5rem;
		letter-spacing: 0.1em;
		color: var(--muted);
		font-weight: 800;
	}
</style>
