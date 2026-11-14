# Collapse the Speakers filters behind a Filters button on phones

## What this changes

Below `lg` (1024px), `/speakers` shows the search box and a **Filters** button
side by side; the Sort select and the Show, Day and Track chip rows sit in a
panel that is closed until the button is pressed, as on `/schedule`. The button
reads `Filters`, or `Filters (n)` where n counts the active Show, Day and Track
filters. Filters still live in the URL (`show`, `day`, `track`, `sort`, `q`), so
the panel's contents and behaviour are unchanged once open. On a phone the
search input, the Filters button, the Sort select and every chip are at least
44px tall. At `lg` and above the button is hidden, the panel is always shown,
and every control keeps today's size.

## Where

- `src/components/FilterBar.jsx` — add optional props, empty by default so
  `/schedule` is untouched: `inputClassName` on `SearchInput` (appended to the
  `<input>`), `selectClassName` on `Select` (appended to the `<select>`),
  `chipClassName` on `ChipGroup` (appended to each chip `<button>`).
- `src/pages/SpeakersPage.jsx` — `SpeakersPage`: add
  `const [filtersOpen, setFiltersOpen] = useState(false)` and
  `activeCount = [view, day, track].filter((v) => v !== ALL).length`. In the
  filter card, the first row becomes search + a `Button` with
  `className="min-h-11 lg:hidden"`, `aria-expanded={filtersOpen}`, the `filter`
  icon and label `Filters{activeCount ? ` (${activeCount})` : ''}` (same as
  `SchedulePage` line ~239). Sort moves into a wrapper with the three
  `ChipGroup`s, classed `cx(filtersOpen ? 'block' : 'hidden', 'lg:block')`,
  keeping Sort in the search row at `lg` (`lg:grid-cols-[minmax(0,1fr)_11rem]`
  as today). Pass `h-11 lg:h-10` to search/sort and `min-h-11 lg:min-h-0` to
  each `ChipGroup`'s `chipClassName`.
- Tests in `tests/speakers.spec.js`, new `test.describe('Speakers filters on a
  phone')` using `visit` and `API` from `tests/helpers.js`, read-only, default
  attendee (no lane needed; no writes). Mobile-only tests use
  `test.skip(testInfo.project.name !== 'mobile', …)`, the desktop one the
  reverse. Fix the existing follow test, which clicks `filter-following` on
  both projects: open `Filters` first when it is visible (the `schedule.spec.js`
  `if (await filters.isVisible()) await filters.click()` pattern).

## How it will be proved

| Done when | Check | Layer |
| --- | --- | --- |
| At 375px the first screen shows search, Filters and a speaker card | mobile: `page.setViewportSize({ width: 375, height: 659 })`, visit `/speakers`; `speaker-search` and `getByRole('button', { name: /^Filters/ })` are `toBeInViewport()`, and the first `main a[href^="/speakers/"]` is `toBeInViewport()` (on main the panel pushes every card below 659px) | browser (mobile) |
| Opening Filters shows every filter; applying one updates list, URL and count | mobile: Show/Day/Track groups and Sort hidden before the click, visible after; click `speaker-day-<days[1]>` → URL has `day=`, `speaker-count`/`all-speakers` matches `GET /speakers?day=` length, button reads `Filters (1)`; click a Track chip → `Filters (2)`; click `Any day` → `Filters (1)` and `day=` gone from URL | browser (mobile) |
| Controls ≥ 44px on mobile | mobile, panel open: `boundingBox().height >= 44` for `speaker-search`, the Filters button, the Sort `<select>`, and every button in the Show, Day and Track groups (all 40px or ~30px on main) | browser (mobile) |
| Desktop unchanged | desktop: no Filters button visible; Sort and all three chip groups visible without any click; a chip's height < 44 and the search input is 40px | browser (desktop) |
| Covered by a mobile spec that clicks Filters first | the three mobile tests above, each clicking Filters before touching the panel | browser (mobile) |

## Decisions

- The mobile project is 393×659, not 375 wide; the first-screen test resizes to 375×659 (the project's own phone height) rather than adding a project — OK?
- "A speaker card" is satisfied by any speaker profile link in view — a followed card, the headliner spotlight or a long-tail row — and partly in view counts (`toBeInViewport()`), OK?
- The search box stays outside the panel, so the active count covers only Show, Day and Track; search text and Sort are not counted — OK?
- Sort goes behind the Filters button with the chips (the ticket's "current panel unchanged"), not beside the search box — OK?
- The 44px rule covers the filter area (search, Filters button, Sort, chips); the A–Z jump bar and the headliner spotlight's controls stay as they are, since 26 letter buttons at 44px would make the sticky bar several rows deep — OK?
- "Desktop unchanged" holds on main by nature; its row is a regression guard (the sizing must not leak past `lg`), not a red check — OK?

## Out of scope

- `/schedule`'s controls: the new `FilterBar` props default to empty, so it renders as today.
