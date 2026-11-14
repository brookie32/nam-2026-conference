# Press 9 for release notes: everything shipped today

## What this changes
Pressing **9** anywhere inside the app shell (not in an input, textarea, select or contenteditable, and not with Ctrl/Cmd/Alt) opens a **Release notes** dialog listing the six groups from the ticket, each item one line with its issue number linking to `https://github.com/brookie32/nam-2026-conference/issues/<n>`. 9 again or Escape closes it and focus returns to what had it. On a phone it is a bottom sheet capped at `max-h-[85dvh]` with its own scroll. The footer shows "Press 9 for release notes".

## Where
- `src/lib/releaseNotes.js` — new; `RELEASE_NOTES` = `[{ group, items: [{ title, issues: [n…] }] }]` and `issueUrl(n)`; content verbatim from the ticket.
- `src/components/ReleaseNotesDialog.jsx` — new; `ReleaseNotesDialog({ open, onClose })`, copied from `ConflictDialog.jsx` (portal to `document.body`, `fixed inset-0 z-[70]`, `role="dialog"`, `aria-modal`, `aria-labelledby`, `data-testid="release-notes"`, backdrop `Close` button, `animate-rise` panel, `max-h-[85dvh] overflow-y-auto`). Focuses the panel on open, wraps Tab inside it, restores the opener's focus and body overflow on close.
- `src/components/Layout.jsx` — `Shell`: `useState` for open, a `keydown` effect on `document` toggling on `e.key === '9'` (skipping modifiers, `e.repeat`, and targets that are input/textarea/select/contenteditable), render `<ReleaseNotesDialog>`; footer bottom row gets the hint. Presentation decks sit outside `Layout`, so their own keys are untouched.
- Test `tests/release-notes.spec.js` — read-only, no data lane; uses `visit`, `failOnPageErrors` from `tests/helpers.js`; the unit-level data check goes in `tests/unit/release-notes.test.js`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| 9 on Home, Schedule, My Agenda opens the dialog with all six groups; Escape and 9 close it; focus returns | for each route press 9, expect `release-notes` visible with six `h3` group headings, press Escape then 9 again then 9, expect hidden and focus back on the previously focused element | Playwright |
| Typing 9 in the schedule search box or the Ask ORBIT input does not open it | focus the schedule search and `ask-input`, type `9`, expect the dialog absent and the value `9` | Playwright |
| Each item's issue number links to the fork's issue | every link in the dialog has href `https://github.com/brookie32/nam-2026-conference/issues/<n>`; unit test that every number in `RELEASE_NOTES` maps through `issueUrl` and that the six groups and ticket numbers are present | Playwright + unit |
| Works on desktop and at 375px with no horizontal overflow | at 375x667 open it, expect `scrollWidth <= clientWidth` on the document and panel, panel height `<= 85dvh`, last group scrollable into view | Playwright (mobile project) |

## Decisions
- Is 9 ignored while another dialog (the conflict dialog) is open, rather than stacking on it? Ask ORBIT's panel does not count; release notes open above it.
- Is the hint shown in the footer's bottom row on every viewport (the footer is already visible on phones above the tab bar)?
- Is a key repeat (holding 9) ignored so it does not flicker open and shut?

## Out of scope
Any change to the notes' content after the ticket's list; a visible button to open it (keyboard only, per the ticket).
