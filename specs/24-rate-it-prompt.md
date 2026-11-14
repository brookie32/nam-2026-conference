# Rate it prompt on Home after a session you attended

Stacked on #23 (`issue-23-happening-now-strip`): Home's order is Up next, the
new prompt, then Happening now.

## What this changes
Home shows a **Rate it** card for the most recent session the signed-in
attendee checked in to, that has ended by the clock, and that they have not
rated. It names the session (link to `/sessions/:id`, room and venue) and has
the five-star control inline. Tapping a star saves the rating through the
existing `PUT /users/:id/ratings/:sessionId` (stars only, clock in the body),
toasts "Rating saved", and the card moves to the next unrated session, or goes
away when there is none. Not checked in, not yet ended, or already rated: never
shown. Stars are tappable at 375px with no sideways scroll.

## Where
- `src/components/RateItPrompt.jsx` (new) — `useFetch(() => api.getUser(currentUserId), [currentUserId])` gives `checkIns` (ids) and `ratings`; `useFetch(() => api.getSessions(), [])` gives every session (`day`, `endsAt`, `room`, `venue`, `title`). Candidates are `checkIns` minus rated ids, filtered by `hasEnded(s, clock)` (`src/lib/clock.js`), sorted by `day`, `endsAt`, `id` descending; show the first. Ended-ness is recomputed from `clock` each tick, so no refetch per tick. A star calls `api.rateSession(currentUserId, id, { stars, ...clock })`, then `reload()` on the user fetch and a toast; on error toast `err.offline ? "You're offline" : err.message`, as `AttendancePanel.submit` does. Returns `null` with nothing to rate or before either fetch lands. `data-testid="rate-it"` on the card, `rate-it-session` on the link; stars are the `radio` buttons named "N star(s)".
- `src/components/AttendancePanel.jsx` — `export` the existing `Stars` so the prompt reuses it (no copy).
- `src/pages/HomePage.jsx` — render `<Reveal><RateItPrompt /></Reveal>` after `<Reveal><UpNextCard /></Reveal>` and before `<Reveal><HappeningNow /></Reveal>`. The wrapper's `space-y-8 [&>:empty]:hidden` still owns the gap and hides the empty `Reveal`, as it does for `UpNextCard`. No API, schema or rule change.
- `tests/helpers.js` — add lane `home.rate-it` (`agenda: false`: it checks in and rates, books nothing): desktop kenji day 0 slot `13:30`, mobile sofia day 0 slot `13:30`; confirm neither pair collides with another row via `tests/unit/lanes.test.js`.
- `tests/home.spec.js` — new `describe('Rate it prompt')` using `laneFor('home.rate-it', testInfo)`, `visit`, `momentOn`, `API`; pick the un-attended session at the lane's slot as `unattendedFor` in `tests/attendance.spec.js` does (copy the few lines), check in with `PUT /users/:id/checkins/:sessionId` at its `startsAt`, then pin the clock at its `endsAt`.
- `context/engineering-context/attendance.md` (Client) and `ui.md` (HomePage) — say Home hosts the prompt and where its list comes from.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Clock pinned after a session the attendee checked in to, the prompt shows it; rating it saves and updates the prompt | check in at `startsAt`, visit `/` at `endsAt`: `rate-it-session` shows that title; click "4 stars"; `GET /users/:id` `ratings` contains `{ sessionId, stars: 4 }`, toaster says "Rating saved", and `rate-it` no longer shows that title | Playwright, `tests/home.spec.js` |
| Not checked in, or not yet ended, never appear | at the same `endsAt`, shown title is the one expected from `GET /users/:id` + `GET /sessions` (latest ended, checked in, unrated); with the clock mid-session (`startsAt` + 5 min, checked in but running) that running session's title is not in `rate-it`; at 08:00 on day 0 `rate-it` has count 0 | Playwright, `tests/home.spec.js` |
| With nothing to rate, no prompt shows | after the rating above, each further `rate-it-session` is rated in turn through the star control until `rate-it` has count 0 (the seed's own unrated check-ins, if any, are cleared the same way) | Playwright, `tests/home.spec.js` |
| Works on desktop and at 375px, clock pinned, dedicated attendee | the specs above run in both projects on lane `home.rate-it`; on mobile `scrollWidth <= clientWidth` and the five stars sit inside the viewport width | Playwright (mobile project), `tests/home.spec.js` |

## Decisions
- "With nothing to rate, no prompt shows" already holds on main as written (nothing renders it), so on its own it proves nothing. The build proves it as the end of the rate flow, after the last unrated session is rated, plus the pre-day 08:00 case — OK?
- Offer every session the attendee checked in to, whether or not they hold a seat (the API allows rating after any check-in), taking ids from `GET /users/:id` rather than `/schedule` or `/today`, which list seats only — OK?
- Include sessions from earlier days, ordered by day then end time, rather than only the clock's day — OK?
- One tap on a star saves immediately with no comment; adding a comment or changing the stars stays on the session page's rating form — OK?

## Out of scope
Changing `/api/users/:id/ratings`, check-in rules, or the rating form on the session page; a "skip" or dismiss control; showing more than one session at a time.
