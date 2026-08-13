# Rating chart hover interactions — design

**Date:** 2026-08-13
**Component:** `src/lib/components/RatingChart.svelte`
**Used by:** player detail page (`/players/[id]`).

## Goal

Add hover interactivity to the rating-over-time chart. Purely a presentational
enhancement — no data-model or server changes. (A second win-rate chart was
considered and dropped: cumulative win% adds little on top of the rating trend.)

## Behavior

1. **Nearest-track focus, proximity-gated.** On mouse move, find the track whose
   line/dots are closest to the cursor, measuring distance to line *segments*
   (so hovering between two dots works) as well as to dots. Only engage when that
   distance is within a **15px** tolerance; otherwise nothing is highlighted.

2. **Fade the others.** While a track is active, the other tracks' lines, dots,
   and end-value labels — plus their legend entries — fade to opacity **0.2**.
   The active track stays at full opacity. Transition ~0.13s.

3. **Highlighted point + tooltip.** The nearest dot on the active track gets a
   solid colored core with a soft same-color halo behind it (no cream/white gap,
   which was the flaw in the old ring style). A tooltip anchored above that dot
   shows `TRACK · date` and the rating value, with a top border in the track color.

4. **Legend hover.** Hovering a legend entry activates that track (same fade),
   giving a way to isolate a track without finding its line.

5. **Leave to reset.** Moving into empty space (beyond tolerance) or off the chart
   clears the active state.

## Implementation notes

- Listeners attached via `bind:this` + `addEventListener` inside `$effect`
  (not inline `on*` attributes) so Svelte's a11y lint stays clean and `pnpm check`
  stays at 0 warnings.
- Wrap the `<svg>` in a `position:relative` container so the absolutely-positioned
  tooltip `<div>` can be placed over the chart in pixel space (viewBox coords
  scaled by the rendered rect).
- Hit-testing uses a point-to-segment distance helper over precomputed
  `{cx, cy, rating, playedAt}` positions per drawn track.
- Constants: `TOL = 15`, `FADE = 0.2`.

## Out of scope

- Win-rate chart. Touch support (mouse only for now). Changes to
  `TeamRecordChart.svelte` (could adopt the same pattern later).
