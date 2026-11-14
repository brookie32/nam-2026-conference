# Ask ORBIT reads your whole agenda and ratings, and recommends from them (#62)

## What this changes
Ask ORBIT only saw the asking attendee's sessions for today. It now has two tools bound to that attendee:
`myAgenda` — every day they hold a seat or waitlist place on, each session with status, check-in and
their stars, plus all their ratings lowest first — and `recommendForMe` — the For you ranking
(`rankedFor`: interests, followed speakers, ratings) with reasons. The system prompt says when to use them.

## Where
- `server/lib/ask.js` — `myAgenda`, `recommendForMe`, `askToolsFor({ userId, day, time })` (the shared
  `askTools` plus the two personal tools); ratings queries prepared at module scope.
- `server/routes/ask.js` — passes the attendee and moment into `askToolsFor`.
- `tests/api/ask-personal.test.js` — both tools against a seeded database, and an unknown attendee.

## Done when
| Criterion | Proof |
| --- | --- |
| `myAgenda` returns every day with status, check-in, stars; ratings lowest first | API test |
| `recommendForMe` returns up to 10 open picks with reasons | API test |
| Unknown attendee → empty, no error | API test |
| "My lowest rated sessions" and "recommend from what I rated highly" answered correctly | checked live |
