import { Router } from 'express';
import { db } from '../db.js';
import { SESSION_SELECT, toUser, toSpeaker, toSession, toInterests } from '../lib/query.js';
import { reserveSeat, releaseSeat, seatState } from '../lib/seats.js';
import { attendanceState, checkIn, rateSession } from '../lib/attendance.js';
import { todayFor, scheduleFor } from '../lib/agenda.js';
import { recommendationsFor } from '../lib/recommend.js';
import { agendaCalendar, baseUrlFor } from '../lib/ical.js';

export const usersRouter = Router();

const allUsers = db.prepare('SELECT * FROM users ORDER BY id');
const getUser = db.prepare('SELECT * FROM users WHERE id = ?');
const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?');
const speakerExists = db.prepare('SELECT 1 FROM speakers WHERE id = ?');
const getSpeaker = db.prepare('SELECT * FROM speakers WHERE id = ?');
const followedSpeakers = db.prepare(`
  SELECT sp.* FROM speaker_follows sf JOIN speakers sp ON sp.id = sf.speaker_id
  WHERE sf.user_id = ? ORDER BY sp.name`);
const presenting = db.prepare(`${SESSION_SELECT}
  JOIN session_speakers ss ON ss.session_id = s.id
  WHERE ss.speaker_id = ? ORDER BY s.day, s.starts_at`);
const myReservations = db.prepare('SELECT session_id, status FROM reservations WHERE user_id = ?');
const myCheckIns = db.prepare('SELECT session_id FROM check_ins WHERE user_id = ?');
const myRatings = db.prepare('SELECT session_id, stars FROM ratings WHERE user_id = ?');
const follow = db.prepare('INSERT OR IGNORE INTO speaker_follows (user_id, speaker_id) VALUES (?, ?)');
const myInterests = db.prepare('SELECT kind, slug FROM user_interests WHERE user_id = ?');
const trackSlugs = new Set(db.prepare('SELECT slug FROM tracks').pluck().all());
const tagSlugs = new Set(db.prepare('SELECT slug FROM tags').pluck().all());
const clearInterests = db.prepare('DELETE FROM user_interests WHERE user_id = ?');
const addInterest = db.prepare('INSERT OR IGNORE INTO user_interests (user_id, kind, slug) VALUES (?, ?, ?)');
const ROLES = new Set(['vip', 'short-stay', 'speaking']);
const saveInterests = db.transaction((userId, tracks, tags, role) => {
  clearInterests.run(userId);
  if (role) addInterest.run(userId, 'role', role);
  for (const slug of tracks) addInterest.run(userId, 'track', slug);
  for (const slug of tags) addInterest.run(userId, 'tag', slug);
});
const unfollow = db.prepare('DELETE FROM speaker_follows WHERE user_id = ? AND speaker_id = ?');

/** Sessions this user is presenting, if their account is linked to a speaker. */
const speakingSessions = (speakerId) =>
  (speakerId ? presenting.all(speakerId).map((r) => toSession(r)) : []);

usersRouter.get('/', (req, res) => {
  res.json(allUsers.all().map((u) => toUser(u)));
});

usersRouter.get('/:id', (req, res) => {
  const row = getUser.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Attendee not found' });

  res.json(toUser(row, {
    followedSpeakers: followedSpeakers.all(row.id).map((s) => toSpeaker(s)),
    speaker: row.speaker_id ? toSpeaker(getSpeaker.get(row.speaker_id)) : null,
    speakingSessions: speakingSessions(row.speaker_id),
    reservations: myReservations.all(row.id).map((r) => ({ sessionId: r.session_id, status: r.status })),
    checkIns: myCheckIns.all(row.id).map((c) => c.session_id),
    ratings: myRatings.all(row.id).map((r) => ({ sessionId: r.session_id, stars: r.stars })),
  }));
});

/** A subscribable feed of everything this attendee holds a seat for. */
usersRouter.get('/:id/agenda.ics', (req, res) => {
  const ics = agendaCalendar(Number(req.params.id), baseUrlFor(req));
  if (!ics) return res.status(404).json({ error: 'Attendee not found' });
  res.type('text/calendar').set('Content-Disposition', 'attachment; filename="orbit-agenda.ics"').send(ics);
});

/**
 * GET /api/users/:id/today?day=&time=
 *
 * Everything a personal view needs about *this* attendee at *this* moment:
 * what they are in now, what is next, what they are waiting on, and — for the
 * slots they have left empty — a few suggestions drawn from what they have
 * actually been booking rather than what they once declared.
 */
usersRouter.get('/:id/today', (req, res) => {
  if (!userExists.get(req.params.id)) return res.status(404).json({ error: 'Attendee not found' });
  const { day, time } = req.query;
  if (!day) return res.status(400).json({ error: 'day is required' });

  res.json(todayFor(Number(req.params.id), { day, time }));
});

/** The tracks and topics this attendee picked on /for-you. */
usersRouter.get('/:id/interests', (req, res) => {
  if (!userExists.get(req.params.id)) return res.status(404).json({ error: 'Attendee not found' });
  res.json(toInterests(myInterests.all(req.params.id)));
});

/**
 * PUT { tracks: [slug], tags: [slug], role?: 'vip'|'short-stay'|'speaking' } replaces the whole set
 * (an omitted role clears it); an unknown slug or role is a 400.
 */
