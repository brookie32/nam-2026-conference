# Session page speaker cards overflow on 320px phones

## What this changes
On the narrowest phones (320px), `/sessions/:id` for a multi-speaker session no
longer scrolls sideways: the speaker cards stay inside the viewport and long
names, job titles and companies truncate inside their cards. From `sm` up the
two-column card layout is unchanged, and at 375px and up nothing moves.

## Where
- `src/pages/SessionPage.jsx` — the speaker list at line ~209,
  `mt-4 grid gap-3 sm:grid-cols-2` → `mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2`.
  The `sm:` template still overrides at `sm+`. The card text column already has
  `min-w-0` with `truncate` on name, title and company (and `line-clamp-3` on the
  bio), so no card markup changes unless the red-check shows the avatar needs `shrink-0`.
- Test in `tests/session.spec.js`, extending the existing phone test (line ~86,
  mobile project, read-only so no lane): set the viewport to 320x568, pick the
  session with the most `speakers` from `request.get(\`${API}/sessions\`)` (fetch
  `/sessions/:id` if the list payload lacks `speakers`), visit it, wait for
  `session-title`, assert `scrollWidth - clientWidth <= 1` (same expression as
  `tests/smoke.spec.js`), and that every `a[href^="/speakers/"]` card inside the
  Speakers section ends at `x + width <= 320`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| At 320px, `/sessions/:id` has no horizontal overflow for a multi-speaker session | phone test at 320px: `scrollWidth - clientWidth <= 1` for the session with the most speakers (false on main: ~12px) | Browser (mobile project) |
| Speaker names, titles and companies wrap or truncate inside their cards | same test: every speaker card's right edge `<= 320` (false on main: cards cut off) | Browser (mobile project) |
| At 375px and up, and at `sm`/`lg`, the page looks as it does today | the existing 375px phone test and the desktop guard keep passing; a regression guard, holds on main | Browser (mobile and desktop projects) |
| The mobile spec for #11 also checks a multi-speaker session at 320px | the extended phone test in `tests/session.spec.js` | Browser (mobile project) |

## Decisions
- Is "at 375px and up the page looks as it does today" proved by the existing 375px test and desktop guard rather than a pixel snapshot — OK?
- Is the multi-speaker session picked at runtime (most speakers) rather than by hard-coded id, so a reseed cannot hollow the test — OK?

## Out of scope
Other pages; the header, seat panel and reviews sections.
