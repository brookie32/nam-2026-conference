# Add my agenda to calendar button on My Agenda

## What this changes
My Agenda gets an **Add my agenda to calendar** button next to the page title. It is a plain link to the signed-in attendee's `/api/users/:id/agenda.ics`, so tapping it downloads the calendar file. An attendee with no confirmed seat sees no button, only the existing empty state. At 375px it wraps under the title with no horizontal scroll.

## Where
- `src/pages/MyAgendaPage.jsx` — in `MyAgendaPage`, pass `action` to the `SectionHeader`: a `Button href={api.agendaCalendarUrl(currentUserId)}` with `Icon name="calendar"` (same markup as the session page's "Add to calendar" button), rendered only when `days.some((d) => d.sessions.some((s) => s.reservation === 'confirmed'))` and there is no `error`/loading skeleton. Give it `data-testid="agenda-calendar"`. `SectionHeader` already wraps (`flex-wrap`) so no layout change is needed.
- `src/lib/api.js` — `agendaCalendarUrl` already exists; unchanged.
- Test in `tests/agenda.spec.js` — extend the existing page test (lanes: Jonas's seeded plan read-only; `agenda.page` lane and the `page.route` empty-schedule mock already there). Seeded-plan visit: assert the link's `href` is `/api/users/${ATTENDEES.jonas}/agenda.ics`, then fetch that `href` with `request` and assert `text/calendar`, `BEGIN:VCALENDAR` and one `VEVENT` per confirmed session in the payload. Empty-state visit: assert `agenda-calendar` has count 0. In the mobile project, assert the button's box lies inside the viewport (`boundingBox().x + width <= 375`) and `scrollWidth <= clientWidth`, and call `shotForPR`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| With reservations, the button's link points at the attendee's `agenda.ics` | `getByTestId('agenda-calendar')` has `href` `/api/users/<jonas>/agenda.ics` (false today: no such element) | Playwright, `agenda.spec.js` |
| ...and the response is a valid calendar containing their confirmed sessions | fetch the link's href; `VEVENT` count equals the payload's confirmed sessions (the endpoint already does this; the row proves the link reaches it) | Playwright, `agenda.spec.js` |
| With none, the button is not shown | empty-schedule mock: `agenda-calendar` count 0, in the same test whose first half needs the button present | Playwright, `agenda.spec.js` |
| Works on desktop and at 375px | mobile project: button fully inside the viewport, no horizontal overflow | Playwright mobile project, `agenda.spec.js` |

## Decisions
- The calendar response already holds today: `/users/:id/agenda.ics` returns a valid calendar of confirmed sessions (`tests/api/calendar.test.js`). Is it right that this build proves the link reaches that response rather than re-testing the endpoint?
- The export contains confirmed seats only, so should the button also be hidden for an attendee whose only reservations are waitlist places, rather than offering an empty calendar?

## Out of scope
Changing `agendaCalendar` or the endpoint, and any per-day or per-session export.