usersRouter.put('/:id/interests', (req, res) => {
  if (!userExists.get(req.params.id)) return res.status(404).json({ error: 'Attendee not found' });
  const { tracks = [], tags = [], role = null } = req.body ?? {};
  const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (!strings(tracks) || !strings(tags)) {
    return res.status(400).json({ error: 'tracks and tags must be lists of slugs' });
  }
  if (role !== null && !ROLES.has(role)) return res.status(400).json({ error: `Unknown role: ${role}` });
  const unknown = [...tracks.filter((s) => !trackSlugs.has(s)), ...tags.filter((s) => !tagSlugs.has(s))];
  if (unknown.length) return res.status(400).json({ error: `Unknown slug: ${unknown.join(', ')}` });

  saveInterests(Number(req.params.id), tracks, tags, role);
  res.json(toInterests(myInterests.all(req.params.id)));
});

/**
 * GET /api/users/:id/recommendations?day=&time=
 * Up to ten sessions they can still get into, best match first, each with the
 * reasons it was picked. `needsInterests` is true when there is nothing to go on.
 */
usersRouter.get('/:id/recommendations', (req, res) => {
  if (!userExists.get(req.params.id)) return res.status(404).json({ error: 'Attendee not found' });
  const { day, time } = req.query;
  if (!day) return res.status(400).json({ error: 'day is required' });

  res.json(recommendationsFor(Number(req.params.id), { day, time: time ?? '00:00' }));
});

/**
 * GET /api/users/:id/schedule
 * Every session this attendee holds a seat or a waitlist place for, grouped by
 * day, with that day's clashes and totals.
 */
usersRouter.get('/:id/schedule', (req, res) => {
  const user = getUser.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Attendee not found' });

  res.json({ user: toUser(user), days: scheduleFor(user.id) });
});

/**
 * Seats. PUT takes one (or joins the waitlist if the room is full), DELETE
 * gives it back and promotes whoever has waited longest. Both return the whole
 * seat state so the client never has to guess.
 */
usersRouter.put('/:id/reservations/:sessionId', (req, res) => {
  if (!userExists.get(req.params.id)) return res.status(404).json({ error: 'Attendee not found' });
  const state = reserveSeat(Number(req.params.id), Number(req.params.sessionId),
    { day: req.body?.day, time: req.body?.time });
  if (!state) return res.status(404).json({ error: 'Session not found' });
  // 409: overlaps a seat you hold, or the session is already over
  res.status(state.rejected ? 409 : 200).json(state);
});

/**
 * Turning up and saying what you thought. `now` comes from the client, because
 * the conference clock is simulated — see CLAUDE.md.
 */
usersRouter.get('/:id/attendance/:sessionId', (req, res) => {
  const state = attendanceState(Number(req.params.sessionId), Number(req.params.id),
    { day: req.query.day, time: req.query.time });
  if (!state) return res.status(404).json({ error: 'Session not found' });
  res.json(state);
});

usersRouter.put('/:id/checkins/:sessionId', (req, res) => {
  if (!userExists.get(req.params.id)) return res.status(404).json({ error: 'Attendee not found' });
  const state = checkIn(Number(req.params.id), Number(req.params.sessionId),
    { day: req.body?.day, time: req.body?.time });
  if (!state) return res.status(404).json({ error: 'Session not found' });
  res.status(state.rejected ? 409 : 200).json(state);
});

usersRouter.put('/:id/ratings/:sessionId', (req, res) => {
  const stars = Number(req.body?.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'stars must be an integer from 1 to 5' });
  }
  const { comment } = req.body ?? {};
  if (comment !== undefined && comment !== null && (typeof comment !== 'string' || comment.length > 1000)) {
    return res.status(400).json({ error: 'comment must be a string of at most 1000 characters' });
  }
  if (!userExists.get(req.params.id)) return res.status(404).json({ error: 'Attendee not found' });
  const state = rateSession(Number(req.params.id), Number(req.params.sessionId),
    { stars, comment: req.body?.comment }, { day: req.body?.day, time: req.body?.time });
  if (!state) return res.status(404).json({ error: 'Session not found' });
  res.status(state.rejected ? 409 : 200).json(state);
});

usersRouter.delete('/:id/reservations/:sessionId', (req, res) => {
  const state = releaseSeat(Number(req.params.id), Number(req.params.sessionId));
  if (!state) return res.status(404).json({ error: 'Session not found' });
  res.json(state);
});

usersRouter.get('/:id/reservations/:sessionId', (req, res) => {
  const state = seatState(Number(req.params.sessionId), Number(req.params.id));
  if (!state) return res.status(404).json({ error: 'Session not found' });
  res.json(state);
});

usersRouter.put('/:id/follows/:speakerId', (req, res) => {
  if (!userExists.get(req.params.id)) return res.status(404).json({ error: 'Attendee not found' });
  if (!speakerExists.get(req.params.speakerId)) {
    return res.status(404).json({ error: 'Speaker not found' });
  }
  follow.run(req.params.id, req.params.speakerId);
  res.json({ following: true, speakerId: Number(req.params.speakerId) });
});

usersRouter.delete('/:id/follows/:speakerId', (req, res) => {
  unfollow.run(req.params.id, req.params.speakerId);
  res.json({ following: false, speakerId: Number(req.params.speakerId) });
});
