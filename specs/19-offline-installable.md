# Make the app installable and readable offline

## What this changes
An attendee can install ORBIT from the browser, and a page they have already visited still opens with no network. In a production build the app serves a web app manifest (name, theme colour, icon) and registers a hand-written service worker. The worker caches the app shell, and the read-only GETs the browsing pages use (`/api/bootstrap`, `/api/sessions…`, `/api/speakers…`, `/api/venues`, `/api/vendors…`, `/api/sponsors`), network-first with a cache fallback. While offline a slim banner reads "You're offline"; writes (take or release a seat, follow, check in, rate) are never cached or queued and fail with a "You're offline" toast, changing nothing. When the connection returns the banner goes and every open page refetches, so fresh data replaces the cached copy. The dev server registers no worker.

## Where
- `public/manifest.webmanifest` (new) and `public/brand/orbit-icon.svg` (new, the 🛰️ mark on the brand gradient, the same one `Logo()` in `Layout.jsx` draws) — name, short_name, `display: standalone`, `theme_color`, the icon with `sizes: any`; `index.html` — `<link rel="manifest">` and a `theme-color` meta; test in `tests/offline.spec.js` using `visit`.
- `public/sw.js` (new; Vite copies `public/` to `dist/`, and `server/index.js` serves it as a file before the SPA fallback) — `fetch` handler: a GET that is a navigation or an asset under the app's origin gets the cached shell (`index.html`) on failure; `/api/` GETs for the paths above (not `/api/users`, not `/api/live`, not `.ics`) are fetched network-first, stored on success, served from the cache on failure; everything non-GET is not intercepted. Test in `tests/offline-prod.spec.js` using `context.setOffline`.
- `src/main.jsx` — after `createRoot`, `if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')`; nothing in dev.
- `src/lib/useOnline.js` (new) — `useOnline()` over `navigator.onLine` and the `online`/`offline` events, plus a module-level `reconnects` counter bumped on each `online` event.
- `src/components/OfflineBanner.jsx` (new, `data-testid="offline-banner"`), rendered at the top of `Layout()` in `src/components/Layout.jsx` beside the `preview-banner`.
- `src/lib/api.js` — in `api()`, a non-GET with `navigator.onLine === false`, or whose `fetch` throws a `TypeError`, throws `Error("You're offline")` with `offline = true` and no request sent when already offline.
- `src/lib/store.jsx` — the catches in `reserveSeat`, `releaseSeat` and the swap toast `"You're offline"` (icon `alert`) when `err.offline`, not "Could not book that seat: …"; `toggleFollow` has no catch today, so it gains one with the same toast; `useFetch` and the bootstrap effect re-run when `reconnects` changes. `src/components/AttendancePanel.jsx` `submit()` catch gets the same `err.offline` branch.
- `playwright.config.js` — `webServer` becomes an array: the existing dev server, plus `npm run build && node server/index.js` on `PROD_PORT` (default `PORT + 100`, so a lane's pair never collides) waiting on `/api/health`. No new project: `tests/offline-prod.spec.js` does `test.use({ baseURL: PROD_URL })` and runs in the `desktop` project the CI matrix already runs, skipping `mobile`.
- `tests/helpers.js` — `LANES` gains `'offline.seat'`, `readOnly: true`, the same pair as `schedule.seats` (nothing is written). `context/engineering-context/` — a note in `architecture.md` (service worker, `useOnline`, offline failure in `api()`) and `testing.md` (the production-build server and `PROD_PORT`).

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| A production build serves a valid manifest and registers the service worker | On the prod server: `/manifest.webmanifest` parses with `name`, `theme_color`, and an icon that returns 200; `navigator.serviceWorker.ready` resolves with a registration whose script ends `/sw.js` | Browser, `tests/offline-prod.spec.js` |
| The dev server does not register it | On the dev server (`visit('/')`), `getRegistrations()` is empty and the `<link rel="manifest">` is present | Browser, `tests/offline.spec.js` |
| After visiting `/schedule` and `/speakers` once, reloading them offline shows the cached content and the banner | Visit both online, wait for the worker to control the page, `setOffline(true)`, `reload()`: the session cards (`result-count` not Loading, same first title as online) and `offline-banner` show | Browser, `tests/offline-prod.spec.js` |
| Taking a seat while offline shows the offline toast and changes nothing | Offline on a session page, click `reserve-seat`: the toaster shows "You're offline"; `/api/users/:id` reservations equal the count read before | Browser, `tests/offline-prod.spec.js` |
| Going back online removes the banner and fresh data replaces cached data | `setOffline(false)`: `offline-banner` gone; a `/api/sessions` response served from the cache is replaced — the test edits the cached entry's first title through `caches`, reconnects, and expects the real title back | Browser, `tests/offline-prod.spec.js` |
| Covered by a Playwright spec that uses offline mode against a production build | The rows above are that spec; `scripts/red-check.mjs` breaks `sw.js` and `api()` in turn | Browser |

The dev-registration row already holds on main (no worker exists); it is kept as a guard and only the production-registration row is red today.

## Decisions
- The dev-registration criterion already holds on main, since no worker exists. This build proves it by asserting no registration on the dev server after the worker lands — OK?
- One SVG icon with `sizes: any`, drawn from the existing 🛰️ mark since `public/brand` holds only a white Equal Experts logo, and no PNG sizes — OK?
- The offline toast replaces the "Could not book that seat:" prefix with a plain "You're offline", rather than appending it — OK?
- `/api/users/*` and `/api/live` are not cached, so an attendee's own agenda shows nothing new offline and a stale "now" is never served — OK?
- The prod server starts for every Playwright run (a build added to each run), in the `desktop` project, rather than a third project that CI's matrix would not run — OK?

## Out of scope
Queueing writes to replay later, background sync, push notifications, precaching of every route, caching Google Fonts, and the other items on the workshop list (My Agenda page and so on).
