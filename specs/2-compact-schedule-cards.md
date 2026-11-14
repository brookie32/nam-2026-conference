# Compact session cards on the schedule on phones

## What this changes
Below `lg` (under 1024px), `/schedule`'s list view shows each session as a compact card: track, time, room, the title link, the seat button and an expand control (`data-testid="card-expand"`, `aria-expanded`). Expanding reveals the rest of today's card in place — keynote cover, subtitle, abstract, speakers, format, level, seats left, rating; collapsing hides it again. The title still opens the session page; the seat button works in both states. Every control on the compact card is at least 44px tall. Desktop list, the grid view (`ScheduleGrid`), and the speaker page's cards are unchanged. Stacks on #1 (`issue-1-multi-track-filter`).

## Where
- `src/components/SessionCard.jsx` — `SessionCard`: add a `collapsible = false` prop and `const [expanded, setExpanded] = useState(false)`. In the grid variant, when `collapsible && !expanded`: skip the `feature` cover, subtitle, abstract, speakers block and footer; render the room (pin icon + `session.room.name`) under the time in the header. Add the expand button beside the `SeatButton` in the header's right cluster (`relative z-10 size-11`, `aria-expanded`, `aria-label` "Show details"/"Hide details", chevron `Icon`), rendered only when `collapsible`. When collapsible, the title `Link` gets `flex min-h-11 items-center`, and the `SeatButton` gets `size="lg"`. When `collapsible && expanded`, render exactly today's body and footer.
- `src/components/ui.jsx` — `SeatButton` (line ~120): `dims` gains `size === 'lg' ? 'size-11'` (44px); the icon keeps `size-[18px]`.
- `src/pages/SchedulePage.jsx` — line ~310, the list's `items.map`: `<SessionCard key={s.id} session={s} collapsible={!wide} />` (`wide` is already the `(min-width: 1024px)` media query at line 38).
- `tests/helpers.js` — `LANES`: add `'schedule.compact': { desktop: { user: jonas, day: 1 }, mobile: { user: abraham, day: 1 } }` (neither pair is in the table or the read-only fixtures today; `tests/unit/lanes.test.js` confirms).
- `tests/schedule.spec.js` — new `test.describe('Compact cards on a phone')`, the compact tests `test.skip(testInfo.project.name !== 'mobile', …)`, each `page.setViewportSize({ width: 375, height: 659 })` before `visit(…, { at: await momentOn(0, '07:00') })` on `days[1]` (nothing done or live). Uses `visit`, `momentOn`, `conferenceDays`, `waitForResults`, `laneFor`, `bookableFor`, `API`, `shotForPR`. Also update `'a card shows the seats left…'`: on mobile, click that card's `card-expand` before reading `card-seats`.
- `context/engineering-context/schedule.md` — `SessionCard` and Grid vs list sections: one line on `collapsible`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| At 375px a fresh day in list view is ≤ about a third of today's height; each card shows title, time, room, track | `schedule.spec.js` "compact cards cut the day to about a third": record `document.documentElement.scrollHeight` collapsed, click every `card-expand`, record again; assert collapsed ≤ 0.4 × expanded. Each `session-card` contains its title, `startsAt`, room name and track name, and no abstract text (false on main: no `card-expand` exists, the abstract renders) | Browser (mobile) |
| Expand shows full content, collapse hides it; title and seat work in both states | "a compact card expands, collapses, books and opens": on lane `schedule.compact` pick `bookableFor(...).find(s => s.seatsLeft > 3)`; collapsed: abstract hidden, `aria-expanded="false"`; expand → abstract, first speaker, `card-seats`, level visible; seat button → `starred-count` +1; collapse → abstract hidden; seat button again → back to before; click the title → URL `/sessions/<id>`. Releases via `request.delete` in a `finally` | Browser (mobile) |
| Compact card controls ≥ 44px on mobile | same file: `boundingBox().height >= 44` for `card-expand`, the seat button and the title link of the first card (false on main: seat button is 40px, title link is the h3's height) | Browser (mobile) |
| Desktop list and grid unchanged | desktop-only test: `/schedule?view=list` at 1440 has no `card-expand` and the first card shows its abstract; existing grid tests in `schedule.spec.js` and `smoke.spec.js` stay green. This row is a regression guard — it holds on main by design | Browser (desktop) |
| Covered by a mobile spec, clock pinned | the three tests above run on the `mobile` project with `momentOn(0, '07:00')` | Browser (mobile) |

## Decisions
- "About a third of today's height" is measured inside one test as collapsed ÷ all-expanded (expanded is today's card), with a 0.4 ceiling rather than a stored pixel baseline.
- A compact card still shows the cross-town venue name and, for a full session, the `Full · n waiting` badge: whether you can get in, and that it is across town, are not "the rest". (The gate caught two existing tests, venue filter and queue length, reading them on mobile; the spec had hidden them.)
- Seats left, rating, format and level live only in the expanded card on phones, as the ticket lists them under "the rest"; the existing seats-left test expands the card first on mobile.
- The whole-card stretched link stays in compact cards, so tapping anywhere but the two buttons opens the session, as today.
- Cards start collapsed on every load; expanded state is not kept in the URL or storage.

## Out of scope
The grid view on phones (`?view=grid`), `variant="row"` cards, and the speaker page's cards.
