---
area: architecture
summary: How a request travels from a React page to SQLite and back, the global store every page reads, the route table and the shell-level meta endpoints.
read_when: adding an endpoint, a column, a page or a route; touching useConference, useFetch, api.js, the bootstrap payload, /live, the error/404 handlers
files:
  - server/index.js
  - server/db.js
  - server/lib/query.js
  - server/routes/meta.js
  - server/routes/ask.js
  - server/lib/ask.js
  - src/pages/AskPage.jsx
  - src/lib/askChat.jsx
  - src/components/AskChat.jsx
  - src/components/AskPanel.jsx
  - src/components/AskCards.jsx
  - tests/unit/ask-prompt.test.js
  - src/lib/splitReply.js
  - src/main.jsx
  - src/App.jsx
  - src/lib/api.js
  - src/lib/store.jsx
  - src/lib/useOnline.js
  - src/components/OfflineBanner.jsx
  - public/sw.js
  - public/manifest.webmanifest
  - public/brand/orbit-icon.svg
tests:
  - tests/unit/offline-api.test.js
  - tests/unit/split-reply.test.js
  - tests/offline-prod.spec.js
  - tests/api/contracts.test.js
  - tests/api/endpoints.test.js
  - tests/api/ask.test.js
  - tests/api/ask-personal.test.js
  - tests/ask.spec.js
  - tests/ask-panel.spec.js
  - tests/unit/query.test.js
related: [seats, agenda, clock, schedule, speakers, venues, seed, testing]
---

# Architecture

## How it works

**Running it.** `npm run dev` seeds, then starts the API (`node --watch server/index.js`,
`PORT`, default 3001) and Vite (`WEB_PORT`, default 5173, hot reload) together. Vite proxies
`/api` to the API, so the frontend only ever fetches relative URLs. Where the rest lives:
`server/lib/` holds the rules (`seats.js`, `attendance.js`, `agenda.js`, `ical.js`) beside
`query.js`; `server/routes/` has one router per resource; `src/pages/<Thing>Page.jsx` is one
file per route; `src/lib/` has `format.js`, `accents.js`, `travel.js`, `clock.js` and the
small hooks; `public/avatars/` holds the committed portraits and `public/images/` the
optional hero photography (see its README). `data/orbit.db` is generated and gitignored.
There is no authentication: the selected attendee is `localStorage['orbit:currentUserId']`.

**One request, end to end.** A page calls `useFetch(() => api.getSessions({ day }), [day])`
(`src/lib/store.jsx:useFetch`) → `src/lib/api.js:getSessions` builds `/api/sessions?day=…`
with `qs()` (drops `undefined`, `null`, `''` and `'all'`) and calls the private `api()`
wrapper → Vite proxies `/api` to `PORT` (`vite.config.js`) → `server/index.js` mounts
`metaRouter` at `/api`, `sessionsRouter` at `/api/sessions`, `speakersRouter` at
`/api/speakers`, `usersRouter` at `/api/users` → the handler runs a module-scope prepared
statement (or calls `server/lib/seats.js` / `attendance.js` / `agenda.js`) → rows go through
a `toX()` mapper in `server/lib/query.js` → JSON.

**Errors.** `api()` throws an `Error` whose `message` is the body's `error` string, with
`error.status` and `error.payload` (the parsed body) attached — `store.jsx:reserveSeat`
reads `err.payload` on a 409 to get the clash. Server side, `index.js` ends with a JSON 404
for any unmatched `/api/*` (`"No route for GET /api/…"`) and an error handler that answers
`err.status ?? 500` with `{ error: err.message }` — so a malformed JSON body from
`express.json()` is a 400, not a 500. `GET /api/health` returns `{ ok, sessions }`.
**Production serving.** `npm start` (seed, then `node server/index.js`) is one process: when
`DIST_DIR` exists (`ORBIT_DIST_DIR` or `<repo>/dist`, from `npm run build`) `index.js` mounts
`express.static` after the `/api` 404, then a `GET *` fallback sending `index.html` for
extension-less paths (client routes like `/speakers/12`); a missed path with an extension is a
plain 404. No `dist/` (`npm run dev`) mounts nothing. Railway sets `PORT`; `ORBIT_PUBLIC_URL`
sets the `.ics` host.
`index.js` only calls `listen` when run directly; tests import `app` (see testing).

**Database** (`server/db.js`). `DB_PATH` is `ORBIT_DB` or `data/orbit.db`; WAL and
`foreign_keys = ON`. The schema is the single `SCHEMA` string (`CREATE TABLE IF NOT
EXISTS` throughout); `migrate()` execs it, `dropAll()` drops every table child-first.
Tables: `users`, `venues`, `venue_travel`, `tracks`, `tags`, `rooms`, `speakers`,
`sessions`, `session_tags`, `session_speakers`, `reservations`, `check_ins`,
`speaker_follows`, `user_interests`, `ratings`, `vendors`, `sponsors`, `announcements`. Column-level detail:
`context/engineering-context/data-model.md`.

