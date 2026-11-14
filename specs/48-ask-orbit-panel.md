# Ask ORBIT panel on every page, page-aware, with real streaming and faster answers

## What this changes
A floating **Ask ORBIT** button sits on every page inside `<Layout>` (hidden on `/ask`, which is the full-page view of the same chat). It opens the chat as a right-hand panel on desktop and a bottom sheet on phones: focus-trapped, closed by Esc or its close button, focus back on the button, and the conversation survives navigation. The button sits above the bottom tab bar, never over it. Home gets an "Ask anything…" input that opens the panel with the question already sent. Each request carries the route and, on a session or speaker page, its id; the prompt tells the model what the attendee is looking at, and the quick-question chips change with the page. Text arrives token by token, a "Searching the programme…" line shows while a tool runs, and the prompt carries a compact cached summary of the current day's programme so common questions need no tool call. Model stays Sonnet 5.5.

## Where
- `src/lib/askChat.jsx` (new) — `AskProvider` holds the one `useChat` (moved from `AskPage`: transport, `prepareSendMessagesRequest`), the panel's `open` state, `openAsk(question?)` and `closeAsk()`. The body gains `route` (`useLocation().pathname`) and `sessionId` / `speakerId` (`useMatch('/sessions/:id')`, `useMatch('/speakers/:id')`), read at send time like `clock`. Also `chipsFor(pathname)`: session page, speaker page, home/other.
- `src/components/AskChat.jsx` (new) — messages + form, moved out of `AskPage` with `Part`, `ReplyBody`, `renderReply` and the `data-testid`s unchanged; adds the "Searching the programme…" state for `tool-searchSessions | findSpeakers | venuesAndTravel` parts whose `state` is `input-streaming` or `input-available`.
- `src/components/AskPanel.jsx` (new) — `AskLauncher` (the floating button, `bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] right-4 lg:bottom-6`, `z-40`, hidden on `/ask`) and `AskPanel` (`role="dialog" aria-modal`, `lg:` right side panel, below `lg` a bottom sheet capped at `85dvh`, `z-50` with a backdrop). Focus moves to the input on open; Tab/Shift+Tab wrap inside; Esc and the close button call `closeAsk()`, which returns focus to the launcher ref.
- `src/components/Layout.jsx` — wrap in `AskProvider`, render `<AskLauncher />` and `<AskPanel />` beside `<TabBar />` (the Layout root already pads `pb-[calc(4rem+…)]` below `lg`). Read the root's classes first: the new nodes are `fixed`, so they add no spacing and no grid cell.
- `src/pages/AskPage.jsx` — shrinks to `SectionHeader` + `<AskChat />`; keeps exporting `renderReply` (re-export).
- `src/pages/HomePage.jsx` — an "Ask anything…" form above `QuickLinks` that calls `openAsk(question)`; `openAsk` sends once the panel is mounted.
- `server/lib/ask.js` — `programmeOn(day)`: one line per session (`id | title | HH:MM-HH:MM | room | track | N seats left`) from `hydrateSessions(db.prepare(`${SESSION_SELECT} WHERE s.day = ? ORDER BY s.starts_at, r.name`))`, cached per day for 30 s. `pageContext({ route, sessionId, speakerId })` looks the id up (title, time, room, or the speaker's name) and returns a sentence. `askSystemPrompt` gains `programme` and `page`, adds both, and says the programme list answers most questions so tools are for other days, speakers and travel.
- `server/routes/ask.js` — read `route`, `sessionId`, `speakerId`; pass `programme: programmeOn(day)` and `page`. Before `pipeUIMessageStreamToResponse`, set `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, then `res.flushHeaders()`. `vite.config.js` — the `/api` proxy needs no change; the browser spec in this file's row below runs through it.
- Tests, none reaching a provider:
  - `tests/api/ask.test.js` — `startApi()`, `setAskModel` with `MockLanguageModelV2` as today. (a) A recording stub with `{ route: '/sessions/<id>', sessionId }` posted: the system text names that session's title (read from `/api/sessions/:id`). (b) A stub that emits a text delta, then waits on a gate: `fetch` the response, read the first chunk, assert it arrived while the gate is still closed, check the `x-accel-buffering` and `no-transform` headers, then release.
  - `tests/unit/ask-prompt.test.js` — `import './sandbox-db.js'` first (as it does). `programmeOn(day)` lists every session of the day with its id, title, room and seats left; `askSystemPrompt({ programme, page })` contains both.
  - `tests/ask-panel.spec.js` (new) — read-only, no data lane; `visit(page, route, { as: ATTENDEES.jonas, at: await momentOn(1, '14:00') })`; `page.route('**/api/ask')` fulfils UI-message SSE as `tests/ask.spec.js` does. Streaming proof: `page.addInitScript` replaces `window.fetch` for `/api/ask` with a `ReadableStream` Response whose second chunk waits on `window.__release`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| The panel opens from every page and from Home's input, on desktop and at 375px | for `/`, `/schedule`, `/speakers`, `/my-agenda`, `/for-you`, `/venues`, `/food`, `/expo`, `/sessions/<id>`: click the launcher, `getByRole('dialog', { name: 'Ask ORBIT' })` is visible; Home input submit shows the dialog and the question as the first user message. False on main: no launcher exists | Browser (`tests/ask-panel.spec.js`, both projects, 375px via `setViewportSize`) |
| It does not overlap the tab bar | at 375px the launcher's bounding box and the `Tabs` nav's do not intersect, and `scrollWidth <= innerWidth` | Browser |
| Esc and close work; focus returns to the button | Esc, then the close button: dialog gone and `document.activeElement` is the launcher; Tab 12 times stays inside the dialog | Browser |
| On a session page the request carries that session's id and the prompt mentions it | browser: captured `postDataJSON()` has `sessionId` and `route`; API: the stub's system text contains that session's title | Browser + API (`tests/api/ask.test.js`) |
| First text appears in the page before the stream finishes | the init-script stream sends a text delta and holds; assert the text is visible and `window.__release` has not run, then release | Browser |
| The server's response is chunked, not buffered | API: first chunk read before the stub's gate opens, plus the no-buffer headers (false on main: headers are not set) | API |
| The system prompt contains today's programme summary | `askSystemPrompt({ programme: programmeOn(day) })` has each of the day's sessions' ids, titles, rooms and seats left | Unit (`tests/unit/ask-prompt.test.js`) |
| Tests never call a real provider | `AI_GATEWAY_API_KEY` deleted in the API file; every browser case fulfils or replaces `/api/ask` | API + Browser |

## Decisions
- Two criteria already hold in part on this branch: the response is a UI message stream that Node writes chunk by chunk, and no test reaches a provider. Is the right reading that this build proves the first chunk precedes completion and adds the no-buffer headers and flush, rather than treating streaming as already done?
- Should the floating button be hidden on `/ask`, since that page is the same chat full-size?
- Should the chat live once, in a provider above the routes, so the panel and `/ask` show the same conversation?
- Should the programme summary be cached for 30 seconds per day, so seats left may lag a booking by up to that long?
- When the panel is opened from Home's input, should focus return to the floating button on close, as for every other opener?

## Out of scope
Persisting conversations across a reload, booking from the panel, the Haiku comparison, and changing the tool set.
