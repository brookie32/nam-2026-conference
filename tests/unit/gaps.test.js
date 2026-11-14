import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findGaps, suggestForGap } from '../../server/lib/gaps.js';

const DAY = '2026-05-04';
const session = (id, startsAt, endsAt, over = {}) => ({
  id, title: `Talk ${id}`, day: DAY, startsAt, endsAt, capacity: 50, seatsTaken: 10,
  isKeynote: false, format: 'Talk', status: 'confirmed',
  venue: { id: 1 }, room: { walkMinutes: 0 }, ...over,
});
const EARLY = { day: DAY, time: '08:00' };
const ranked = (...ss) => ss.map((session) => ({ session, reasons: ['x'] }));

describe('findGaps', () => {
  test('only confirmed seats bound a gap; a waitlist place does not fill one; short gaps are skipped', () => {
    const gaps = findGaps([
      session(1, '09:00', '10:00'),
      session(2, '11:00', '12:00', { status: 'waitlisted' }),
      session(3, '13:00', '14:00'),
      session(4, '14:30', '15:00'),
    ], EARLY);
    assert.equal(gaps.length, 1);
    assert.deepEqual(
      [gaps[0].day, gaps[0].startsAt, gaps[0].endsAt, gaps[0].minutes, gaps[0].before.id, gaps[0].after.id],
      [DAY, '10:00', '13:00', 180, 1, 3]);
  });

  test('a gap of exactly 45 minutes counts; 44 does not', () => {
    assert.equal(findGaps([session(1, '09:00', '10:00'), session(2, '10:45', '11:30')], EARLY).length, 1);
    assert.equal(findGaps([session(1, '09:00', '10:00'), session(2, '10:44', '11:30')], EARLY).length, 0);
  });

  test('an overlapping or long session does not open a false gap', () => {
    const gaps = findGaps([session(1, '09:00', '12:00'), session(2, '10:00', '10:30'), session(3, '13:00', '14:00')], EARLY);
    assert.deepEqual(gaps.map((g) => [g.startsAt, g.endsAt, g.before.id]), [['12:00', '13:00', 1]]);
  });

  test('nothing before the first or after the last session, and no sessions means no gaps', () => {
    assert.deepEqual(findGaps([session(1, '12:00', '13:00')], EARLY), []);
    assert.deepEqual(findGaps([], EARLY), []);
  });

  test('past gaps are hidden: over today, an earlier day; later days keep theirs', () => {
    const sessions = [
      session(1, '09:00', '10:00'), session(2, '11:00', '12:00'),
      session(3, '09:00', '10:00', { day: '2026-05-05' }), session(4, '11:00', '12:00', { day: '2026-05-05' }),
    ];
    assert.equal(findGaps(sessions, EARLY).length, 2);
    // gap 10:00-11:00 is over at 11:00 (its end), still on at 10:59
    assert.deepEqual(findGaps(sessions, { day: DAY, time: '10:59' }).map((g) => g.day), [DAY, '2026-05-05']);
    assert.deepEqual(findGaps(sessions, { day: DAY, time: '11:00' }).map((g) => g.day), ['2026-05-05']);
    assert.deepEqual(findGaps(sessions, { day: '2026-05-05', time: '08:00' }).map((g) => g.day), ['2026-05-05']);
    assert.deepEqual(findGaps(sessions, { day: '2026-05-06', time: '08:00' }), []);
  });
});

describe('suggestForGap', () => {
  const before = session(1, '09:00', '10:00');
  const gap = { day: DAY, startsAt: '10:00', endsAt: '12:00', minutes: 120, before, after: session(9, '12:00', '13:00') };
  const run = (items, over = {}) =>
    suggestForGap({ gap, ranked: items, travel: [], now: EARLY, ...over }).map((i) => i.session.id);

  test('keeps only talks that start and end inside the gap, and are not full', () => {
    const items = ranked(
      session(2, '09:30', '10:30'), session(3, '11:30', '12:30'), session(4, '10:00', '11:00'),
      session(5, '11:00', '12:00'), session(6, '10:15', '11:00', { capacity: 10, seatsTaken: 10 }));
    assert.deepEqual(run(items), [4, 5]);
  });

  test('at most 3, in ranking order', () => {
    const items = ranked(...[11, 12, 13, 14, 15].map((id) => session(id, '10:30', '11:00')));
    assert.deepEqual(run(items), [11, 12, 13]);
  });

  test('on today, a talk that has already started is not offered', () => {
    const items = ranked(session(2, '10:00', '11:00'), session(3, '10:30', '11:30'));
    assert.deepEqual(run(items, { now: { day: DAY, time: '10:15' } }), [3]);
  });

  test('a talk too soon to reach from the other venue is dropped; a later one is kept', () => {
    const far = (id, s, e) => session(id, s, e, { venue: { id: 2 }, room: { walkMinutes: 5 } });
    const travel = [{ fromVenueId: 1, toVenueId: 2, mode: 'Shuttle', minutes: 30, costUsd: 0 }];
    // needs 35 min after 10:00 ends: 10:30 is too soon, 10:40 fits
    assert.deepEqual(run(ranked(far(2, '10:30', '11:00'), far(3, '10:40', '11:10')), { travel }), [3]);
  });

  test('a pair with no route data counts as reachable', () => {
    const odd = session(2, '10:00', '10:30', { venue: { id: 7 } });
    assert.deepEqual(run(ranked(odd)), [2]);
  });

  test('same-venue talks come first, ranking order kept inside each group', () => {
    const elsewhere = (id) => session(id, '10:30', '11:00', { venue: { id: 2 } });
    const items = ranked(elsewhere(2), elsewhere(3), session(4, '10:30', '11:00'), session(5, '11:00', '11:30', { venue: { id: 1 } }));
    assert.deepEqual(run(items), [4, 5, 2]);
  });

  test('a talk at the venue of the session after the gap counts as same-venue', () => {
    const g = { ...gap, after: session(9, '12:00', '13:00', { venue: { id: 2 } }) };
    const items = ranked(session(2, '10:30', '11:00', { venue: { id: 5 } }), session(3, '10:30', '11:00', { venue: { id: 2 } }));
    assert.deepEqual(run(items, { gap: g }), [3, 2]);
  });
});
