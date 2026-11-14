# Multi-select Track filter on the schedule

- **Title:** Picking more than one track in the `/schedule` Track filter
- **Date:** 2026-11-14
- **Participants:** Unknown (single speaker in the demo transcript)
- **Source:** `context/winnow-transcripts/demo-transcript.txt`
- **Tickets raised:** [#1 Pick more than one track in the schedule's Track filter](https://github.com/brookie32/nam-2026-conference/issues/1)
- **Context updated:** None. `engineering-context/schedule.md` already describes the multi-value filter convention the change should follow; the pull request keeps it true.
- **Set aside:**
  - "So let's take a look at the website" — small talk, nothing to act on.
  - "philtre" — a transcription slip for "filter".
  - "the search function" — read as the `/schedule` filter rail, not the search box.
  - A multi-select Track filter on the Speakers page — not asked for; it stays single-select.
- **Q&A:**
  - *Which page should allow several tracks — `/schedule`, `/speakers`, or both?* `/schedule` only; Speakers stays single-select.
  - *How does the All pill behave?* All clears every picked track, and un-picking the last track returns to All.
  - *`schedule.md` describes `?track=a,b` → `IN (?, ?)`, but the code still matches one slug. Fix the doc or follow it?* Follow it: it is the how-to for this ticket, and no context edit is needed now.
