# Recommendations learn from your ratings

## What this changes
An attendee's own 1-5 star ratings now move their recommendations. A candidate that shares a topic or a speaker with a session they rated 4-5 stars gains score, and one sharing with a 1-2 star session loses it; 3 stars changes nothing. The card's reason line gains the new reason, e.g. "you rated Reranking, Honestly 5★" (or "... 1★"), on `/for-you` and the Home strip. No other UI change: both already print `reasons.join(' · ')`.

Weight: a new `RATED = 2`, between `FROM_AGENDA = 1` and `PICKED = 3`. The ratings adjustment is summed over the rated sessions a candidate shares with, then clamped to +/-`RATED`, so it can never reach a pick's 3 on its own and an explicit pick always leads. Tags counted are `kind === 'topic'` (as `agendaTagSlugs` does); speakers match by id.

## Where
- `server/lib/recommend.js` — `rankRecommendations`: new input `rated` (`[{ id, title, stars, tags, speakers }]`, default `[]`); after the `FROM_AGENDA` line, for each rated session with stars != 3 that shares a topic tag slug or speaker id with `s`, add the signed delta and push the reason `you rated ${title} ${stars}★`; clamp the total delta to +/-`RATED`; add the clamped delta to `score`. A candidate whose score ends <= 0 stays excluded (existing `score > 0` test). The `needsInterests` early return is unchanged.
- `server/lib/recommend.js` — `queries()`: new `rated` statement (`SESSION_SELECT JOIN ratings r ON r.session_id = s.id AND r.user_id = ?`, with `r.stars`); `recommendationsFor` hydrates it with `hydrateSessions`, re-attaches `stars` by session id the way `status` is attached to `booked`, and passes `rated`.
- Route `server/routes/users.js` `GET /:id/recommendations` needs no change; it already calls `recommendationsFor`. `RecommendedStrip.jsx` and `ForYouPage.jsx` need no change.
- Unit tests in `tests/unit/recommend.test.js` using its `session()`, `topic()` and `rank()` helpers (no database, no lane).
- API test in `tests/api/recommendations.test.js` using `startApi`, `clearAgenda`, `attendedSession` (all `tests/api/harness.js`) and the file's `recs`/`pick` helpers. It rates via `PUT /users/:id/ratings/:sessionId` with a time after the session ends, then asks `/recommendations` at a pinned `day`/`time`. No Playwright, so no lane.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| A candidate sharing a topic with a 5★ rating outranks an otherwise equal one | `rank()` with two equal picked-track candidates, one sharing a topic with a 5★ `rated` session: it is listed first | unit |
| A 1★ shared topic ranks it below | same setup with 1★: shared candidate listed after the equal one | unit |
| 3★ changes nothing | same setup with 3★: same order, same reasons, no rating reason | unit |
| An explicit pick still outranks a ratings boost | a candidate matching only a picked topic (score 3) is ahead of one with a 5★ boost on both a shared topic and a shared speaker (clamped to 2) | unit |
| The reason text names the rated session and stars | `reasons` includes exactly `you rated Talk 9 5★` for the shared candidate | unit |
| With the clock pinned after a rating, `/for-you` and the Home strip reflect it | API: after rating a session 5★ at a pinned time, `GET /users/:id/recommendations?day=&time=` (the one endpoint both the page and the strip call) lists a session sharing its topic with the `you rated ... 5★` reason, and ranks it above the control it tied with before the rating | API |

## Decisions
The ticket asks nothing outright, but it left these open.
- Is clamping the summed ratings adjustment to +/-2 (so several rated matches cannot out-score a pick) the right reading of "between an explicit pick and like your agenda"?
- Should a 1-2★ shared session only lower a candidate's rank (it stays listed while its score is above 0) rather than hide it?
- Should 4★ and 5★ (and 1★ and 2★) carry the same weight, as the ticket groups them?

## Out of scope
Any UI change beyond the reason text, new endpoints, and changing the `needsInterests` rule (ratings alone do not unlock the list).
