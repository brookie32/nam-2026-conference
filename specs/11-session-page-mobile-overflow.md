# Session page scrolls sideways on phones

## What this changes
On a phone, `/sessions/:id` fits the screen: no sideways scroll, and the seat
panel, room/topic/tag chips and details wrap inside the viewport. Today, at
375px, the page grid's single implicit column sizes to its widest unbreakable
content (394px inside a 333px container) and the document is ~409px wide. At
`lg` and up the page is unchanged: main column plus a 20rem sticky `aside`.

## Where
- `src/pages/SessionPage.jsx` — the two-part grid at line ~153,
  `grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]` → add a shrinkable single
  column below `lg`: `grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]`.
  No other markup changes; the `lg:` template still overrides at `lg+`.
- Test in `tests/session.spec.js`, inside the existing `Session detail`
  describe, read-only (books nothing, so no lane):
  - **phone test** — `test.skip(testInfo.project.name !== 'mobile', 'phone layout')`,
    `page.setViewportSize({ width: 375, height: 667 })` (as in `tests/tabbar.spec.js`).
    Picks sessions at runtime from `request.get(\`${API}/sessions\`)`: the first
    `isKeynote`, the one with the most `tags`, and the first `isFull`. For each,
    `visit(page, \`/sessions/${id}\`)`, wait for `session-title`, then assert
    `document.documentElement.scrollWidth - clientWidth <= 1` (same expression as
    `tests/smoke.spec.js`), and that the `aside` and the last tag chip in it have
    `boundingBox().x + width <= 375`.
  - **desktop guard** — `test.skip(testInfo.project.name !== 'desktop', …)`, on one
    session: the `aside` is 320px wide and its `x` is right of the main column's
    right edge (two columns side by side), and no horizontal overflow.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| At 375px, `/sessions/:id` for a keynote, a many-tag talk and a full session has scroll width = viewport width | phone test: `scrollWidth - clientWidth <= 1` for each of the three (false on main: ~409 vs 375) | Browser (mobile project) |
| Seat panel, tags and details wrap within the screen | phone test: `aside` and its last tag chip end at x <= 375 (false on main: aside is 394px wide) | Browser (mobile project) |
| At `lg` and up the page looks as it does today | desktop guard: aside 320px wide, beside the main column, no overflow (a regression guard — holds on main, see Decisions) | Browser (desktop project) |
| A mobile spec asserts no horizontal overflow on the session page | the phone test itself, in `tests/session.spec.js` | Browser (mobile project) |

## Decisions
- "At `lg` and up the page looks as it does today" already holds on main and must keep holding; it is proved by a desktop guard on the aside's width and position rather than a pixel snapshot, and is the one row not red on main.
- The phone test pins 375×667 inside the `mobile` project (393px wide by default), the width the ticket names.
- The three sessions are chosen at runtime from `/api/sessions` (first keynote, most tags, first full) rather than hard-coded ids, so a reseed cannot hollow the test.
- `/sessions/:id` is not added to the `tests/smoke.spec.js` route list; the new test lives with the other session-detail tests.

## Out of scope
Overflow on other pages; any change inside `SeatPanel`, `AttendancePanel` or the header.
