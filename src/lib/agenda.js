import { toMinutes } from './clock.js';

const length = (s) => toMinutes(s.endsAt) - toMinutes(s.startsAt);

/** Pairwise overlap, both statuses — the same rule as the API's `clashesIn`. */
function clashesIn(sessions) {
  const out = [];
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const [a, b] = [sessions[i], sessions[j]];
      if (a.startsAt < b.endsAt && b.startsAt < a.endsAt) out.push({ type: 'overlap', sessionIds: [a.id, b.id] });
    }
  }
  return out;
}

/**
 * The fetched schedule re-read through the store: `reservationFor` is the source
 * of truth for what is still held, so a removed session leaves at once. Each day
 * comes back in start order with its conflicts, confirmed minutes, waitlisted
 * minutes and venues recomputed; days with nothing left are dropped.
 */
export function agendaDays(days, reservationFor) {
  return (days ?? []).flatMap((day) => {
    const sessions = day.sessions
      .map((s) => ({ ...s, reservation: reservationFor(s.id) }))
      .filter((s) => s.reservation)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
    if (!sessions.length) return [];
    const minutes = (status) => sessions.filter((s) => s.reservation === status).reduce((n, s) => n + length(s), 0);
    return [{
      ...day,
      sessions,
      conflicts: clashesIn(sessions),
      totalMinutes: minutes('confirmed'),
      waitlistedMinutes: minutes('waitlisted'),
      venuesVisited: [...new Set(sessions.map((s) => s.venue.shortName))],
    }];
  });
}

/** Today's day first (when it has reservations), the rest by date. */
export function orderDays(days, today) {
  return [...days].sort((a, b) => (b.date === today) - (a.date === today) || a.date.localeCompare(b.date));
}

/** The confirmed session in progress at `nowHHMM`, else the next confirmed one to start; never a waitlist place. */
export function focusSession(day, nowHHMM) {
  const now = toMinutes(nowHHMM);
  const mine = day.sessions.filter((s) => s.reservation === 'confirmed');
  return mine.find((s) => toMinutes(s.startsAt) <= now && now < toMinutes(s.endsAt))
    ?? mine.find((s) => toMinutes(s.startsAt) > now) ?? null;
}
