# MVP Voting & Push Notifications — Design (Phase 2)

**Date:** 2026-08-18
**Status:** Approved (design discussion)

## Context

This is **Phase 2**, built on the per-player identity from
[`2026-08-14-player-sso-identity-design.md`](./2026-08-14-player-sso-identity-design.md).
That phase gave every request a resolved `locals.auth.player` (Google login →
`players` row by email), which is what lets us attribute a vote to a specific
person.

After each game, the players who took part vote for the **Most Valuable Play
(MVP)** — the standout player of that match. Voting is asynchronous (each
person from their own phone), time-boxed to 24h, and reaches over the web via
**push notifications** so people know when to vote and what the result was.

## Goal

- After a 2v2/3v3 game is logged, open a **voting round**: participants have
  **24h** to cast **one final vote** each for the MVP.
- Notify participants via **Web Push** (browser / installed PWA) when voting
  opens, when the result is decided, and a reminder before the deadline.
- A new **`/mvp`** page: cast your vote, see recent results, and an all-time MVP
  leaderboard.
- Surface **MVP counts across the app** (board leaderboard, player detail, team
  detail, game log) as a consistent gold ★ marker.

## Rules (decided during brainstorming)

- **Scope:** rounds are created for **2v2 and 3v3 only**. `1v1` games get no
  round (MVP is a team concept; a 1v1 round is degenerate).
- **Ballot:** a voter picks **one** participant of that game, **excluding
  themselves**. Cross-side voting is allowed (you may vote for an opponent).
- **Eligibility to vote:** only participants who have a login (their `players`
  row has an `email` that matches a signed-in Google account) can authenticate
  and vote.
- **Quorum:** a round counts once **⌈P/2⌉ ballots** are cast, where **P = all
  participants** (4 for 2v2, 6 for 3v3) — *not* just those with logins.
  - **Accepted tradeoff:** if fewer than ⌈P/2⌉ participants have logins, the
    round can never reach quorum and will **void** at the deadline. This is
    intentional per the product owner.
- **One final vote:** a ballot is **irreversible** — one vote per player per
  game, no changing it. Enforced by a `unique(game_id, voter_id)` constraint and
  by rejecting a second submission server-side.
- **Secrecy:** individual votes and the running tally are **hidden until the
  round closes**. Only after a round is `decided`/`void` are counts revealed
  (on `/mvp` and in the result notification). This avoids influencing voters who
  haven't voted yet.
- **Resolution (close early once decided):**
  - Close **early** the moment quorum is met **and** the leader is
    mathematically unbeatable — i.e. `leaderVotes > secondVotes + remaining`,
    where `remaining` = eligible (logged-in) participants who have not yet
    voted. → `decided`.
  - Otherwise wait to the **24h deadline**: if quorum was met → `decided` with
    the top vote-getter(s); if not → `void`.
  - **Ties** at the deadline (or at an early close where the top is jointly
    unbeatable but tied) → **co-MVPs**: every nominee tied at the top wins.

## Data model

Three new tables in `src/lib/server/db/schema.ts`, following the existing
`serial` PK + FK-to-`games`/`players` pattern (mirrors `gameParticipants`). A
new enum `mvpStatusEnum = ['open','decided','void']`.

### `mvp_rounds` — one per eligible game

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `gameId` | integer, **unique**, FK → games (cascade) | one round per game |
| `deadline` | timestamptz | round-created time + 24h |
| `status` | `mvpStatusEnum`, default `open` | |
| `decidedAt` | timestamptz, null | set when it leaves `open` |
| `openNotifiedAt` | timestamptz, null | idempotency for the "vote opens" push |
| `reminderNotifiedAt` | timestamptz, null | idempotency for the reminder push |
| `resultNotifiedAt` | timestamptz, null | idempotency for the "result" push |

Winners are **derived** (nominees tied at max votes once `status != open`), so
co-MVPs need no extra storage.

### `mvp_votes` — one ballot per voter per game

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `gameId` | integer, FK → games (cascade) | |
| `voterId` | integer, FK → players | who voted |
| `nomineeId` | integer, FK → players | who they voted for |
| `createdAt` | timestamptz, default now | |
| — | **unique(`gameId`, `voterId`)** | one final vote per player per game |

### `push_subscriptions` — Web Push endpoints

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `playerId` | integer, FK → players (cascade) | |
| `endpoint` | text, **unique** | the push service URL |
| `p256dh` | text | subscription key |
| `auth` | text | subscription key |
| `createdAt` | timestamptz, default now | |

