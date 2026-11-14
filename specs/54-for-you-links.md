# For you in Home's quick links and the footer (#54)

## What this changes
For you is in the main nav, but Home's "Explore the conference" links and the footer's Programme column
leave it out, so on a phone it is two taps away. Both now list it.

## Where
- `src/pages/HomePage.jsx` — `LINKS` gains For you after Schedule ("Talks picked for you", `sparkle` icon).
- `src/components/Layout.jsx` — the footer's Programme column gains For you.
- `tests/home.spec.js` — the quick-links test expects six links, For you among them.

## Done when
| Criterion | Proof |
| --- | --- |
| Home's quick links include For you → `/for-you` | `tests/home.spec.js` "it links to every main page" |
| The footer Programme column lists For you | same spec, footer assertion |
