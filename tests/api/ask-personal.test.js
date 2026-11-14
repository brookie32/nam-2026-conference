import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './harness.js';

/**
 * Ask ORBIT's personal tools: `myAgenda` (every day, status, check-ins, stars, ratings lowest first)
 * and `recommendForMe` (the For you ranking). Read straight from a freshly seeded database.
 */

let close;
let lib;
let days;

before(async () => {
  delete process.env.AI_GATEWAY_API_KEY;
  let origin;
  ({ origin, close } = await startApi());
  lib = await import('../../server/lib/ask.js');
  days = (await (await fetch(`${origin}/api/bootstrap`)).json()).days.map((d) => d.date);
});
after(() => close());

describe('myAgenda', () => {
  test('lists every booked day with status, check-in and stars, and ratings lowest first', () => {
    const { days: agendaDays, ratings } = lib.myAgenda(1);
    assert.ok(agendaDays.length > 1, 'more than one day');
    for (const d of agendaDays) {
      for (const s of d.sessions) {
        assert.ok(['confirmed', 'waitlisted'].includes(s.status));
        assert.equal(typeof s.checkedIn, 'boolean');
        assert.ok(s.myStars === null || (s.myStars >= 1 && s.myStars <= 5));
        assert.ok(Number.isInteger(s.id) && s.title);
      }
    }
    assert.ok(ratings.length > 0, 'the seed rates some Day 1 sessions');
    for (let i = 1; i < ratings.length; i++) assert.ok(ratings[i - 1].stars <= ratings[i].stars, 'lowest first');
    for (const r of ratings) assert.ok(Number.isInteger(r.id) && r.title && r.stars >= 1 && r.stars <= 5);
  });

  test('an unknown or missing attendee gets an empty agenda, not an error', () => {
    assert.deepEqual(lib.myAgenda(NaN), { days: [], ratings: [] });
    assert.deepEqual(lib.myAgenda(0), { days: [], ratings: [] });
  });
});

describe('recommendForMe', () => {
  test('returns ranked picks with reasons for the attendee at the given moment', () => {
    const { recommendations } = lib.recommendForMe(1, { day: days[0], time: '10:00' });
    assert.ok(recommendations.length > 0 && recommendations.length <= 10);
    for (const r of recommendations) {
      assert.ok(Number.isInteger(r.id) && r.title);
      assert.ok(Array.isArray(r.reasons) && r.reasons.length > 0);
      assert.equal(r.isFull, false);
    }
  });

  test('needs an attendee and a moment', () => {
    assert.deepEqual(lib.recommendForMe(NaN, { day: days[0], time: '10:00' }), { recommendations: [] });
    assert.deepEqual(lib.recommendForMe(1, {}), { recommendations: [] });
  });
});

describe('askToolsFor', () => {
  test('adds myAgenda and recommendForMe to the shared tools', () => {
    const tools = lib.askToolsFor({ userId: 1, day: days[0], time: '10:00' });
    for (const name of ['searchSessions', 'findSpeakers', 'venuesAndTravel', 'showSessions', 'showTravel', 'myAgenda', 'recommendForMe']) {
      assert.ok(tools[name], name);
    }
  });
});
