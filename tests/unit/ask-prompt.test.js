import './sandbox-db.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { askSystemPrompt } from '../../server/lib/ask.js';

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
