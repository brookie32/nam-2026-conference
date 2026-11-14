# For you: pick your interests and get recommended talks you can still attend
## What this changes
A new `/for-you` page, linked from the desktop nav and the mobile menu. An attendee ticks tracks and topics (saved per attendee, so they survive a reload and an attendee switch-back). Below, up to 10 sessions they can still get into: upcoming, not full, not on their agenda, not clashing with a confirmed seat. Each shows why it was picked ("Agents track · you follow Delphine Vandenberg") and the normal seat button; taking the seat adds it to My Agenda and drops it from the list. With no interests and nothing on the agenda the page asks them to pick interests first.

## Where
- `server/db.js` — add `user_interests (user_id, kind 'track'|'tag', slug, PK all three)` to `SCHEMA` beside `speaker_follows` (~line 192), and `DROP TABLE IF EXISTS user_interests` in `dropAll()` (~line 272). The existing `users.interests` text column (seeded, exposed by `toUser`) is left alone.
- `server/lib/query.js` — `toInterests(rows)` mapper returning `{ tracks: [slug], tags: [slug] }` (camelCase, no snake_case leaks).
- `server/lib/recommend.js` (new) — pure `rankRecommendations({ sessions, interests, followedSpeakerIds, agendaTagSlugs, now })`, plus `recommendationsFor(userId, now)` that loads the data (reuse `SESSION_SELECT`/`hydrateSessions` from `query.js`, `reservedEver` pattern from `server/lib/agenda.js`) and calls it. Filters: ended (same rule as `src/lib/clock.js:hasEnded`, server-side), `seats_taken >= capacity`, any reservation of this user (either status), overlap with a **confirmed** seat on the same day (`a.startsAt < b.endsAt && b.startsAt < a.endsAt`), keynotes and socials. Score: picked track/topic and followed speaker above agenda-derived tags (the `myTopics` idea in `agenda.js`); score 0 is dropped; ties by `avgRating` desc then id; top 10. Each item `{ session, reasons: [string] }`; result `{ items, needsInterests }` where `needsInterests` is true with no picked interests and no reservations.
- `server/routes/users.js` — `GET /:id/interests`, `PUT /:id/interests` (body `{ tracks, tags }`, unknown slugs 400, replaces the set in a transaction, 404 unknown user), `GET /:id/recommendations?day=&time=` (same query shape as `/today`).
- `src/lib/api.js` — `getInterests(userId)`, `saveInterests(userId, body)`, `getRecommendations(userId, { day, time })` next to `getToday`.
- `src/pages/ForYouPage.jsx` (new) + `<Route path="for-you">` in `src/App.jsx` — track/topic chips from `useConference()` `tracks`/`tags` (kind `topic`); refetches on current attendee, `clock` and `reservations` change; renders `SessionCard variant="row"` (its seat button already calls `toggleSeat`) with a reason line under each. Testids: `foryou-interest` (`aria-pressed`), `foryou-item` (`data-session-id`), `foryou-reason`, `foryou-empty`.
- `src/components/Layout.jsx` — add `{ to: '/for-you', label: 'For you', icon: 'sparkle' }` to `NAV` (line ~9; the mobile menu reads it, `TABS` stays four). Layout is a single column at 375px, chips wrap, no new wrapper around an existing grid.
- Tests (new): `tests/unit/recommend.test.js` (`node --test`, ranking and reasons with hand-built sessions); `tests/api/recommendations.test.js` (`startApi()` from `tests/api/harness.js`, `clearAgenda(api, id)` for the empty case); `tests/for-you.spec.js` (Playwright). Also add the three routes to `tests/api/endpoints.test.js` and `/for-you` to the route list in `tests/smoke.spec.js` (~line 10).
- Browser lanes in `tests/helpers.js` `LANES`: `foryou.interests` (`agenda: false`, writes interests only) and `foryou.seat` (books). Day 3 is already held by all six attendees, so pin the clock at day 3 on a late `slot` (`momentOn(3, '…')`) so every upcoming recommendation falls on that slot, and pick the attendee/slot pair by grepping the whole `LANES` table as testing.md's Gotchas say; `tests/unit/lanes.test.js` must stay green. Use `visit(page, '/for-you', { as, at })`, `laneFor`, and release the booked seat in `finally`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Interests save | `PUT` then `GET /users/:id/interests` returns the picked slugs; a second attendee is unaffected; unknown slug is 400 (all 404 on main) | API (`recommendations.test.js`) |
| Survive reload and switch-back | tick two chips, `page.reload()`, chips still `aria-pressed`; switch attendee (none pressed), switch back (pressed) | Browser (`for-you.spec.js`) |
| Every recommendation upcoming, not full, not booked, not clashing | pinned `day`/`time`: one test per exclusion, each naming a session the seed makes ineligible (ended earlier today, a full session, one on the agenda, one overlapping a confirmed seat) and asserting it is absent while an eligible control is present; at most 10 | API (`recommendations.test.js`), plus the same filters on hand-built sessions in `recommend.test.js` |
| Matches rank above non-matches, each shows its reason | pure function: a followed-speaker and a picked-track session outrank an agenda-only match and a rating-only one, reason strings name the track/speaker; page shows a non-empty `foryou-reason` per item | Unit (`recommend.test.js`) + browser |
| Taking a seat adds to My Agenda, leaves the list | click the seat button on the first `foryou-item`; item gone, `/my-agenda` has an `agenda-row` with that `data-session-id` | Browser (`for-you.spec.js`, lane `foryou.seat`) |
| Empty state | after `clearAgenda` with no interests the API returns `needsInterests: true`, `items: []`; the browser test fulfils that response with `page.route` and asserts `foryou-empty` (seeded attendees all have plans, so a real empty attendee is not available on a shared lane) | API + browser |
| Desktop and 375px, pinned clock, own lane | the spec runs on both Playwright projects; `smoke.spec.js` asserts no overflow or console errors on `/for-you` | Browser |

## Decisions
- The ticket asks for a new table, but `users.interests` already exists, seeded and returned by `toUser`. Leave that column untouched and store the picks in `user_interests`, so the seeded free text is not reinterpreted — OK?
- Keynotes and socials are never recommended (as `openInSlot` in `agenda.js` does), since everyone is already in the keynote — OK?
- Only sessions with a positive match (picked track/topic, followed speaker, or tag from the agenda) are listed, so the list may hold fewer than 10 — OK?
- The empty state is proved in the browser with a stubbed response, because the real empty case needs an attendee with no agenda and the seed gives none — OK?

## Out of scope
Changing My Agenda's own suggestions, editing the seeded `users.interests`, and any change to how seats are taken.
