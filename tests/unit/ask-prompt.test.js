import './sandbox-db.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// The prompt builders read the programme, so seed the sandbox database before server/ opens it.
execFileSync(process.execPath, ['server/seed.js'], { env: process.env, stdio: 'ignore' });
const { askSystemPrompt, pageContext, programmeOn } = await import('../../server/lib/ask.js');
const { db } = await import('../../server/db.js');

const agenda = [
  { id: 11, title: 'Agents in anger', startsAt: '13:00', endsAt: '13:45', room: { name: 'Hall B' }, reservation: 'confirmed' },
  { id: 12, title: 'Queue theory', startsAt: '15:00', endsAt: '15:45', room: { name: 'Room 4' }, reservation: 'waitlisted' },
];

describe('askSystemPrompt', () => {
  const prompt = askSystemPrompt({ day: '2026-03-02', time: '14:20', agenda, days: ['2026-03-01', '2026-03-02'] });

  test('states the day and the time', () => {
    assert.ok(prompt.includes('2026-03-02'));
    assert.ok(prompt.includes('14:20'));
  });

  test('lists the attendee\'s agenda for the day with ids, times, rooms and status', () => {
    for (const s of agenda) {
      for (const part of [String(s.id), s.title, s.startsAt, s.endsAt, s.room.name, s.reservation]) assert.ok(prompt.includes(part), part);
    }
  });

  test('says so when the agenda is empty', () => {
    assert.match(askSystemPrompt({ day: '2026-03-02', time: '09:00', agenda: [], days: [] }), /nothing booked|no sessions/i);
  });

  test('states the formatting rules', () => {
    assert.match(prompt, /showSessions/);
    assert.match(prompt, /showTravel/);
    assert.match(prompt, /table/i);
    assert.ok(prompt.includes('/sessions/<id>'));
  });
});

describe('the programme in the prompt', () => {
  const day = db.prepare('SELECT MIN(day) AS d FROM sessions').get().d;
  const rows = db.prepare(`SELECT s.id, s.title, s.capacity - s.seats_taken AS left, r.name AS room
    FROM sessions s JOIN rooms r ON r.id = s.room_id WHERE s.day = ?`).all(day);

  test('programmeOn lists every session of the day with id, title, room and seats left', () => {
    const text = programmeOn(day);
    assert.ok(rows.length > 5);
    assert.equal(text.trim().split('\n').length, rows.length);
    for (const r of rows) {
      const line = text.split('\n').find((l) => l.startsWith(`${r.id} |`));
      assert.ok(line, `session ${r.id} missing`);
      for (const part of [r.title, r.room, `${Math.max(0, r.left)} seats left`]) assert.ok(line.includes(part), `${part} in ${line}`);
    }
  });

  test('askSystemPrompt carries the programme and the page', () => {
    const programme = programmeOn(day);
    const prompt = askSystemPrompt({ day, time: '10:00', programme, page: 'They are looking at the session "Zed".' });
    assert.ok(prompt.includes(programme));
    assert.ok(prompt.includes('looking at the session "Zed"'));
  });

  test('pageContext names the session or speaker by id, and is empty elsewhere', () => {
    const s = db.prepare('SELECT id, title FROM sessions LIMIT 1').get();
    const p = db.prepare('SELECT id, name FROM speakers LIMIT 1').get();
    assert.ok(pageContext({ route: `/sessions/${s.id}`, sessionId: s.id }).includes(s.title));
    assert.ok(pageContext({ route: `/speakers/${p.id}`, speakerId: p.id }).includes(p.name));
    assert.match(pageContext({ route: '/food' }), /\/food/);
    assert.equal(pageContext({}), '');
  });
});
