/**
 * The three attendee personas (context/product-context/user-personas.md) the Home welcome
 * offers. `slug` is what the interests API stores as the attendee's role; `topics` are the
 * topic-tag slugs a role pre-selects. server/routes/users.js holds the same three slugs.
 */
export const ROLES = [
  { slug: 'vip', name: 'All-week VIP', blurb: 'Here for all four days and want the whole picture.',
    topics: ['agent-design', 'governance', 'observability'] },
  { slug: 'short-stay', name: 'Short-stay attendee', blurb: 'In for a day or two and want the talks that count.',
    topics: ['evaluation', 'prompt-engineering', 'cost-optimization'] },
  { slug: 'speaking', name: 'Speaking attendee', blurb: 'On stage this week and fitting the rest around it.',
    topics: ['context-engineering', 'code-generation', 'red-teaming'] },
];

/** Picks needed before the welcome can be saved. */
export const MIN_PICKS = 3;
