# Make travel warnings and free-time gaps stand out on My Agenda (#60)

## What this changes
`TravelNote` in `src/pages/MyAgendaPage.jsx` becomes a connector card between the two sessions: amber
"Tight connection" with an alert icon when the gap is too short, blue "Travel to <venue>" with a car icon
otherwise, minutes now always shown with their unit. `GapRow` becomes a tinted card with a violet accent
edge, a clock icon, "Free time · N min" and a "Talks that fit" label. Test ids, data attributes and the
"N min by Mode" / "you have N" wording the specs read are unchanged.

## Done when
| Criterion | Proof |
| --- | --- |
| Travel and gap rows render as cards; specs unchanged | `tests/agenda.spec.js` (8 passed) |
| No horizontal overflow at 375px | `tests/agenda.spec.js` overflow check |
