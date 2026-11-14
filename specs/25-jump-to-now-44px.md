# Jump to now button at least 44px on phones

## What this changes
On a phone (below `lg`) the schedule's **Jump to now** button is 44px tall
instead of 32px, matching the other mobile schedule controls. From `lg` up it
stays the 32px `sm` button.

## Where
- `src/pages/SchedulePage.jsx` — the `<Button size="sm" data-testid="jump-to-now">`
  at line ~278: add `className="max-lg:h-11"`. `Button` (`src/components/ui.jsx`)
  appends `className` after `BUTTON_SIZES.sm` (`h-8`), and the `max-lg:` variant
  sorts after the base utility, so it wins below `lg` only. `Button` itself is
  unchanged, so other `sm` buttons do not move. The header row is
  `flex flex-wrap items-baseline`, so a taller button only grows that row.
- Test in `tests/schedule.spec.js`, inside `describe('Jump to now')`, using its
  local `open(page, 'list', '15:00')` helper (read-only, so no lane). Mobile
  project: `setViewportSize({ width: 375, height: 659 })` before `open`, then
  `getByTestId('jump-to-now').boundingBox()`, height `>= 44`. Desktop project:
  1440x900, height `=== 32` (a guard, as in the compact-cards desktop test).

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| At 375px the button's height is at least 44px | phone test: `jump-to-now` height `>= 44` at 375px (false on main: 32) | Browser (mobile project) |
| Desktop size is unchanged | desktop test: `jump-to-now` height is 32 at 1440px; a regression guard, holds on main | Browser (desktop project) |
| The existing Jump to now specs still pass | the existing `Jump to now` tests in `tests/schedule.spec.js` run unchanged; a regression guard | Browser (both projects) |

## Decisions
- Is "below `lg`" (not just phones under `sm`) the right cut-off for the taller button, matching the ticket's "below `lg`" — OK?
