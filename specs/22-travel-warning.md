# Travel warning between venues on My Agenda

## What this changes
On My Agenda, between two consecutive confirmed sessions on a day that are at different venues, a note appears: the fastest mode and its time, and the gap you have. When the gap is shorter than that time it is a warning ("You'll need ~27 min by Rideshare; you have 15"); otherwise a plain note ("~27 min by Rideshare to The Foundry; you have 30"). Same-venue neighbours show nothing. It wraps on a 375px screen.

## Where
- `src/lib/agenda.js` — new `travelNotes(sessions, travel)`: takes a day's sessions in start order, keeps `reservation === 'confirmed'`, and for each adjacent pair calls `travel.js:assessTravel({ travel, from, to, gapMinutes: toMinutes(to.startsAt) - toMinutes(from.endsAt) })`. Returns a `Map` of the later session's id to `{ from, to, gapMinutes, fastest, warn }` where `warn = !fastest.fits`; pairs where `assessTravel` is null, or the gap is negative (a clash, already flagged), are left out. Test in `tests/unit/agenda.test.js` (node:test, hand-built sessions with `venue.id` and `room.walkMinutes`, same shape as `tests/unit/travel.test.js`).
- `src/pages/MyAgendaPage.jsx` — `AgendaDay` reads `travel` from `useConference()`, calls `travelNotes(day.sessions, travel)`, and renders an `<li data-testid="agenda-travel" data-state="warn|ok" data-from data-to>` before the later session's `agenda-row`. Amber text and an `Icon` for a warning, muted for the plain note; text wraps (`min-w-0`, no fixed width). Test in `tests/agenda.spec.js` using `visit(page, '/my-agenda', { as })` and `ATTENDEES`, read-only, no lane: the expected notes are worked out from the `/users/:id/schedule` and `/bootstrap` payloads inside the test, like `expectedFocus`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Consecutive sessions at different venues show the right mode and time from `venue_travel` | `travelNotes` returns the fastest option's mode and `minutes + walkMinutes` for Aurora to Foundry, and the return leg uses the Foundry-to-Aurora row | unit (`tests/unit/agenda.test.js`) |
| The same, seen on the page | Jonas (day index 3, 2026-11-17: Aurora 09:45 to Foundry 10:15) shows one `agenda-travel` whose text names the mode and total taken from the `/bootstrap` travel rows and the target session's `walkMinutes` | Playwright, desktop and mobile |
| Gap too short gives the warning, long enough gives the plain note | Unit: gap 15 against 28 gives `warn`, gaps 28 and 30 do not. Page: Abraham (day index 2, 2026-11-16: Foundry 08:45 to Aurora 09:00) has `data-state="warn"`, Jonas has `data-state="ok"` | unit and Playwright |
| Same-venue neighbours show no note | Unit: two Aurora sessions give an empty map. Page: the number of `agenda-travel` notes on each day equals the number of cross-venue confirmed neighbours computed from the payload (waitlisted rows skipped), for Jonas and Abraham | unit and Playwright |
| Works on desktop and at 375px | The page test runs on both projects, and asserts the note is visible and the page has no horizontal overflow | Playwright (`mobile` project) |

## Decisions
- Show the time as the journey plus the walk to the room (`minutes + walkMinutes`, what `assessTravel` compares the gap with), not the bare `venue_travel` minutes — OK?
- "Consecutive" means adjacent confirmed sessions on the same day, however long the gap; waitlisted places are ignored — OK?
- A pair that overlaps (negative gap) gets no travel note, because the clash is already flagged — OK?
- The fastest mode is the one with the lowest total, which can be Rideshare where the ticket's example says taxi — OK?

## Out of scope
Server changes, the session page's own travel notice, and the `Walk` mode (ignored by `assessTravel`).