**Mappers** (`server/lib/query.js`). `SESSION_SELECT` joins session → track → room → venue
and computes `waitlist_count`; append `WHERE …` to it. `toSession(row, extra)` derives
`seatsLeft`, `fillRate`, `isFull`, splits `takeaways` on `|` and `room.amenities` on `,`, and
nests `track`, `room`, `venue`. `hydrateSessions(rows)` adds `speakers` and `tags` in two
batched `IN (…)` queries — use it for lists; bare `toSession` has no speakers/tags. Also
`toSpeaker` (nests `socials`), `toVenue`, `toTravel`, `toTrack`, `toRoom`, `toVendor`,
`toSponsor`, `toUser(row, extra)` (adds `isSpeaker`, `speakerId ?? null`),
`toAnnouncement`, and `toMinutes('09:00') → 540`.

**Meta endpoints** (`server/routes/meta.js`):

| Route | Returns |
| --- | --- |
| `GET /bootstrap` | `{ conference: { name, edition, tagline, city, dates, startDate }, venues, travel, tracks, tags, rooms, users (+reservedCount), days: [{ date, label: 'Day n', weekday, sessionCount }], formats, levels, cuisines }` — `dates` is formatted from the first/last session day |
| `GET /venues` | venues with `rooms`, `vendorCount`, `sessionCount` |
| `GET /vendors?venueId&cuisine&dietary&q` | per-request SQL, bound `?` values, ordered by rating |
| `GET /sponsors` | ordered Diamond → Platinum → Gold → Silver, then name |
| `GET /announcements` | pinned first, newest first |
| `GET /live?day&time` | `{ day, time, dayStartsAt, dayEndsAt, nextSlot, happeningNow, upNext }`; 400 without both params; an unknown day gives empty arrays and null bounds |

**Client shell.** `src/main.jsx`: `StrictMode → BrowserRouter → Toaster → ConferenceProvider
→ App`. `src/App.jsx` shows `ErrorState` if bootstrap failed, `Spinner` until `ready`, then
the routes. `/opening-presentation`, `/product-presentation` and `/engineering-presentation` sit outside it, full screen; the rest are inside `<Layout>`: `/` Home, `/schedule`, `/for-you`, `/sessions/:id`, `/speakers`,
`/speakers/:id`, `/my-agenda`, `/my-plan` (→ `/my-agenda`), `/venues`, `/food`, `/expo`, `/ask`,
`/code-of-conduct`, `/accessibility`, `*` NotFound.

**Ask ORBIT** (`/ask`, `AskPage.jsx`, built on `useChat` from `@ai-sdk/react`). `POST /api/ask { messages: UIMessage[], day, time, userId }`
streams the AI SDK UI message stream (`streamText().pipeUIMessageStreamToResponse`); the page's transport adds `day`, `time`
(`clock`) and `userId` (`currentUserId`) at send time. 503 `{ error: 'Ask ORBIT is not configured' }` when `askModel()` is null,
400 on messages without `parts` or a missing `day`/`time`. `server/lib/ask.js`: `askModel()` is the injected model (`setAskModel`,
the test seam), else the AI Gateway model (`ASK_ORBIT_MODEL`, default `anthropic/claude-sonnet-5.5`) when `AI_GATEWAY_API_KEY` is
set, read per request. Locally the key lives in a gitignored `.env` at the repo root, which `server/index.js` loads with
`process.loadEnvFile` when it exists (CI and a fresh fork have none). Not `node --env-file-if-exists`: with `--watch` it stalled
the API on CI's Linux runners. `askSystemPrompt({ day, time, agenda })` states the clock, the asker's agenda that day
(`agendaOn(userId, day)` in `agenda.js`) and the formatting rules. `askTools` (`searchSessions`, `findSpeakers`, `venuesAndTravel`) are the
model's data; they return session ids so the reply links `[title](/sessions/<id>)`, and the page renders only those links
(`renderReply`). `showSessions({ ids })` and `showTravel({ fromVenueId, toVenueId })` only echo their input: the page renders
`tool-showSessions` as `SessionResults` (a `SessionCard` per id, fetched live) and `tool-showTravel` as `TravelResults`
(`ask-travel` rows) from `AskCards.jsx`. `splitReply()` (`src/lib/splitReply.js`) splits text parts into text and Markdown-table
blocks (a table needs a separator row, so a half-streamed one stays text until it arrives); `ReplyBody` renders tables in an
`overflow-x-auto` wrapper. The page learns "not configured" from the 503 in `useChat`'s `error` (`ask-not-configured`).
**Panel on every page.** `Layout` wraps its shell in `AskProvider` (`src/lib/askChat.jsx`), which holds the one `useChat` (so the panel and `/ask`
share a conversation), `open`, `openAsk(question?)`, `closeAsk()` (returns focus to the launcher) and `chipsFor(pathname)`. The transport adds
`route`, and `sessionId` / `speakerId` on `/sessions/:id` / `/speakers/:id`, at send time. `AskLauncher` (floating button, above the tab bar,
hidden on `/ask`) and `AskPanel` (`role="dialog"`, right panel on `lg`, bottom sheet below; focus-trapped, Esc/Close) live in `AskPanel.jsx`;
`AskChat.jsx` is the messages and form (a `tool-searchSessions|findSpeakers|venuesAndTravel` part still running shows `ask-searching`).
Home's "Ask anything…" form calls `openAsk(question)`. Server: `programmeOn(day)` (one line per session, cached 30 s per day) and
`pageContext({ route, sessionId, speakerId })` feed `askSystemPrompt({ …, programme, page })`; the route sends `Cache-Control: no-cache, no-transform`
and `X-Accel-Buffering: no` through the SDK's `headers` option (a manual `flushHeaders()` makes the SDK's `writeHead` throw).
Tests stub the model and `/api/ask`.

