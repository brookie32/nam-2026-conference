# Ask ORBIT: a chat about the programme

## What this changes
A new **Ask ORBIT** page at `/ask`, linked from the main nav and the mobile menu. An attendee types a question ("AI agent talks on Day 2 afternoon at Aurora that aren't full") and the answer streams in as it is written. It is written by a Claude model through the Vercel AI SDK and AI Gateway, using `AI_GATEWAY_API_KEY`. The model can only look things up through tools that call the app's own queries (sessions, speakers, venues and travel), and every session it names is a link to `/sessions/:id`. With no key set, the page says "Ask ORBIT isn't configured" and `POST /api/ask` returns 503. Nothing is remembered between visits and no seats are taken.

## Where
- `package.json` — add `ai` (and the gateway provider if the installed `ai` major does not bundle it) to `dependencies`, on purpose; lockfile with it.
- `server/lib/ask.js` (new) — `askModel()` returns the injected model, else the gateway model when `process.env.AI_GATEWAY_API_KEY` is set, else `null` (read per request, so a test can unset it); `setAskModel(m)` is the test seam. `askTools` are AI SDK tools over the existing queries: `searchSessions` (day, trackSlug, venueId, from/to time, q, `notFull`) built on `SESSION_SELECT` + `hydrateSessions` from `server/lib/query.js` and `seatState` from `server/lib/seats.js`; `findSpeakers`; `venuesAndTravel`. Each returns id, title, day, time, room and venue so a link can be built. The system prompt says: answer only from tool results, link each session as `[title](/sessions/<id>)`, never invent.
- `server/routes/ask.js` (new) — `askRouter.post('/')`: 503 `{ error: 'Ask ORBIT is not configured' }` without a model, 400 without a non-empty `messages` array, else `streamText({ model, system, messages, tools, stopWhen })` piped as a plain text stream (`pipeTextStreamToResponse`). Mounted in `server/index.js` as `app.use('/api/ask', askRouter)`.
- `src/lib/api.js` — one function, `askOrbit(messages, { signal })`: POSTs and returns the response body reader; throws the same `Error` with `status` on 503. The page never calls `fetch`.
- `src/pages/AskPage.jsx` (new) and a `<Route path="ask">` in `src/App.jsx` — heading "Ask ORBIT"; a message list, a textarea and Send button (input is `min-h-11`, full width, so it holds at 375px); reads the stream and appends text; `/sessions/<id>` markdown links render as `<Link>`, any other link renders as plain text. `data-testid` on the message list, the input and the not-configured notice. Not-configured is learned from the 503 on send, so there is no probe endpoint.
- `src/components/Layout.jsx` — add `{ to: '/ask', label: 'Ask ORBIT', icon: 'chat' }` to `NAV` (feeds the desktop nav and the mobile menu). `src/components/Icon.jsx` — add a `chat` icon. Check the eight-item desktop nav still fits at 1024px (`lg`); tighten its padding if it wraps.
- Tests, all without network: `tests/api/ask.test.js` (new, `startApi()` from `tests/api/harness.js`; `setAskModel` with the AI SDK's mock model from `ai/test`) — a stub that calls `searchSessions` and then writes its answer from the tool result, and the no-key case with `AI_GATEWAY_API_KEY` deleted and no model set. `tests/ask.spec.js` (new, Playwright, `visit()` from `tests/helpers.js`, read-only so no data lane) — `page.route('**/api/ask', …)` fulfils a text body, and a second case fulfils 503. Add `/ask` to `ROUTES` in `tests/smoke.spec.js`. In `tests/api/endpoints.test.js` the mounted-route regex matches only `get|put|delete`, so a `post` escapes it: extend it to include `post` and add `'POST ask/'` to `covered`.
- `CLAUDE.md` and `context/engineering-context/architecture.md` — the route table gains `/ask`; note `AI_GATEWAY_API_KEY`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| With the model stubbed, asking about Day 2 afternoon sessions on a track returns an answer naming only real sessions, each linked to `/sessions/:id` | POST a question with the stub; every `/sessions/<id>` link in the text returns 200 from `/api/sessions/:id`, and the set of linked ids equals the Day 2 afternoon sessions on that track read from `/api/sessions?day&trackSlug`. False on main: there is no `/api/ask` | API (`tests/api/ask.test.js`) |
| The same, as the attendee sees it | a stubbed answer with a `[title](/sessions/<id>)` link renders an anchor with that `href`; a link to anything else renders as text | Browser (`tests/ask.spec.js`) |
| With no key, the page shows the not-configured message and the API returns 503 | API: no key and no model gives 503 with the message. Browser: a stubbed 503 on send shows "Ask ORBIT isn't configured" | API + Browser |
| Replies stream into the page | API: the stub streams several chunks and the test reads the body as a stream, asserting more than one chunk arrives before it ends. Browser: the answer text appears and Send is disabled while the request is pending | API + Browser |
| The input is usable at 375px and on desktop | browser test on both projects: input and Send visible, input at least 44px tall, no horizontal overflow (smoke also covers `/ask`) | Browser |
| No test makes a network call to a model provider | the API test installs the mock model with `AI_GATEWAY_API_KEY` unset, so a call that reached the gateway would fail; the browser spec stubs `/api/ask` | API + Browser |

## Decisions
- Is a plain text stream (not the AI SDK's UI message protocol) enough, so the client needs no extra dependency?
- Should the page learn "not configured" from the 503 after the first send, rather than from a new status endpoint?
- Should the conversation live only in component state, so a refresh clears it?
- Should session links be markdown the model writes and the client renders only for `/sessions/:id`, with the system prompt and tool results as the guard against invented sessions?
- Should the model default to `anthropic/claude-sonnet-4.5` through the gateway, overridable with `ASK_ORBIT_MODEL`?
- Is "Ask ORBIT" as an eighth item in the shared `NAV` right, given the bottom tab bar stays at four tabs?

## Out of scope
Remembering conversations between visits; taking seats from the chat.
