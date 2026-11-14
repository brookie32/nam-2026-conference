# Up next for you on Home

## What this changes
Home gains an "Up next for you" card, directly under the hero bar, for the signed-in attendee. It shows their in-progress confirmed session if there is one, else their next confirmed session today: title, room, venue, and `relativeToNow` ("in 12 min" / "started 8 min ago"). From 15 minutes before the start until the end, and only if not yet checked in, it offers **Check in**; once in, it says "Checked in". With nothing left today it says so and links to `/schedule?day=<clock.day>`. It refetches when the attendee or the clock changes. Single column, full width, so it fits at 375px.

## Where
- `src/components/UpNextCard.jsx` (new) — `UpNextCard()`: `useFetch(() => api.getToday(currentUserId, clock), [currentUserId, clock.day, clock.time])` (`api.getToday` already exists); pick `data.current ?? data.next`. For that session a second `useFetch(api.getAttendance(...))` keyed on session id and clock, as in `AttendancePanel.jsx`, so the window is the server's `attendanceState.canCheckIn`/`checkedIn`, not a client copy of the 15-minute rule. Check in calls `api.checkIn(currentUserId, id, clock)` then reloads both fetches; failures toast as `AttendancePanel` does. Time text from `relativeToNow(startsAt, clock.time)` in `src/lib/clock.js`; room/venue from `session.room.name` and `session.venue.shortName`. Returns `null` until the first response; testids `up-next`, `up-next-session`, `up-next-checkin`, `up-next-checked-in`, `up-next-empty`.
- `src/pages/HomePage.jsx` — `HomePage()`: render `<Reveal><UpNextCard /></Reveal>` between `HeroBar` and `QuickLinks`; the container's `[&>:empty]:hidden` already hides an empty wrapper.
- `tests/home.spec.js` — new tests; "nothing on it is personal or live" is rewritten (the card is now personal): drop `next-up` from its absent list is not needed since the id is `up-next`, but its title and comment change.
- `tests/helpers.js` — add lane `home.up-next` to `LANES` (`agenda: false`, distinct attendee+day from other lanes; `tests/unit/lanes.test.js` enforces this), for the one test that checks in.
- `context/engineering-context/ui.md` — update the `HomePage` paragraph ("static" is no longer true); `agenda.md` — note the card now calls `/today`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Pinned before the next session, the card shows session, room and time until start | Jonas at `momentOn(0,'07:00')`: `up-next-session` contains the title, room name and venue of `/users/1/today?...`'s `next`, and "in <n>" text from its `startsAt` | Playwright, `home.spec.js` |
| Inside the window Check in works and the card reflects it; outside, no button | lane attendee's seeded unattended session: clock 20 min before start, `up-next-checkin` count 0; clock 10 min before, button visible, click, `up-next-checked-in` visible and button gone; at 07:00 no button for Jonas | Playwright, `home.spec.js` |
| With no more sessions today, empty message and schedule link | Jonas at `momentOn(0,'23:00')`: `up-next-empty` visible, link `href` is `/schedule?day=<day>` | Playwright, `home.spec.js` |
| Switching attendee updates the card | open as one attendee, switch via the header switcher (see `switcher.spec.js`) to one whose next session differs, card title changes | Playwright, `home.spec.js` |
| Desktop and 375px, clock pinned | all of the above run in both projects (`visit(..., { at })`); mobile asserts `scrollWidth <= clientWidth` with the card shown | Playwright, `home.spec.js` |

## Decisions
- When a session is in progress, show it (with "started N min ago") rather than skipping to the following one — OK?
- Show the card only for confirmed seats, never waitlisted ones (matches `today.current`/`next`) — OK?
- Check-in availability comes from the attendance endpoint rather than being recomputed on the client — OK?

## Out of scope
The My Agenda page, the "Happening now" strip, rating prompts and travel warnings.
