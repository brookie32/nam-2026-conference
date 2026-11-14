# Top-rated sort and rating badges on the schedule

## What this changes
`/schedule` gets a **Sort** select (By time, the default; Top rated) in the filter rail, kept in the URL as `?sort=rating`. Top rated shows the selected day's sessions as one flat list in the API's order (average, then count), not grouped into time slots; the grid is unavailable with it, like with any content filter. Every rated session card gets a compact "★ 4.7 · 23" badge in its header, so it shows on collapsed phone cards too; unrated cards get no badge. Nothing else about the default page changes.

## Where
- `src/pages/SchedulePage.jsx` — add `sort: params.get('sort') === 'rating' ? 'rating' : ALL` to `filters`; pass `sort` to `api.getSessions` (`qs` drops `all`) and to the `useFetch` deps; add a `Select label="Sort"` after Topic in the rail, writing through `set('sort', v)`; add `['sort', 'a sort order']` to `BLOCKERS` (forces list, disables Grid, `clearBlocker` clears it); hide `jump-to-now` when sorted (`nowSlot` only when `filters.sort === ALL`); when sorted render one `card` section (`data-testid="rated-list"`) in place of the `slots.map` sections, same inner grid classes but `grid-flow-row`, not `-dense`, so a spanning keynote cannot reorder cards.
- `src/components/SessionCard.jsx` — in the header track line (rendered compact and full) add `<RatingBadge>` when `session.ratingCount > 0`; in the footer render `Rating` only when unrated, so a rated card does not show two scores.
- `src/components/ui.jsx` — new `RatingBadge({ value, count })` → `<span data-testid="rating-badge">★ {value.toFixed(1)} · {count}</span>`, `shrink-0`, with the star as an `Icon` and an `aria-label` "Rated 4.7 from 23 ratings".
- `context/engineering-context/schedule.md` — document `sort`, `rated-list`, `rating-badge`.
- No server change: `sessions.js` already orders `sort=rating` by `avg_rating DESC, rating_count DESC`.
- Tests in `tests/schedule.spec.js`, read-only so no lane: `visit`, `waitForResults`, `conferenceDays`, `momentOn`; Day 1 morning is the only seeded rated day (seed doc), Day 1 afternoon and later are unrated. Expected values come from `request.get(`${API}/sessions?day=…&sort=rating`)`, never hard-coded.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Top rated orders by average then count, survives a reload | Day 1 list: choose Sort "Top rated"; URL has `sort=rating`; card titles in `rated-list` equal the API's `sort=rating` titles in order; `page.reload()` keeps the URL, the select value and the order | Playwright, desktop and mobile |
| Rated cards show the real average and count; unrated show none | Day 1: for each session in the API payload, the card has `rating-badge` with text `★ {avg.toFixed(1)} · {count}` iff `ratingCount > 0`, and no card text contains `0.0`; at least one rated and one unrated card are asserted | Playwright |
| Default ordering unchanged | `/schedule?view=list` has no `sort` param, Sort reads By time, `slot-<HH:MM>` sections ascend, no `rated-list`; then choosing By time again removes `sort` from the URL | Playwright |
| Works at 375px | mobile project at 375x659: with Top rated chosen, a collapsed rated card's badge is in the viewport with `right <= 375` and `scrollWidth <= 375`; the open rail still shows the first card (existing test, must stay green) | Playwright, mobile |

## Decisions
- Default ordering already holds on main (no sort control exists, the list is by time); the build adds a test that pins it rather than a fix — OK?
- Top rated sorts within the selected day, not across all four days — OK?
- Choosing Top rated switches the page to the list and disables the Grid tab with the usual notice, since a time-by-room grid cannot show a rating order — OK?
- The rating moves into the card header and the footer keeps only "Not yet rated" for unrated sessions, so a rated card shows one score, not two — OK?
- If the extra Sort select pushes the first card out of view in the open phone rail at 393x659 (existing test), Sort moves to the results header row instead of the rail — OK?

## Out of scope
Row-variant cards (speaker pages, agenda), a server tiebreak for equal ratings, the other items on the workshop list.
