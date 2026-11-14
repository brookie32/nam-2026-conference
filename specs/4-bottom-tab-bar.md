# Bottom tab bar on phones

## What this changes
Below `lg` (1024px), every page inside `<Layout>` gets a bar fixed to the bottom
of the screen with four tabs — **Home · Schedule · My Agenda · Venues** — each an
icon over a label, the current one marked `aria-current="page"`, and My Agenda
carrying the same count badge (`reservations.size`) the menu shows. The bar sits
above the phone's home indicator (`env(safe-area-inset-bottom)`; `index.html`
already has `viewport-fit=cover`), and the page is padded by the bar's height so
the footer's last line scrolls clear of it. The menu button and the desktop nav
are unchanged. My Agenda stays the placeholder page.

## Where
- `src/components/Layout.jsx` — add `const TABS = ['/', '/schedule', '/my-agenda', '/venues']`
  picked out of `NAV` (same icons: `sparkle`, `calendar`, `ticket`, `building`) and a
  `TabBar` rendered after `<footer>`: `<nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 … lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>`,
  four `NavLink`s (`end` for Home; NavLink sets `aria-current="page"` itself), each
  `min-h-11` (44px) with icon + label, badge on `/my-agenda` when `reservations.size > 0`.
  Pad the shell: the outer `div` gets `pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0`
  (bar height 4rem) so the footer ends above the bar.
- `src/components/Toaster.jsx` — line 33, `bottom-4` → `bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4`
  so toasts stack above the bar instead of behind it.
- Test in new `tests/tabbar.spec.js`, read-only (no lane needed: it books nothing), using
  `visit()` and `failOnPageErrors()` from `tests/helpers.js`. Phone tests run on the
  `mobile` project only with `page.setViewportSize({ width: 375, height: 667 })`; the
  `lg` test runs on `desktop` at 1024×768 and 1440×900.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| At 375px every page shows the four-tab bar | For each route in smoke's list plus `/sessions/1`, `/speakers/1` and an unknown path: `navigation "Tabs"` is visible with exactly the links Home, Schedule, My Agenda, Venues in that order (no such nav on main) | browser, mobile |
| Tapping a tab navigates and marks it current | From `/food`, tap each tab in turn: URL becomes its path, that link has `aria-current="page"`, the other three do not | browser, mobile |
| My Agenda shows its count badge | The My Agenda tab's badge text equals the count in the open menu's My Agenda link on the same page load (seed gives Jonas a plan, so it is non-empty) | browser, mobile |
| Nothing at the bottom is hidden behind the bar | On each route above, scroll to the end; the footer's last paragraph's bounding-box bottom ≤ the Tabs nav's top (on main there is no bar, so the test fails at locating it) | browser, mobile |
| Each tab is at least 44px tall | Every tab link's `boundingBox().height ≥ 44` | browser, mobile |
| At `lg` and up, no tab bar | At 1024×768 and 1440×900, `navigation "Tabs"` is hidden while `navigation "Main"` is visible — paired with the 375px rows above so a bar that never renders cannot pass | browser, desktop |
| Covered by a mobile spec | `tests/tabbar.spec.js` above, run on the `mobile` project | — |

## Decisions
- The menu keeps all seven pages, including the four that are now tabs (the ticket says only that it "stays").
- Toasts move up above the bar on phones rather than being covered by it.
- The bar is a `nav` named "Tabs", so it is distinct from "Main" and "Mobile" for tests and screen readers.

## Out of scope
Building My Agenda; any change to the desktop nav or the presentation pages (outside `<Layout>`, no bar).