**`useConference()`** (`store.jsx:ConferenceProvider`) spreads the whole bootstrap payload
(`conference`, `venues`, `travel`, `tracks`, `tags`, `rooms`, `users`, `days`, `formats`,
`levels`, `cuisines`) and adds: `ready`, `error`, `clock` (from `useConferenceClock(days)`),
`currentUser`, `currentUserId`, `setCurrentUserId`; follows — `followingIds`,
`isFollowing(id)`, `toggleFollow(id)`; seats — `reservations` (Map sessionId →
`'confirmed'|'waitlisted'`), `reservationFor(id)`, `onAgenda(id)`, `seatCounts`,
`seatsFor(id)`, `reserveSeat`, `releaseSeat`, `toggleSeat`, `conflict`,
`resolveConflict(swap)`; lookups — `trackBySlug`, `venueById`, `roomById`.
Changing `currentUserId` writes `orbit:currentUserId`, clears follows/reservations, then
reloads them from `GET /users/:id`. `seatCounts` holds live counts from seat responses so
every card updates without refetching; read `seatsFor(id)` before the page's payload.

**`useFetch(fn, deps)`** returns `{ data, loading, error, reload }`. It re-runs when `deps`
change or `reload()` bumps a nonce, keeps the previous `data` while loading, and ignores
responses from a superseded run.

## Offline and install

A production build links `/manifest.webmanifest` (name, `theme_color`, `orbit-icon.svg`) and
`main.jsx` registers `public/sw.js` only under `import.meta.env.PROD` — dev registers nothing.
The worker is network-first with a cache fallback for same-origin GETs (navigations fall back to
a cached shell) and the read-only `/api/` paths (bootstrap, sessions, speakers, venues, vendors,
sponsors); `/api/users`, `/api/live`, `.ics` and every non-GET are never intercepted.
`useOnline()` / `useReconnects()` (`src/lib/useOnline.js`) drive `OfflineBanner`
(`offline-banner`); `useFetch` and the bootstrap/user effects refetch when `reconnects` bumps.
`api()` throws `Error("You're offline")` with `offline = true` for a write made offline (no request
sent) or whose fetch throws a `TypeError`; store and `AttendancePanel` toast "You're offline" on it.

## Invariants

- No snake_case key reaches the client, at any depth — `contracts.test.js` walks bootstrap
  and the page payloads; `endpoints.test.js` walks every GET; `query.test.js` walks the mappers.
- Every mounted route is exercised: `endpoints.test.js` › "the whole surface is covered"
  greps `server/routes/*.js` for `Router.(get|put|delete)('…'` and fails on any path not in
  its `covered` list. A new endpoint needs an entry there and a request in `readable()`
  or `filtered()`.
- Missing ids are `404 { error }`, never a 500 or a 200 of nulls.

## Gotchas

- `tags` in `/bootstrap` are raw rows, not mapped — safe only because every `tags` column
  is already a single word. Add a column with an underscore and you need a `toTag`.
- New columns must be added to the mapper *and* `SESSION_SELECT` if they live on a joined table.
- The coverage regex needs single quotes and `Router.get(`-style calls; a route declared
  another way (e.g. `router.route()`) silently escapes it.
- `/api/health` is declared in `index.js`, not a router, so the coverage test ignores it.

## Where to change…

- New endpoint: route in `server/routes/*.js` → mapper in `query.js` → one function in
  `src/lib/api.js` → entry in `tests/api/endpoints.test.js`.
- New global data: add to the `/bootstrap` response; it appears on `useConference()` automatically.
- New page: `src/pages/<Thing>Page.jsx` + a `<Route>` in `src/App.jsx`; footer links are smoke-tested.