A player may have several rows (phone + laptop).

## Pure resolution engine — `src/lib/mvp/engine.ts`

Mirrors `rating/engine.ts`: pure, no I/O, unit-tested directly. Signature:

```ts
type RoundInput = {
  participantIds: number[];        // all P participants
  eligibleVoterIds: number[];      // participants who can log in (subset)
  votes: { voterId: number; nomineeId: number }[];
  deadline: string;                // ISO
  now: string;                     // ISO
};
type RoundResult = {
  status: 'open' | 'decided' | 'void';
  winners: number[];               // player ids; [] while open or void
  quorumMet: boolean;
  quorum: number;                  // ⌈P/2⌉
};
export function resolveRound(input: RoundInput): RoundResult;
```

Logic:

- `quorum = ceil(participantIds.length / 2)`, `quorumMet = votes.length >= quorum`.
- Tally by `nomineeId`. `leader` = max tally, `second` = next-highest distinct
  tally, `remaining = eligibleVoterIds - votersWhoVoted`.
- **Early decide:** `quorumMet && leaderTally > secondTally + remaining` →
  `decided`, `winners = nominees with leaderTally`.
- **Past deadline (`now >= deadline`):** `quorumMet` → `decided`,
  `winners = nominees with max tally` (co-MVPs on ties); else → `void`.
- **Otherwise** → `open`, `winners = []`.

Test cases: below/at/above quorum; unbeatable early close; not-yet-unbeatable
stays open; deadline with a clear winner; deadline tie → co-MVPs; deadline
without quorum → void; too-few-eligible → can-never-decide → void.

## Server layer

### Queries — `src/lib/server/db/queries.ts`

All take `db: DB` first (both drivers). No `db.transaction()` on neon-http —
use single statements / the CTE pattern like `insertGame` where atomicity
matters.

- `createMvpRound(db, { gameId, deadline })` — insert the round row.
- `getRoundForGame(db, gameId)` / `getRoundWithVotes(db, gameId)` — round +
  its votes + participants (for the engine).
- `castVote(db, { gameId, voterId, nomineeId })` — insert respecting the unique
  constraint; a duplicate rejects (surface as a friendly error, not a 500).
- `getOpenRoundsForPlayer(db, playerId)` — rounds a player is in, still `open`,
  where the player hasn't voted (drives "Awaiting your vote").
- `getRecentResults(db, limit)` — `decided`/`void` rounds newest-first with
  winners + tally (for the results feed; only closed rounds expose counts).
- `getMvpCounts(db)` — MVP wins per player id (co-MVP counts for each winner);
  consumed by the stats layer for the leaderboard and the ★ markers.
- `markRoundNotified(db, roundId, which)` / `closeRound(db, roundId, status)` —
  status + idempotency-stamp writes.
- Push: `savePushSubscription`, `deletePushSubscription(endpoint)`,
  `getSubscriptionsForPlayers(db, ids)`.

### Push wrapper — `src/lib/server/push.ts`

Thin wrapper over the `web-push` dependency (new). `sendToPlayers(db, ids,
payload)` loads subscriptions, sends, and **prunes** subscriptions that return
404/410 (gone). Reads VAPID env (below). Never throws into the request path —
push failures are logged, not fatal.

### Orchestration — `src/lib/server/mvp.ts`

Glue over engine + queries + push:

- `onGameLogged(db, gameId, format, playedAt)` — for 2v2/3v3, create the round
  (`deadline = now + 24h`) and fire the **vote-opens** push to participants.
- `recomputeAfterVote(db, gameId)` — run the engine; if it flips to `decided`,
  `closeRound` + fire the **result** push (idempotent via `resultNotifiedAt`).
- `processTick(db, now)` — for every `open` round: if `now >= deadline` resolve
  (decide/void) + fire result push; else if within the reminder window and not
  yet reminded, fire the **reminder** push to participants who haven't voted.
  Idempotent via the `*NotifiedAt` stamps.

### Triggers & scheduling (Decision C)

- `onGameLogged` runs inside the existing `/log` action after `insertGame`.
- `recomputeAfterVote` runs inside the `/mvp` vote action.
- **Lazy resolution (always on):** the `/mvp` loader and the board loader call
  `processTick` opportunistically, so rounds close and results fire whenever the
  app is used — works on **any Vercel plan**.
- **Cron (punctual):** `POST /api/mvp/tick` guarded by a `CRON_SECRET` bearer
  calls `processTick`. `vercel.json` schedules it. **Default schedule is
  Hobby-safe (daily);** on Pro, tighten to `*/10 * * * *` so deadline reminders
  land on time. The code is identical across plans — only the schedule differs.

