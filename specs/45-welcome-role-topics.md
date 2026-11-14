# Welcome on Home: pick your role and topics on first visit

## What this changes
An attendee with no picked tracks or topics now sees a dismissible **Welcome** panel on Home, between the hero and Up next: "What's your role?" (the three personas in `context/product-context/user-personas.md`: All-week VIP, Short-stay attendee, Speaking attendee) and "Pick 3 or more topics" (the same track and topic chips as /for-you). Choosing a role pre-selects three suggested topics. **Save** stores the picks and the role, the panel goes away and Recommended for you refreshes with no reload. **Skip for now** hides it for that attendee across reloads (localStorage). Attendees with interests never see it; /for-you is unchanged.

## Where
- `server/db.js` — `user_interests` CHECK (line ~201): add `'role'` to `kind IN (...)`. Existing dev databases keep the old CHECK until reseeded (`npm run verify` reseeds).
- `server/routes/users.js` — `PUT /:id/interests` (~line 91) and `saveInterests` (line 32): accept optional `role` (string, one of the three role slugs, else 400; omitted clears it, as the PUT replaces the set), insert it as kind `'role'`. `server/lib/query.js` `toInterests` (~201): return `role` (slug or `null`). `server/lib/recommend.js` is untouched: it reads only `track`/`tag` rows, so a role never counts as a pick.
- `src/lib/roles.js` (new) — `ROLES`: slug, name, one-line blurb, and three suggested topic slugs each (read real slugs off `/api/bootstrap` tags of kind `topic`).
- `src/components/WelcomePanel.jsx` (new) — fetches `api.getInterests(currentUserId)`; renders nothing while loading, when tracks+tags are non-empty, or when `localStorage['orbit:welcome-skipped:<id>']` is set (try/catch around storage). Role buttons (`welcome-role`, `aria-pressed`), chips (`welcome-chip`), `welcome-save` (disabled below 3 picks) calling `api.saveInterests` with `{tracks, tags, role}`, `welcome-skip`. Role buttons stack and chips wrap at 375px (`min-w-0`, `flex-wrap`).
- `src/pages/HomePage.jsx` — `HomePage` (line 92): add `<Reveal><WelcomePanel onSaved={bump} /></Reveal>` after `HeroBar`; own a `picksVersion` state and pass it to `RecommendedStrip`. Spacing stays with the root `space-y-8`, and an empty panel is hidden by its `[&>:empty]:hidden`; no existing element moves, so every breakpoint keeps its layout.
- `src/components/RecommendedStrip.jsx` — `useFetch` deps (line ~15): add the `picksVersion` prop so the strip refetches after Save.
- `src/pages/ForYouPage.jsx` — `NONE` (line 6) gains `role: null` so its PUTs keep the stored role (it spreads the loaded interests already).
- `server/seed.js` — after the last random draw (so the PRNG stream and every fixture is unchanged), insert four welcome-only attendees, ids 7–10, no plan, no follows, `interests` empty; `tests/helpers.js` `ATTENDEES` gains `welcomeA`..`welcomeD`. Update `context/engineering-context/seed.md`.
- Tests: `tests/api/recommendations.test.js` (role round-trip, unknown role 400, `{tracks, tags, role: null}` shape: update its three `deepEqual`s) using its `api`/`pick` helpers; `tests/welcome.spec.js` (new) using `laneFor('home.welcome', testInfo)`, `visit(page, '/', { as, at })`, `momentOn`, `shotForPR`. New `LANES['home.welcome']` in `tests/helpers.js`: `{ desktop: { user: welcomeA, other: welcomeB, day: 0, readOnly: true }, mobile: { user: welcomeC, other: welcomeD, day: 0, readOnly: true } }`, attendees no other lane uses.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| No interests sees welcome; with interests does not | `welcome.spec.js`: lane attendee shows `welcome-panel`; after `PUT` of one track, reload and the panel count is 0 | browser |
| Role pre-selects topics; Save stores them; strip updates without reload | click `welcome-role`, assert 3 `welcome-chip` pressed, Save, assert `GET /interests` returns those tags and `role`, panel gone, and a `recs-item` whose `recs-reason` names a picked topic, with no navigation | browser |
| Role stored as its own kind | `recommendations.test.js`: PUT `role` returns it on GET, unknown role is 400, `tracks`/`tags` unchanged by it | API |
| Skip persists across reloads; another attendee still sees it | Skip, reload, panel count 0; `visit` as `other`, panel visible | browser |
| Desktop and 375px, no horizontal overflow, own lane | same spec on both projects with `scrollWidth <= innerWidth` while the panel is open; lane is the new `home.welcome` | browser |

## Decisions
- Add four seeded welcome-only attendees (ids 7–10, appended after all random draws), since all six existing attendees already have interests written by other lanes and a spec that clears them would cross-talk. OK?
- Treat "has interests" as at least one picked track or topic, so a stored role alone does not hide the welcome? OK?
- Use the three personas headings as the roles, with my suggested topics per role (VIP: Agent Design, Governance, Observability; Short-stay: Evaluation, Prompt Engineering, Cost Optimization; Speaking: Context Engineering, Code Generation, Red Teaming)? OK?
- Save is disabled until 3 tracks or topics are picked, matching "Pick 3 or more"? OK?

## Out of scope
Changing /for-you, ranking by role, and migrating existing databases (reseed).
