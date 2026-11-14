import { gateway, tool } from 'ai';
import { z } from 'zod';
import { db } from '../db.js';
import { SESSION_SELECT, hydrateSessions, toSpeaker, toTravel, toVenue } from './query.js';

/**
 * Ask ORBIT — the model and the tools it may call.
 *
 * The model never sees the database, only what these tools return, and every
 * session they return carries its id so the answer can link `/sessions/:id`.
 */

let injected = null;
/** The test seam: `setAskModel(stub)` replaces the gateway; `setAskModel(null)` undoes it. */
export const setAskModel = (model) => { injected = model; };

/** The injected model, else the gateway model when a key is set, else null. Read per request. */
export function askModel() {
  if (injected) return injected;
  if (!process.env.AI_GATEWAY_API_KEY) return null;
  return gateway(process.env.ASK_ORBIT_MODEL || 'anthropic/claude-sonnet-5.5');
}

const conferenceDays = () => db.prepare('SELECT DISTINCT day FROM sessions ORDER BY day').all().map((r) => r.day);

export const askSystemPrompt = () => `You are ORBIT, the assistant for the ORBIT '26 conference programme.
Answer only from the results of your tools; if they do not have it, say so. Never invent a session, speaker, room or time.
Whenever you name a session, link it as [title](/sessions/<id>) using the id the tool returned. Do not link anything else.
Keep answers short. You cannot book seats. Conference days: ${conferenceDays().map((d, i) => `Day ${i + 1} = ${d}`).join(', ')}.
Times are 24-hour HH:MM; "afternoon" means from 12:00.`;

const sessionBrief = (s) => ({
  id: s.id, title: s.title, day: s.day, startsAt: s.startsAt, endsAt: s.endsAt,
  track: s.track.name, trackSlug: s.track.slug, level: s.level, format: s.format,
  room: s.room.name, venue: s.venue.name, venueId: s.venue.id,
  seatsLeft: s.seatsLeft, isFull: s.isFull,
  speakers: s.speakers.map((p) => p.name),
});

/** A day given as a date, or as 1-4. */
const resolveDay = (day) => (/^\d$/.test(String(day)) ? conferenceDays()[Number(day) - 1] ?? day : day);

export function searchSessions({ day, trackSlug, venueId, from, to, q, notFull } = {}) {
  const where = [];
  const args = [];
  if (day) { where.push('s.day = ?'); args.push(resolveDay(day)); }
  if (trackSlug) { where.push('t.slug = ?'); args.push(trackSlug); }
  if (venueId) { where.push('v.id = ?'); args.push(venueId); }
  if (from) { where.push('s.starts_at >= ?'); args.push(from); }
  if (to) { where.push('s.starts_at < ?'); args.push(to); }
  if (q) {
    where.push('(s.title LIKE ? OR s.abstract LIKE ? OR s.subtitle LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (notFull) where.push('s.seats_taken < s.capacity');
  const sql = `${SESSION_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.day, s.starts_at, r.name LIMIT 40`;
  return { sessions: hydrateSessions(db.prepare(sql).all(...args)).map(sessionBrief) };
}

export function findSpeakers({ q } = {}) {
  const rows = db.prepare(`SELECT * FROM speakers WHERE name LIKE ? OR company LIKE ? OR job_title LIKE ? ORDER BY name LIMIT 15`)
    .all(`%${q ?? ''}%`, `%${q ?? ''}%`, `%${q ?? ''}%`);
  const sessionsOf = db.prepare(`${SESSION_SELECT}
    WHERE EXISTS (SELECT 1 FROM session_speakers ss WHERE ss.session_id = s.id AND ss.speaker_id = ?)
    ORDER BY s.day, s.starts_at`);
  return {
    speakers: rows.map((r) => {
      const s = toSpeaker(r);
      const sessions = hydrateSessions(sessionsOf.all(r.id)).map(sessionBrief);
      return { id: s.id, name: s.name, jobTitle: s.jobTitle, company: s.company, sessions };
    }),
  };
}

export function venuesAndTravel() {
  return {
    venues: db.prepare('SELECT * FROM venues ORDER BY is_primary DESC').all().map(toVenue)
      .map((v) => ({ id: v.id, name: v.name, shortName: v.shortName, address: v.address, city: v.city })),
    travel: db.prepare('SELECT * FROM venue_travel').all().map(toTravel),
  };
}

export const askTools = {
  searchSessions: tool({
    description: 'Search the programme. Returns sessions with id, title, day, time, room and venue.',
    inputSchema: z.object({
      day: z.string().optional().describe('A date (YYYY-MM-DD) or 1-4 for Day 1-4'),
      trackSlug: z.string().optional(),
      venueId: z.number().optional(),
      from: z.string().optional().describe('Earliest start, HH:MM'),
      to: z.string().optional().describe('Start before this, HH:MM'),
      q: z.string().optional().describe('Words in the title or abstract'),
      notFull: z.boolean().optional().describe('Only sessions with seats left'),
    }),
    execute: async (input) => searchSessions(input),
  }),
  findSpeakers: tool({
    description: 'Find speakers by name, company or job title, with their sessions.',
    inputSchema: z.object({ q: z.string() }),
    execute: async (input) => findSpeakers(input),
  }),
  venuesAndTravel: tool({
    description: 'The venues and the travel options between them.',
    inputSchema: z.object({}),
    execute: async () => venuesAndTravel(),
  }),
};