## Push subscription flow

- **VAPID keys:** `PUBLIC_VAPID_KEY` (the VAPID *public* key is genuinely
  public — safe to send to the browser, so the `PUBLIC_` prefix is correct
  here), `VAPID_PRIVATE_KEY` (secret, server-only), `VAPID_SUBJECT`
  (`mailto:` contact). Plus `CRON_SECRET`. All added to `.env.example`.
- **Service worker:** extend the existing `src/service-worker.ts` with a `push`
  handler (`showNotification` with title/body and a `data.url` deep-link) and a
  `notificationclick` handler (focus an existing tab or open `/mvp`).
- **Client subscribe:** a helper reads `PUBLIC_VAPID_KEY`, calls
  `pushManager.subscribe`, and POSTs the subscription to
  `/api/push/subscribe`; unsubscribe hits `/api/push/unsubscribe`.
- **UI:** a `NotificationToggle` on `/account` (central settings), plus a
  dismissible `EnablePushBanner` in the layout shown to logged-in players who
  haven't subscribed — this is the "ask from the browser when the feature ships"
  prompt. Clicking either runs the same subscribe flow. Permission is requested
  on that explicit click, never unsolicited.

## The `/mvp` page — `src/routes/mvp/`

Public to view; voting gated to participants (`requireAuth`). Sections
top-to-bottom (see the approved mockup):

1. **Enable-notifications banner** (if not yet subscribed).
2. **Awaiting your vote** — cards for the viewer's games with an open round they
   haven't voted on: matchup, 24h countdown, candidate chips (everyone but
   you), a **finality warning** ("one vote, final, can't be changed"), and a
   **Cast final vote** button. After casting, a **locked-in** confirmation with
   **no tally**.
3. **Recent MVPs** — closed rounds newest-first with the winner(s) and the
   revealed vote count (co-MVPs shown together).
4. **MVP leaderboard** — all-time MVP wins per player, reusing the tile styling;
   #1 gets the gold `king` treatment.

A new **MVP** item in `Nav.svelte`, visible to everyone (like Board/Log), using
an inline star SVG icon.

**Vote action** validation (mirrors `/log`'s server-side rigor): `requireAuth`;
the round exists and is `open`; the voter is a participant; the nominee is a
participant and **not** the voter; no existing ballot by this voter (unique
constraint backstops a raw double-POST). On success, `recomputeAfterVote`.

## MVP stats across the app

`getMvpCounts` feeds a small addition to the stats layer so MVP wins render
consistently:

- **Player detail** (`/players/[id]`): a new **MVPs** stat in the hero
  `.statrow` (gold ★ + count).
- **Board leaderboard tile** (`CreatureTile`): an optional gold **★ N MVP**
  chip.
- **Team detail** and **game log**: the same ★ marker where it fits (a game with
  a decided MVP can badge the winner).

## Files touched (summary)

- **New:** `src/lib/mvp/engine.ts` (+ test), `src/lib/server/push.ts`,
  `src/lib/server/mvp.ts`, `src/routes/mvp/+page.svelte` &
  `+page.server.ts`, `src/routes/api/mvp/tick/+server.ts`,
  `src/routes/api/push/subscribe/+server.ts` &
  `.../unsubscribe/+server.ts`, `src/lib/components/NotificationToggle.svelte`,
  `src/lib/components/EnablePushBanner.svelte`, `vercel.json`, a Drizzle
  migration.
- **Changed:** `schema.ts`, `queries.ts`, `service-worker.ts`, `Nav.svelte`,
  `CreatureTile.svelte`, player/team detail loaders + pages, the stats layer,
  `/log/+page.server.ts` (call `onGameLogged`), `.env.example`, `README.md`.

## Testing

- **Unit:** `engine.ts` resolution rules (the test list above) run as pure
  `*.test.ts` in the `server` vitest project.
- **Queries:** exercise `castVote` (incl. duplicate rejection), quorum/void, and
  `getMvpCounts` against the pglite test DB.
- **Component:** `NotificationToggle` / ballot states where useful
  (`*.svelte.test.ts`, happy-dom).
- `pnpm check` stays at 0/0; `pnpm lint` clean.

## Out of scope / follow-ups

- Editing or retracting a cast vote (deliberately impossible).
- Email fallback for players without push.
- Historical backfill of MVP rounds for games logged before this ships (new
  games only; old games simply have no round).
