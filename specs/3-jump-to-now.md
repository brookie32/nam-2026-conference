# Jump to now on the schedule

## What this changes

On `/schedule`, when the day shown is the conference clock's day (`filters.day === clock.day`)
and a slot is still in progress or yet to start, a **Jump to now** button
(`data-testid="jump-to-now"`) sits in the day heading row next to the *Today* chip. Pressing it
scrolls the slot in progress (start ≤ now < end), or the next slot to start if now falls
between slots, to the top of the visible area, clear of the sticky header, in both list and
grid view. It is not rendered on any other day, or once every slot of the day has ended. It
reads `useConference().clock` only, never `new Date()`, and it scrolls only when pressed, never
on load.

## Where

- `src/lib/clock.js`: new pure export `jumpTarget(sessions, clock)` returns the `startsAt`
  (`'HH:MM'`) of the slot to scroll to, or `null`. It returns `null` when `sessions[0]?.day !== clock.day`.
  Otherwise it returns the earliest slot with `toMinutes(startsAt) <= now < toMinutes(endsAt)`,
  or failing that the earliest `startsAt > now`, or `null`. It uses `toMinutes`. Unit test in
  `tests/unit/clock.test.js`, which uses the same `node --test` style as the existing cases there.
- `src/pages/SchedulePage.jsx`: compute `const nowSlot = filters.day === clock.day ? jumpTarget(sessions, clock) : null`
  next to `slots` (line ~97). Render the button in the heading row after the *Today* chip
  (line ~264–269) when `!loading && nowSlot`. Use the `Button` primitive (`size="sm"`) with
  `Icon name="clock"`. On click, run
  `document.querySelector(\`[data-slot="${nowSlot}"]\`)?.scrollIntoView({ block: 'start' })`.
  Add `data-slot={time}` and `scroll-mt-20` (clears the `sticky top-0` header in `Layout.jsx`)
  to the list `<section data-testid={\`slot-${time}\`}>` (line ~301).
- `src/components/ScheduleGrid.jsx`: on the per-slot wrapper `<div key={startsAt}>` (line ~84),
  add `data-testid={\`grid-slot-${startsAt}\`}`, `data-slot={startsAt}` and `scroll-mt-20`. The
  wrapper holds both the banner rows and the cell row of that slot.
- Browser test in `tests/schedule.spec.js`: a new `test.describe('Jump to now')`, run by both
  Playwright projects (desktop 1440×900, mobile 393×659). It only reads, so it needs no lane.
  It uses `conferenceDays()`, `momentOn()` and `waitForResults()` from `tests/helpers.js`, and
  pins the clock with `?at=` in the URL, as the ticket asks:
  `page.goto(\`/schedule?view=list&at=${await momentOn(0, '15:00')}\`)`, followed by waiting for
  the `banner` role. A small local helper, `expectInView(page, locator)`, asserts
  `toBeInViewport()`. It also asserts that the target's `boundingBox().y` is ≥ the header
  `banner`'s bottom, and on mobile ≤ the top of the fixed bottom tab bar, so the slot is not
  hidden behind either one.

## How it will be proved

| Done when | Check | Layer |
| --- | --- | --- |
| With the clock pinned to mid-afternoon on Day 1, pressing Jump to now brings the slot in progress into view | `?at=Day1T15:00`: click `jump-to-now`, then `expectInView(slot-14:45)` in list view and `expectInView(grid-slot-14:45)` in grid view. Before the click, `slot-14:45` is not in the viewport, so the scroll is what moves it there. Unit: `jumpTarget(day1Sessions, {day, time:'15:00'}) === '14:45'` | browser + unit |
| Between two slots, it scrolls to the next one to start | `?at=Day1T15:40` (between 14:45–15:30 and 16:00), list and grid: click, then `expectInView(slot-16:00 / grid-slot-16:00)`. Unit: `'15:40'` → `'16:00'`, and `'08:50'` → `'09:00'` | browser + unit |
| On a day other than today, or after the day's last slot, the button is not shown | `/schedule?day=${days[1]}&at=Day1T15:00`: `jump-to-now` has count 0, and the same URL on `days[0]` has count 1. `?at=Day1T22:15` (after the 19:00–22:00 Opening Night Reception): count 0. Unit: other day → `null`; `'22:15'` → `null` | browser + unit |
| Works in list and grid view, desktop and mobile; specs pin the clock with `?at=` | Each browser row above runs `?view=list` and `?view=grid` explicitly, under both the `desktop` and `mobile` projects. Every URL carries `&at=` | browser |

## Decisions

- The slots come from the sessions on screen, so filters apply. If a filter hides the slot in
  progress, the button jumps to the next slot shown, and it disappears when no slot shown is
  still running or ahead. Is that OK?
- The 08:00 keynote and the evening social each count as slots. On Day 1 the button stays until
  the 19:00–22:00 reception ends, so at 18:30 it jumps to that reception. Is that OK?
- The button sits in the day heading row beside *Today*, in the same place on desktop and on
  mobile. It is not a floating button, and it never scrolls on its own when the page loads. Is that OK?
- The tests pin the clock with a literal `?at=` in the URL, as the ticket words it, rather than
  with `visit({ at })`, which uses localStorage. Is that OK?

## Out of scope

- Following the clock as it ticks: pressing the button scrolls once.
- Horizontal scrolling of the grid to a room.
