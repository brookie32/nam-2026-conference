# Render tables in Ask ORBIT answers

## What this changes
A Markdown table in an Ask ORBIT reply (header row, `| --- |` separator, body rows) shows as a real table instead of raw `| Mode | … |` text. It uses the app's tokens (hairline borders, surface header, muted header text). It sits in its own scroll box inside the reply, so on a phone a wide table scrolls sideways and the page does not widen. `[title](/sessions/<id>)` links inside cells are still links; other links stay plain text. Text around a table renders as before.

## Where
- `src/pages/AskPage.jsx` — add `splitReply(text)`, which walks the lines and returns blocks: a run of `|` lines whose second line is a separator row (`|---|:--:|`) becomes `{ table: { head, rows } }`, everything else stays text. `renderReply` keeps its signature and link rule; new `ReplyBody` renders text blocks through it and tables as `<div class="overflow-x-auto"><table>` with each cell passed through `renderReply`. The assistant bubble's empty check uses the blocks. The user bubble is unchanged. No new dependency (the page uses no Markdown library).
- Streaming: a half-streamed table (no separator row yet) is plain text until the separator arrives, then becomes a table.
- Test in `tests/ask.spec.js` using `visit()` and `page.route('**/api/ask', …)` (read-only, no data lane), plus `page.setViewportSize` for 375px.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| A stubbed table reply renders a `<table>` with the right header and rows, and no raw `\|` text | stub a 3-column table; assert `columnheader` names, the row cells, and that the message text has no `\|`. False on main: no `<table>` is rendered | Browser (`tests/ask.spec.js`) |
| A `[title](/sessions/<id>)` link in a cell is a link | same stub, a cell holding a session link; assert `getByRole('link')` inside the table with that `href`, and that a non-session link in a cell is text | Browser |
| At 375px a wide table scrolls inside the reply, no page overflow | `setViewportSize(375)`, stub a table too wide for it; assert the table wrapper's `scrollWidth > clientWidth` and `documentElement.scrollWidth <= innerWidth`. False on main: raw text wraps, no wrapper | Browser |
| Existing Ask ORBIT specs still pass; stubbed model only | the existing case in `tests/ask.spec.js` and `tests/api/ask.test.js` run unchanged; every new case fulfils `/api/ask` | Browser + API |

## Decisions
- The app has no other `<table>` to copy, so should the styling come from the shared tokens (`border-hairline`, `bg-surface`, `text-muted`) rather than a new component in `ui.jsx`?
- Should only tables with a separator row count (a lone `|` line stays text)?

## Out of scope
Other Markdown (bold, headings, lists) and column alignment from `:--:`.
