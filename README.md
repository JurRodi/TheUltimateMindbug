# The Ultimate Mindbug 🐛

A leaderboard + rating system for our daily **Mindbug** games — built to settle,
once and for all, who among us is *the Ultimate Mindbug*.

We mostly play **multiplayer** (2v2 or 3v3), not standard 1v1, so the rating math
has to be team-aware. That's the interesting part.

## What it tracks

- **Rating (Elo-style)** — a skill number per player that goes up when you win and
  down when you lose, weighted by how strong the opposing side was.
- **Win rate** — wins / games played.
- **All-time wins** — total career wins.
- **Games played**, current streak, and more as we go.

All stats should be **filterable** — e.g. by game format (2v2 / 3v3), by date range
(this week / this month / all time), and by player.

## Multiplayer Elo — the approach (draft)

Standard Elo is 1v1. For team games (2v2, 3v3) a common, well-proven adaptation is:

1. **Each team's rating = the average rating of its members.**
2. Compute the expected result for each team with the normal Elo formula:
   `E_team = 1 / (1 + 10^((R_opp - R_team) / 400))`.
3. After the game, every player on a team gets the **same team delta**
   (`K * (actual - expected)`) applied to their individual rating.
   - Winners: `actual = 1`. Losers: `actual = 0`.
4. `K` (the volatility factor) is tunable — higher = ratings move faster.

This keeps it simple and fair: beating a stronger team earns more; a strong player
carried by a weak team still only gains the team delta. We can refine later
(e.g. margin of victory, per-player contribution, 3-way free-for-alls).

Open questions to decide together:
- Starting rating (e.g. 1000 or 1500) and `K` value.
- How to handle games with more than two teams.
- Whether teams are fixed or shuffle every game (affects filtering).

## Status

🚧 Early days. This README is the plan. Next: decide the data model (how we log a
game) and pick how we want to use it — a simple local web page, a spreadsheet-backed
tool, or a small app.

## The players

_TBD — add the crew here._
