import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { rateCandidates } from '../../src/lib/clock.js';

const s = (id, day, startsAt, endsAt) => ({ id, day, startsAt, endsAt });
const sessions = [
  s(1, '2026-05-01', '09:00', '10:00'),
  s(2, '2026-05-01', '10:15', '11:15'),
  s(3, '2026-05-01', '10:15', '11:15'),
  s(4, '2026-05-02', '09:00', '10:00'),
  s(5, '2026-05-01', '13:00', '14:00'),
];

describe('Which session to offer a rating for', () => {
  test('only ended, checked-in, unrated sessions; latest first by day, end time, then id', () => {
    const clock = { day: '2026-05-01', time: '12:00' };
    const out = rateCandidates(sessions, [1, 2, 3, 4, 5], [{ sessionId: 3, stars: 5 }], clock);
    assert.deepEqual(out.map((x) => x.id), [2, 1]);
  });
  test('ties on day and end time go to the higher id', () => {
    const clock = { day: '2026-05-01', time: '12:00' };
    assert.deepEqual(rateCandidates(sessions, [2, 3], [], clock).map((x) => x.id), [3, 2]);
  });
  test('a running session is not offered, an earlier day is', () => {
    assert.deepEqual(rateCandidates(sessions, [1, 2], [], { day: '2026-05-01', time: '10:30' }).map((x) => x.id), [1]);
    assert.deepEqual(rateCandidates(sessions, [1, 4], [], { day: '2026-05-02', time: '10:30' }).map((x) => x.id), [4, 1]);
  });
  test('nothing checked in, or the clock before day one, gives nothing', () => {
    assert.deepEqual(rateCandidates(sessions, [], [], { day: '2026-05-02', time: '23:00' }), []);
    assert.deepEqual(rateCandidates(sessions, [1, 2], [], { day: '2026-04-30', time: '08:00' }), []);
  });
});
