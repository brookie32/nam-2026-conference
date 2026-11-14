# Happening now strip on Home

## What this changes
Below the Up next card, Home gains a **Happening now** strip. It lists the
sessions `/api/live` says are running at the clock's `day` and `time`, in the
order the API returns them, each a link to `/sessions/:id` showing room and
venue with a LIVE badge. The latest posted announcement sits inside the same
strip (the pinned-first, posted-by-the-clock choice `LatestAnnouncement` makes
today), so the separate announcement block lower down goes away. When nothing is
running, the strip says so and links to `/schedule?day=<clock.day>`; the wording
branches on `dayStartsAt` / `dayEndsAt` (before the first slot, after the last,
or between slots), not on array lengths. At 375px rows truncate and the page does
not scroll sideways.

## Where
- `src/components/HappeningNow.jsx` (new) — `useFetch(() => api.getLive(clock), [clock.day, clock.time])`; keep the last answer while refetching, as `UpNextCard` does. Rows reuse `LiveBadge` and the `UpNextCard` link/meta style. Takes over the announcement markup and logic from `LatestAnnouncement` (keep `data-testid="announcements"` on it); strip is `data-testid="happening-now"`, rows `happening-now-session`, empty message `happening-now-empty`.
- `src/pages/HomePage.jsx` — delete `LatestAnnouncement`; render `<Reveal><HappeningNow /></Reveal>` directly after `<Reveal><UpNextCard /></Reveal>`. The wrapper's `space-y-8` still owns the gap; the strip is never empty, so `[&>:empty]:hidden` does not apply.
- `context/engineering-context/clock.md` ("no UI calls it yet") and `ui.md` (HomePage) — update to say Home uses `/live`.
- Tests in `tests/home.spec.js` using `visit`, `momentOn`, `conferenceDays`, `API` from `tests/helpers.js`; read-only, so no data lane. The mobile project covers 375px via `testInfo.project.name`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Clock pinned mid-session on Day 1, strip lists exactly the sessions `/api/live` returns, each linked | at `momentOn(0, '10:30')`, fetch `${API}/live`; `happening-now-session` titles and `/sessions/:id` hrefs equal `happeningNow` in order | Playwright, `tests/home.spec.js` |
| With nothing live, the empty message shows | at `momentOn(0, '23:00')`, `happening-now-empty` is visible with a link to `/schedule?day=<day 1>`, zero `happening-now-session` | Playwright, `tests/home.spec.js` |
| The latest announcement is shown | at `momentOn(0, '10:30')`, `announcements` inside `happening-now` shows the title the API's pinned-first, latest-posted-by-the-clock rule picks | Playwright, `tests/home.spec.js` |
| Works on desktop and at 375px, clock pinned | the specs above run in both projects; on mobile `scrollWidth <= clientWidth` and the strip is inside the viewport width | Playwright (mobile project), `tests/home.spec.js` |

## Decisions
- Move the latest announcement into the strip and remove the standalone block lower on Home, rather than showing it twice — OK?
- The existing home test "nothing live is on it" asserts `live-now` is absent; keep that id unused and rename the test to say only the old live panels stay off Home (the new strip uses `happening-now`) — OK?
- Empty state shows when `happeningNow` is empty at any time, including gaps between slots, with the wording varying (not started / between sessions, next at HH:MM / day is over) — OK?

## Out of scope
Changing `/api/live` or `/api/announcements`; showing Up next sessions in the strip.
