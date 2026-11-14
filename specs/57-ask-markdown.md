# Ask ORBIT: format bold, lists and headings instead of showing raw Markdown (#57)

## What this changes
Ask ORBIT replies showed raw Markdown (`- **Shuttle:** …`). The chat now renders the Markdown the model
writes — bold, italic, inline code, bullet and numbered lists, short headings and paragraphs — beside the
existing session links and tables. No new dependency.

## Where
- `src/lib/splitReply.js` — splits a reply into `{ text }`, `{ heading }`, `{ list: { ordered, items } }`
  and `{ table }` blocks; a blank line ends a paragraph.
- `src/components/AskChat.jsx` — `renderReply` handles links (only `/sessions/:id` becomes a link),
  `**bold**` (which may wrap a link), `` `code` `` and `*italic*`; `ReplyBody` renders lists and headings.
- `tests/unit/split-reply.test.js` — lists, ordered lists, headings, paragraphs, and tables beside lists.

## Done when
| Criterion | Proof |
| --- | --- |
| `splitReply` returns list, heading and paragraph blocks; tables still work | unit tests |
| `- **Shuttle:** …` renders as a bullet with a bold label, no raw `*`/`-` | checked live in the panel |
