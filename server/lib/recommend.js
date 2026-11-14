import { db } from '../db.js';
import { SESSION_SELECT, hydrateSessions, toMinutes } from './query.js';

/**
 * "For you": talks an attendee can still get into, ranked by what they picked.
 *
 * `rankRecommendations` is pure — hand it sessions and what we know about the
 * attendee — so the rules are tested without a database. `recommendationsFor`
 * loads that data. A pick (track, topic, followed speaker) outweighs a taste
 * inferred from the agenda, which only breaks a tie among the rest. Ratings sit
 * between: +/-1 per 4-5 / 1-2 star session sharing a topic or speaker, clamped
 * to +/-RATED.
 */

const LIMIT = 10;
const PICKED = 3;
const FROM_AGENDA = 1;
const RATED = 2; // the most ratings can move a score; under a pick's 3, so a pick always leads

const overlap = (a, b) =>
  a.day === b.day && toMinutes(a.startsAt) < toMinutes(b.endsAt) && toMinutes(b.startsAt) < toMinutes(a.endsAt);

/** Same rule as src/lib/clock.js `hasEnded`: over once its end time is reached. */
const hasEnded = (s, now) =>
  s.day < now.day || (s.day === now.day && toMinutes(s.endsAt) <= toMinutes(now.time));

/**
 * `booked` is every session they hold a seat or waitlist place for, with its
 * `status`. Result: `{ items: [{ session, reasons }], needsInterests }`.
 */
export function rankRecommendations({ sessions, interests, followedSpeakerIds, agendaTagSlugs, booked, rated = [], now }) {
  const picked = new Set([...interests.tracks, ...interests.tags]);
  if (!picked.size && !booked.length) return { items: [], needsInterests: true };

  const held = new Set(booked.map((b) => b.id));
  const seats = booked.filter((b) => b.status === 'confirmed');
  const followed = new Set(followedSpeakerIds);
  const taste = new Set(agendaTagSlugs);

  const items = [];
  for (const s of sessions) {
    if (s.isKeynote || s.format === 'Social') continue;
    if (hasEnded(s, now) || s.seatsTaken >= s.capacity) continue;
    if (held.has(s.id) || seats.some((b) => overlap(b, s))) continue;

    const reasons = [];
    let score = 0;
    if (interests.tracks.includes(s.track.slug)) { reasons.push(`${s.track.name} track`); score += PICKED; }
    for (const t of s.tags) {
      if (interests.tags.includes(t.slug)) { reasons.push(t.name); score += PICKED; }
    }
    for (const sp of s.speakers) {
      if (followed.has(sp.id)) { reasons.push(`you follow ${sp.name}`); score += PICKED; }
    }
    if (s.tags.some((t) => taste.has(t.slug))) { reasons.push('like your agenda'); score += FROM_AGENDA; }
    let delta = 0;
    for (const r of rated) {
      if (r.stars === 3) continue;
      const shares = r.tags.some((t) => t.kind === 'topic' && s.tags.some((x) => x.kind === 'topic' && x.slug === t.slug))
        || r.speakers.some((sp) => s.speakers.some((x) => x.id === sp.id));
      if (!shares) continue;
      delta += r.stars > 3 ? 1 : -1;
      reasons.push(`you rated ${r.title} ${r.stars}★`);
    }
    score += Math.max(-RATED, Math.min(RATED, delta));
    if (score > 0) items.push({ session: s, reasons, score });
  }

  items.sort((a, b) => b.score - a.score || b.session.avgRating - a.session.avgRating || a.session.id - b.session.id);
  return {
    items: items.slice(0, LIMIT).map(({ session, reasons }) => ({ session, reasons })),
    needsInterests: false,
  };
}

// Prepared on first use, so the pure ranking above can be loaded without a database.
let q;
const queries = () => q ??= {
  everySession: db.prepare(`${SESSION_SELECT} ORDER BY s.day, s.starts_at, s.id`),
  reservedEver: db.prepare(`${SESSION_SELECT}
    JOIN reservations r ON r.session_id = s.id AND r.user_id = ?`),
  rated: db.prepare(`${SESSION_SELECT}
    JOIN ratings rt ON rt.session_id = s.id AND rt.user_id = ?`),
  stars: db.prepare('SELECT session_id, stars FROM ratings WHERE user_id = ?'),
  statuses: db.prepare('SELECT session_id, status FROM reservations WHERE user_id = ?'),
  pickedInterests: db.prepare('SELECT kind, slug FROM user_interests WHERE user_id = ?'),
  follows: db.prepare('SELECT speaker_id FROM speaker_follows WHERE user_id = ?').pluck(),
};

export function recommendationsFor(userId, now) {
  const { everySession, reservedEver, rated, stars, statuses, pickedInterests, follows } = queries();
  const status = new Map(statuses.all(userId).map((r) => [r.session_id, r.status]));
  const booked = hydrateSessions(reservedEver.all(userId)).map((s) => ({ ...s, status: status.get(s.id) }));
  const starsById = new Map(stars.all(userId).map((r) => [r.session_id, r.stars]));
  const ratedSessions = hydrateSessions(rated.all(userId)).map((s) => ({ ...s, stars: starsById.get(s.id) }));
  const rows = pickedInterests.all(userId);

  return rankRecommendations({
    sessions: hydrateSessions(everySession.all()),
    interests: {
      tracks: rows.filter((r) => r.kind === 'track').map((r) => r.slug),
      tags: rows.filter((r) => r.kind === 'tag').map((r) => r.slug),
    },
    followedSpeakerIds: follows.all(userId),
    agendaTagSlugs: booked.flatMap((s) => s.tags.filter((t) => t.kind === 'topic').map((t) => t.slug)),
    booked,
    rated: ratedSessions,
    now,
  });
}
