# Readable venue map on phones

## What this changes
On `/venues` below `lg`, the route map is drawn on its own phone canvas instead of
the 900x290 desktop canvas shrunk to fit. Today at 375px the desktop SVG scales to
~0.4, so the map is ~121px tall and the labels (11px, 10px, 13px, 15px in SVG
units) render at 4-6px. On the phone canvas the map is at least 220px tall and
every label (venue names, "N stages · city", "6.2 miles", "N min by drive")
renders at 12px or more, with no sideways scroll at 320px and 375px. At `lg` and
up the desktop canvas is the one shown, byte-for-byte as today.

## Where
- `src/components/VenueRouteMap.jsx` — split the single SVG into a
  `MapCanvas({ layout, idSuffix, ... })` driven by a layout table, and render two
  of them in the existing wrapper `div`:
  - `wide` = today's constants (`W 900, H 290, PAD_X 140, SPREAD_Y 90`, text 15/11/13/10px),
    wrapped in `hidden lg:block`, `data-testid="venue-map-wide"` on the `svg`.
  - `phone` = `W 320, H 260, PAD_X 80, SPREAD_Y 60`, all text 12px or more
    (venue name 14px bold, the other three 12px), wrapped in `lg:hidden mx-auto max-w-md`,
    `data-testid="venue-map-phone"` on the `svg`. At 320px the viewBox scale is 1, so
    12px stays 12px; at 375px it is 1.17 and the map is ~305px tall.
  - `<pattern id>` and `<linearGradient id>` get the `idSuffix` (`streets-phone`,
    `routeGrad-phone`, …): both SVGs sit in the DOM and a `display:none` SVG's
    defs do not resolve for the other one. `project()` and the arc/marker maths
    take W/H/PAD from the layout; the "6.2 miles" string and `fastest` logic are unchanged.
  - Spacing: the wrapper `div` keeps its classes and `className` from `VenuesPage`;
    each canvas wrapper is a plain block child with no margin, so nothing the old
    parent supplied (`overflow-hidden rounded-xl border`) moves. At `lg` the phone
    wrapper is `display:none` and the wide wrapper is `block`, the same box the bare
    `svg` was.
- `src/pages/VenuesPage.jsx` — no change (passes `venues`, `routes`, `className`).
- Test in new `tests/venues.spec.js` (read-only, no data lane, no clock), using
  `visit(page, '/venues')` from `tests/helpers.js`; phone tests are
  `test.skip(testInfo.project.name !== 'mobile', …)` with
  `page.setViewportSize` (as in `tests/tabbar.spec.js`); the desktop guard is
  `test.skip(testInfo.project.name !== 'desktop', …)`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| At 375px the map is at least 220px tall | phone test at 375x667: `venue-map-phone` `boundingBox().height >= 220` (false on main: no such element; the desktop SVG is ~121px) | Browser (mobile project) |
| Every label on it renders at 12px or larger | phone test at 375 and 320: for each `text` in `venue-map-phone`, `fontSize * getScreenCTM().a >= 12` (false on main: 4-6px), and the texts include both venue names, both stage counts, "6.2 miles" and the minutes line | Browser (mobile project) |
| No horizontal overflow on `/venues` at 320px and 375px | phone test at both widths: `scrollWidth - clientWidth <= 1` (same expression as `tests/session.spec.js`) and the phone SVG's right edge `<= viewport width` | Browser (mobile project) |
| Desktop looks as it does today | desktop guard at 1280px: `venue-map-wide` visible with `viewBox` `0 0 900 290`, `venue-map-phone` not visible, rendered height = width x 290/900 (+-1), label sizes unchanged (15/13px at scale 1 when the container is 900px wide is not asserted; the viewBox and ratio are) | Browser (desktop project) |

## Decisions
- The overflow criterion and the "desktop unchanged" criterion already hold on main as written (the desktop SVG is `w-full`, so it cannot overflow, and desktop is untouched until the change). They stay as regression guards and are the rows not red on main; the build keeps them true. Is proving "desktop unchanged" by viewBox, visibility and aspect ratio (rather than a pixel snapshot) OK?
- Tablet widths (640-1023px) are also "below `lg`". Cap the phone canvas at `max-w-md` (28rem) and centre it, so a tablet gets a bounded map rather than an 830px-tall one. OK?
- A second SVG (shown only below `lg`) instead of one responsive SVG, because SVG geometry and text size cannot change by CSS breakpoint on a single viewBox. Is a second canvas in the DOM acceptable?

## Out of scope
The route cards, `TravelPanel` copy and `VenueBoard` below the map; the hard-coded "6.2 miles" string; any change to desktop sizing.
