# Fill my gaps: talks that fit the free time in your day

## What this changes
On My Agenda, between an attendee's first and last confirmed sessions of a day, each free stretch of 45 minutes or more becomes a row: "You're free 14:45-16:00", with up to 3 talks that fit inside it, each with the usual seat button. Taking a seat refetches, so the gap row disappears (or shrinks to what is left). Gaps already over by `clock` are not shown. Waitlist places never fill a gap. Stacked on #46: the suggestions use its rating-aware ranking.

A suggestion starts and ends inside the gap, is not full, is not a keynote or social, is reachable from the previous session's venue (`assessTravel` not `impossible`; same venue, or a pair with no route data, is reachable), and comes from the existing `rankRecommendations` order. Talks at the same venue as the session before or after the gap are listed first, ranking order kept within each group.

## Where
- `server/lib/gaps.js` (new) — three exports. `findGaps(sessions, now, { min = 45 })` is pure: takes one attendee's sessions, keeps `status === 'confirmed'`, groups by day, drops days before `now.day`, sorts by start, walks them tracking the latest end so far, and returns `{ day, startsAt, endsAt, minutes, before, after }` for each stretch of >= `min` between two sessions; on today, a gap whose end is <= `now.time` is dropped. `suggestForGap({ gap, ranked, travel, now })` is pure: filters `ranked` (`[{ session, reasons }]`) to `startsAt >= max(gap.startsAt, now if today)` and `endsAt <= gap.endsAt`, not full, `assessTravel({ travel, from: gap.before, to: session, gapMinutes: toMinutes(session.startsAt) - toMinutes(gap.before.endsAt) })` null or not `impossible`; stable-sorts same-venue (as `before` or `after`) first; slices 3. `gapsFor(userId, now)` loads the data and returns `{ gaps: [{ ...gap-without-sessions, previousId, nextId, suggestions }] }`; it imports `assessTravel` from `../../src/lib/travel.js` (pure, no browser code) and `toTravel` from `./query.js` over `SELECT * FROM venue_travel`.
- `server/lib/recommend.js` — `rankRecommendations` takes an optional `limit` (default `LIMIT`) so the gap code can rank every candidate and not just the top 10; a `recommendationsFor`-style loader exported for reuse (`rankedFor(userId, now, limit)`), with `recommendationsFor` calling it. Behaviour for `/recommendations` is unchanged.
- `server/routes/users.js` — `GET /:id/gaps?day=&time=` beside `/recommendations`: 404 unknown attendee, 400 no `day`, `time` defaults to `00:00`, calls `gapsFor`.
- `src/lib/api.js` — `getGaps(userId, { day, time })`, next to `getRecommendations`.
- `src/pages/MyAgendaPage.jsx` — fetch `api.getGaps` keyed on `[currentUserId, clock.day, clock.time, reservations]` (same refetch as `ForYouPage`); `AgendaDay` renders a `GapRow` (`data-testid="agenda-gap"`, `data-start`, `data-end`) as a sibling `<li>` right after the row whose id is `previousId`, in the same `space-y-2` list so spacing is unchanged. Suggestions are `agenda-gap-item` (`data-session-id`) wrapping `SessionCard variant="row"` (which already carries the seat button) and the `reasons` line. The row stacks (title above list) with no fixed widths so it holds at 375px. Gaps for a day come from the server only for days the page already shows.
- Tests: `tests/unit/gaps.test.js` (new; hand-built sessions, no database, no lane); `tests/api/gaps.test.js` (new; `startApi`, `clearAgenda` from `tests/api/harness.js`, books via `POST` reservations and queries `/users/:id/gaps` at a pinned `day`/`time`); `tests/agenda.spec.js` gains one test on a new lane `agenda.gaps` in `tests/helpers.js` `LANES` (builder picks an attendee+day that `tests/unit/lanes.test.js` accepts; the test reads the gap from the page, takes the first suggestion, and asserts that gap's `data-start`/`data-end` row is gone; it pins the clock with `momentOn` and runs on both projects, so 375px is covered, plus a bounding-box check that the row stays inside the viewport width).
- Docs: `context/engineering-context/agenda.md` gets the endpoint and the page row.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Gaps are found between confirmed seats only; waitlist places do not fill a gap | `findGaps` with a confirmed 09:00-10:00, a waitlisted 11:00-12:00 and a confirmed 13:00-14:00: one gap 10:00-13:00, and a <45 min gap is not returned | unit |
| Suggestions fit inside the gap | `suggestForGap` drops a candidate that starts before or ends after the gap, and a full one; at most 3 returned | unit |
| Unreachable ones (travel time) are excluded | previous session at the other venue, a candidate starting sooner than `assessTravel`'s fastest option allows is dropped, one starting later is kept | unit |
| Same-venue ones rank first | a lower-ranked same-venue candidate is listed ahead of a higher-ranked other-venue one | unit |
| Past gaps are hidden | `findGaps` with `now` after a gap's end on the same day returns it no more; an earlier day returns none; a later day keeps them | unit |
| The endpoint reports them for a real attendee at a pinned clock | API: after `clearAgenda` and booking two seats with a 60+ min hole, `/users/:id/gaps?day=&time=` lists that gap with <= 3 suggestions, each within it; a waitlisted place in the hole leaves it listed; a 404 for an unknown attendee and 400 without `day` | API |
| With the clock pinned, My Agenda shows the gap with up to 3 suggestions; taking one removes the gap row | browser: the `agenda-gap` row with its `agenda-gap-item`s (1-3) is visible; clicking a suggestion's seat button makes the row with that `data-start`/`data-end` disappear | browser |
| Works on desktop and at 375px | same browser test on both projects: the gap row's right edge is within the viewport width | browser |

## Decisions
- Should a gap show with no suggestions (when nothing fits or matches) rather than being hidden, so "You're free 14:45-16:00" is still said?
- Is suggesting only talks that already score above 0 in `rankRecommendations` (a picked interest, followed speaker, or topic shared with your agenda or ratings) right, rather than any open talk that fits?
- Should a gap that is under way now (started, not over) still show, with only talks that have not started offered?
- Is reachability measured only from the session before the gap, as the ticket says, with no check that the talk gets you to the session after it?

## Out of scope
Gaps before the first or after the last session of a day; gaps from waitlist places; any change to `/recommendations` output, the Home page or `/today`'s `openSlot`/`suggestions`.
