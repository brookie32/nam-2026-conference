# My Agenda page: your sessions by day

## What this changes
`/my-agenda` stops being a "Coming soon" placeholder. An attendee sees their reserved sessions grouped by day in time order, each as a `SessionCard variant="row"` with its attendance state. Each day shows confirmed hours and waitlisted time apart ("+Nh waitlisted"), flagged clashes and venues visited. Waitlisted rows show "Position N of M" and are styled apart from confirmed seats. Today's day comes first, with the in-progress or next confirmed session highlighted. Removing a session drops its row at once. With no reservations the page offers a link to the schedule.

## Where
- `src/lib/agenda.js` (new) — `agendaDays(days, reservationFor)`: re-filters each fetched day through `reservationFor(s.id)`, sets each session's `reservation` from the store, recomputes `conflicts` (pairwise overlap, both statuses, as `agenda.js:clashesIn`), `totalMinutes` (confirmed), `waitlistedMinutes`, `venuesVisited`, drops empty days. Also `orderDays(days, today)` (today first, rest by date) and `focusSession(day, nowHHMM)` (the in-progress confirmed session, else the next confirmed one that starts after now); test in `tests/unit/agenda.test.js` (node:test, pure functions, as `tests/unit/travel.test.js`).
- `src/lib/api.js` — add `getSeatState(userId, sessionId)` for the existing `GET /users/:id/reservations/:sessionId` (it returns `waitlistPosition` and `waitlistCount`). No server change.
- `src/pages/MyAgendaPage.jsx` — replace the placeholder. `useFetch(() => api.getSchedule(currentUserId), [currentUserId])`, `useConference()` for `reservationFor`, `clock`, `seatsFor`. Per day: header (`dayLabel`), `agenda-day-hours`, `agenda-day-waitlisted`, `agenda-day-clashes` plus a `data-clash` flag on the two rows involved, `agenda-day-venues`. Rows: `SessionCard variant="row"` with `attendance={{ ended: hasEnded(s, clock), checkedIn, myStars }}` for confirmed seats only. Waitlisted rows add `agenda-position` ("Position N of M") from `seatsFor(id)?.waitlistPosition`, else `getSeatState`. The focus row carries `data-testid="agenda-focus"`. Empty: `EmptyState` (`agenda-empty`) with `Button to="/schedule"`. Remove `agenda-coming-soon`.
- `tests/home.spec.js` — delete "My Agenda is a blank canvas"; keep a nav + `/my-plan` redirect check in `tests/agenda.spec.js`.
- `tests/agenda.spec.js` (new), lane `agenda.page` in `tests/helpers.js` `LANES` (`marcus` day 2 desktop, `andy` day 1 mobile: grep every `LANES` row first, `tests/unit/lanes.test.js` enforces it). Helpers: `visit`, `momentOn`, `laneFor`, `bookableFor`, `clearAgendaFor`.
- `context/engineering-context/agenda.md` — replace the placeholder paragraph with the page.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Reservations by day, in time order, confirmed hours and waitlisted time apart | `agendaDays` on a fixture with two days, unsorted starts, one confirmed and one waitlisted session: days ordered, minutes split, empty day dropped. Browser, Jonas read-only: `agenda-day-hours` and `agenda-day-waitlisted` equal the `/schedule` payload's `totalMinutes` and `waitlistedMinutes` per day, rows in `startsAt` order | unit `agenda.test.js`; Playwright `agenda.spec.js` |
| Waitlisted shows its position; a clash is flagged | Lane attendee waitlists a full session via the API, takes a confirmed seat in the same slot (the guard counts confirmed seats only), opens the page: `agenda-position` reads "Position N of M" with N from the seat-state API, `agenda-day-clashes` shows 1 and both rows carry `data-clash`. Unit: `agendaDays` flags the pair | Playwright `agenda.spec.js`; unit |
| Removing a session removes it immediately, no reload | Same test: click the row's `release-seat`, row gone, hours and clash cleared, no navigation or reload. Unit: `agendaDays` with the id absent from `reservationFor` drops it and recomputes | Playwright `agenda.spec.js`; unit |
| No reservations shows the empty state | `page.route` returns `{ days: [] }` for `/schedule`: `agenda-empty` visible with a `/schedule` link. Unit: no days gives `[]` | Playwright `agenda.spec.js`; unit |
| Clock pinned: today's next or in-progress session is highlighted | Jonas, `momentOn(0, '10:30')`: `agenda-focus` is the id `focusSession` derives from the payload; `momentOn(0, '07:00')` the first confirmed session of the day; a pin on day 2 puts that day's heading first. Unit: `focusSession` in-progress, between, and after the last | Playwright `agenda.spec.js`; unit |
| Works on desktop and at 375px | Both projects run every browser test; the mobile one asserts `scrollWidth <= clientWidth` with a waitlisted row and a clash flag shown | Playwright `agenda.spec.js` |

## Decisions
- Take the waitlist position from the existing `GET /users/:id/reservations/:sessionId` rather than adding it to the `/schedule` payload, so the API stays as it is — OK?
- Highlight only confirmed sessions, never a waitlist place — OK?
- When today (the clock's day) has no reservations, list days by date with no "today" first — OK?
- Show clashes as a per-day count plus a flag on the two rows, rather than a separate dialog — OK?
- The "+Nh waitlisted" figure shows only when `waitlistedMinutes` is above zero — OK?

## Out of scope
Up next on Home, calendar export button, venue travel warning, rating prompt and the other tickets in the list; the `.ics` and `/today` endpoints are untouched.
