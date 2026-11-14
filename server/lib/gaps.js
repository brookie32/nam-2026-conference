import { db } from '../db.js';
import { toMinutes, toTravel } from './query.js';
import { assessTravel } from '../../src/lib/travel.js';
import { rankedFor } from './recommend.js';

/**
 * "Fill my gaps": the free stretches between an attendee's confirmed sessions,
 * and the talks that fit inside them.
 *
 * `findGaps` and `suggestForGap` are pure — hand them sessions — so the rules
 * are tested without a database. `gapsFor` loads the data. A waitlist place
 * never bounds a gap, and nothing before the first or after the last seat of a
 * day counts.
 */

const MAX_SUGGESTIONS = 3;

/**
 * `sessions` carry a `status`. Result, in day then time order:
 * `{ day, startsAt, endsAt, minutes, before, after }` where `before` is the
 * session that ends the latest so far and `after` the one that follows the gap.
 * Gaps already over at `now` ({ day, time }) are dropped.
 */
export function findGaps(sessions, now, { min = 45 } = {}) {
  const byDay = new Map();
  for (const s of sessions) {
    if (s.status !== 'confirmed' || s.day < now.day) continue;
    byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  }

  const gaps = [];
  for (const day of [...byDay.keys()].sort()) {
    const mine = byDay.get(day).sort((a, b) => toMinutes(a.startsAt) - toMinutes(b.startsAt) || a.id - b.id);
    let before = mine[0];
    for (const after of mine.slice(1)) {
      const minutes = toMinutes(after.startsAt) - toMinutes(before.endsAt);
      const over = day === now.day && toMinutes(after.startsAt) <= toMinutes(now.time);
      if (minutes >= min && !over) {
        gaps.push({ day, startsAt: before.endsAt, endsAt: after.startsAt, minutes, before, after });
      }
      if (toMinutes(after.endsAt) > toMinutes(before.endsAt)) before = after;
    }
  }
  return gaps;
}

/**
 * Up to three of `ranked` (`[{ session, reasons }]`, best first) that start and
 * end inside the gap, are open, and can be reached from the session before it.
 * Talks at the venue of the session before or after the gap come first.
 */
export function suggestForGap({ gap, ranked, travel, now }) {
  const from = toMinutes(gap.startsAt);
  const earliest = gap.day === now.day ? Math.max(from, toMinutes(now.time)) : from;
  const venues = new Set([gap.before.venue.id, gap.after.venue.id]);

  const fits = ranked.filter(({ session: s }) => {
    if (s.day !== gap.day || toMinutes(s.startsAt) < earliest || toMinutes(s.endsAt) > toMinutes(gap.endsAt)) return false;
    if (s.seatsTaken >= s.capacity) return false;
    const trip = assessTravel({
      travel, from: gap.before, to: s, gapMinutes: toMinutes(s.startsAt) - toMinutes(gap.before.endsAt),
    });
    return !trip?.impossible;
  });

  const near = fits.filter(({ session: s }) => venues.has(s.venue.id));
  const far = fits.filter(({ session: s }) => !venues.has(s.venue.id));
  return [...near, ...far].slice(0, MAX_SUGGESTIONS);
}

let q;
const queries = () => q ??= { travel: db.prepare('SELECT * FROM venue_travel') };

/** `{ gaps: [{ day, startsAt, endsAt, minutes, previousId, nextId, suggestions: [{ session, reasons }] }] }` */
export function gapsFor(userId, now) {
  const { booked, items } = rankedFor(userId, now, Infinity);
  const travel = queries().travel.all().map(toTravel);
  const gaps = findGaps(booked, now).map(({ before, after, ...gap }) => ({
    ...gap,
    previousId: before.id,
    nextId: after.id,
    suggestions: suggestForGap({ gap: { ...gap, before, after }, ranked: items, travel, now }),
  }));
  return { gaps };
}
