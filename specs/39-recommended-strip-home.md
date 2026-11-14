# Recommended for you strip on Home

## What this changes
Home gets a **Recommended for you** section below Up next and Rate it (above Happening now and the quick links): the first 3 items from the existing recommendations endpoint, each a link to its session showing title, time, room and the reason(s), plus a **See all** link to `/for-you`. An attendee with no interests and nothing on their agenda (`needsInterests`) sees an invitation linking to `/for-you` instead. With nothing to recommend, or on error/loading, the section renders nothing (Home's `[&>:empty]:hidden` hides the empty Reveal). Switching attendee or moving the clock refetches.

## Where
- `src/components/RecommendedStrip.jsx` (new) — `useFetch(() => api.getRecommendations(currentUserId, { day: clock.day, time: clock.time }), [currentUserId, clock.day, clock.time, reservations])`, same call and deps as `ForYouPage`; take `items.slice(0, 3)`; reasons shown as `reasons.join(' · ')` exactly as `/for-you`. Cards are `Link`s to `/sessions/:id`, wrapped to `min-w-0`/`truncate` so 375px does not overflow. Test ids: `recs-strip`, `recs-item` (with `data-session-id`), `recs-reason`, `recs-see-all`, `recs-invite`.
- `src/pages/HomePage.jsx` — add `<Reveal><RecommendedStrip /></Reveal>` after `RateItPrompt`, before `HappeningNow`.
- `tests/helpers.js` — new lane `home.recs` in `LANES` (own attendees, no bookings; interests set via `PUT /users/:id/interests`); tests/unit/lanes.test.js checks lane shape.
- Test in `tests/home.spec.js` using `laneFor('home.recs')`, `visit(..., { as, at })`, `momentOn`, route mock for `needsInterests` as `tests/for-you.spec.js` does.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Same first 3, order and reasons as `/for-you` with the clock pinned | Home strip item ids and reason texts equal the first 3 `foryou-item`/`foryou-reason` on `/for-you` for the lane attendee (and are at most 3) | Playwright (`tests/home.spec.js`) |
| See all links to `/for-you`; each item links to its session | `recs-see-all` href `/for-you`; each `recs-item` link href `/sessions/<id>` | Playwright |
| No interests and no agenda sees the invitation | `recommendations` route mocked to `{ items: [], needsInterests: true }`: `recs-invite` visible with link to `/for-you`, no `recs-item` | Playwright |
| Switching attendee updates the strip | `visit` as a second attendee with different interests: item ids differ | Playwright |
| Desktop and 375px, no horizontal overflow | `scrollWidth <= innerWidth` on both projects, plus a screenshot | Playwright (desktop + mobile projects) |

## Decisions
- Show the strip nothing (no skeleton) while loading or on error, like RateItPrompt — OK?
- The invitation is shown only when the endpoint says `needsInterests`, rather than recomputing "no interests and no agenda" client-side — OK?
- Each item is a compact row (title, time, room, reason) rather than the full `SessionCard`, with no Add-to-agenda button on Home — OK?

## Out of scope
No change to ranking, the endpoint or `/for-you`.
