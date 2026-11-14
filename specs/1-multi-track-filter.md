# Pick more than one track in the schedule's Track filter

## What this changes
On `/schedule` each Track pill toggles on and off independently and carries `aria-pressed`. The list shows sessions from every picked track and no others; `result-count` matches the API. **All** clears the picks, and un-picking the last track returns to All. The URL holds `?track=agents,rag`; `?track=agents` behaves as today. The Speakers page Track filter is untouched.

## Where
- `server/routes/sessions.js` line 38 — replace `t.slug = ?` with a split of `trackSlug` on `,` (trimmed, empties dropped) into `t.slug IN (?, ?)`; one value gives the same query as today. Test in `tests/api/endpoints.test.js` (`startApi`, `api.json`), as a new `test` beside the existing `trackSlug` entry in `filtered()`.
- `src/pages/SchedulePage.jsx` — `filters.track` stays the raw comma string (it already flows to `trackSlug` and `BLOCKERS`). Derive `pickedTracks = filters.track === ALL ? [] : filters.track.split(',')`. The pill `onClick` toggles a slug in that array and calls `set('track', next.join(','))`; an empty array gives `''`, which `set` deletes (back to All). `active` is `pickedTracks.includes(t.slug)`; add `aria-pressed={active}` to each pill (and to All: `pickedTracks.length === 0`). The All button already calls `set('track', ALL)`.
- Page test in `tests/schedule.spec.js` using `visit`, `waitForResults`, `API` and `request` from `tests/helpers.js`; it runs in both the desktop and mobile projects. On mobile it clicks the `Filters` button first (Gotchas).

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Two tracks show both tracks' sessions and no others; count matches the API | `/sessions?trackSlug=a,b` returns exactly the union of `trackSlug=a` and `trackSlug=b` (ids), with no other track present | API (`endpoints.test.js`) |
| Same, on the page | click two pills; `result-count` equals the API's count for `trackSlug=a,b`, both pills `aria-pressed=true` | Playwright (`schedule.spec.js`), desktop and mobile |
| Removing one narrows the list | click one pill off; `result-count` equals the API count for the remaining track, URL is `track=<remaining>` | Playwright |
| All, or removing the last track, shows every track | click All, and separately untoggle the last pill; no `track=` in the URL, `result-count` equals the unfiltered API count | Playwright |
| `?track=a,b` survives a reload; `?track=a` still works | visit `?track=a,b`, reload, both pills still pressed and count matches; visit `?track=a`, count matches `trackSlug=a` | Playwright |
| Tests cover adding and removing, on desktop and mobile | the specs above run in both projects | Playwright |

## Decisions
- The single-track link `?track=a` already works on main; this build proves it still works after the change rather than proving something new — OK?
- Picked slugs go into the URL in the order they were clicked, not track order — OK?
- A picked track makes the grid unavailable and forces the list, as a single track does today (`BLOCKERS` unchanged) — OK?
- An unknown slug in the list (`?track=a,nope`) just matches nothing for that value, with no error — OK?

## Out of scope
The Speakers page Track filter and `server/routes/speakers.js` stay single-select.
