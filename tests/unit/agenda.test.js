import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { agendaDays, orderDays, focusSession, travelNotes } from '../../src/lib/agenda.js';

const s = (id, startsAt, endsAt, shortName = 'Aurora') => ({ id, startsAt, endsAt, venue: { shortName } });

/** Two days from the payload, starts deliberately out of order, plus a day with nothing left. */
const days = [
  { date: '2026-06-02', sessions: [s(4, '10:00', '11:00')], conflicts: [], totalMinutes: 60, waitlistedMinutes: 0, venuesVisited: ['Aurora'] },
  {
    date: '2026-06-01',
    sessions: [s(2, '13:00', '14:30', 'Foundry'), s(1, '09:00', '10:00'), s(3, '09:30', '10:30')],
    conflicts: [], totalMinutes: 0, waitlistedMinutes: 0, venuesVisited: [],
  },
  { date: '2026-06-03', sessions: [s(5, '09:00', '10:00')], conflicts: [], totalMinutes: 60, waitlistedMinutes: 0, venuesVisited: [] },
];
const store = new Map([[1, 'confirmed'], [2, 'confirmed'], [3, 'waitlisted'], [4, 'confirmed']]);
const reservationFor = (id) => store.get(id) ?? null;

describe('agendaDays', () => {
  test('sorts each day by start, splits confirmed hours from waitlisted time, and drops days with nothing', () => {
    const out = agendaDays(days, reservationFor);
    assert.deepEqual(out.map((d) => d.date), ['2026-06-02', '2026-06-01']);
    const d1 = out[1];
    assert.deepEqual(d1.sessions.map((x) => x.id), [1, 3, 2]);
    assert.deepEqual(d1.sessions.map((x) => x.reservation), ['confirmed', 'waitlisted', 'confirmed']);
    assert.equal(d1.totalMinutes, 60 + 90);
    assert.equal(d1.waitlistedMinutes, 60);
    assert.deepEqual(d1.venuesVisited, ['Aurora', 'Foundry']);
  });

  test('flags an overlap between a seat and a waitlist place, and nothing for back-to-back sessions', () => {
    const [, d1] = agendaDays(days, reservationFor);
    assert.deepEqual(d1.conflicts, [{ type: 'overlap', sessionIds: [1, 3] }]);
    const back = agendaDays([{ date: 'x', sessions: [s(1, '09:00', '10:00'), s(2, '10:00', '11:00')] }], () => 'confirmed');
    assert.deepEqual(back[0].conflicts, []);
  });

  test('a session the store no longer holds drops out and the totals and clash follow', () => {
    const after = new Map(store); after.delete(3);
    const [, d1] = agendaDays(days, (id) => after.get(id) ?? null);
    assert.deepEqual(d1.sessions.map((x) => x.id), [1, 2]);
    assert.deepEqual(d1.conflicts, []);
    assert.equal(d1.waitlistedMinutes, 0);
    const none = agendaDays(days, () => null);
    assert.deepEqual(none, []);
  });

  test('no days gives no days', () => {
    assert.deepEqual(agendaDays([], reservationFor), []);
  });
});

describe('orderDays', () => {
  const ds = [{ date: '2026-06-03' }, { date: '2026-06-01' }, { date: '2026-06-02' }];
  test('today first, the rest by date', () => {
    assert.deepEqual(orderDays(ds, '2026-06-02').map((d) => d.date), ['2026-06-02', '2026-06-01', '2026-06-03']);
  });
  test('when today has no reservations the days run by date', () => {
    assert.deepEqual(orderDays(ds, '2026-06-09').map((d) => d.date), ['2026-06-01', '2026-06-02', '2026-06-03']);
  });
});

describe('focusSession', () => {
  const day = { sessions: [s(1, '09:00', '10:00'), s(3, '09:30', '10:30'), s(2, '13:00', '14:00')] };
  const rsv = { ...day, sessions: day.sessions.map((x) => ({ ...x, reservation: x.id === 3 ? 'waitlisted' : 'confirmed' })) };
  test('the confirmed session in progress', () => {
    assert.equal(focusSession(rsv, '09:45').id, 1);
  });
  test('between sessions, the next confirmed one; a waitlist place never counts', () => {
    assert.equal(focusSession(rsv, '10:30').id, 2);
    assert.equal(focusSession(rsv, '07:00').id, 1);
  });
  test('after the last one there is none; a session ending now is over', () => {
    assert.equal(focusSession(rsv, '14:00'), null);
    assert.equal(focusSession(rsv, '10:00').id, 2);
  });
});

describe('travelNotes', () => {
  const A = 1, F = 2;
  const travel = [
    { fromVenueId: A, toVenueId: F, mode: 'Shuttle', minutes: 27, costUsd: 0 },
    { fromVenueId: A, toVenueId: F, mode: 'Rideshare', minutes: 18, costUsd: 23 },
    { fromVenueId: A, toVenueId: F, mode: 'Walk', minutes: 118, costUsd: 0 },
    { fromVenueId: F, toVenueId: A, mode: 'Taxi', minutes: 20, costUsd: 30 },
  ];
  const t = (id, startsAt, endsAt, venueId, walkMinutes = 10, reservation = 'confirmed') =>
    ({ id, startsAt, endsAt, reservation, venue: { id: venueId }, room: { walkMinutes } });

  test('names the fastest mode with journey plus walk to the room, and the return leg uses its own row', () => {
    const out = travelNotes([t(1, '09:00', '09:45', A), t(2, '10:15', '11:00', F, 10), t(3, '12:00', '13:00', A, 5)], travel);
    assert.deepEqual([...out.keys()], [2, 3]);
    assert.equal(out.get(2).fastest.mode, 'Rideshare');
    assert.equal(out.get(2).fastest.total, 28);
    assert.equal(out.get(2).gapMinutes, 30);
    assert.equal(out.get(3).fastest.mode, 'Taxi');
    assert.equal(out.get(3).fastest.total, 25);
  });

  test('warns only when the gap is shorter than the total', () => {
    const warn = (gapEnd) => travelNotes([t(1, '09:00', '10:00', A), t(2, gapEnd, '12:00', F, 10)], travel).get(2).warn;
    assert.equal(warn('10:15'), true);   // 15 < 28
    assert.equal(warn('10:28'), false);  // 28
    assert.equal(warn('10:30'), false);  // 30
  });

  test('same-venue neighbours give nothing', () => {
    assert.equal(travelNotes([t(1, '09:00', '10:00', A), t(2, '10:15', '11:00', A)], travel).size, 0);
  });

  test('waitlisted places are skipped, a clash gets no note, and a pair with no route gives nothing', () => {
    assert.equal(travelNotes([t(1, '09:00', '10:00', A), t(2, '10:15', '11:00', F, 10, 'waitlisted'), t(3, '11:30', '12:00', A)], travel).size, 0);
    assert.equal(travelNotes([t(1, '09:00', '10:00', A), t(2, '09:30', '11:00', F)], travel).size, 0);
    assert.equal(travelNotes([t(1, '09:00', '10:00', A), t(2, '11:00', '12:00', 9)], travel).size, 0);
  });
});
