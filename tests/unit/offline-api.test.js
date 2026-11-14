import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// api() is the one door every request goes through, so the offline rule lives
// there: a write made offline fails with a recognisable error, sends nothing,
// and is never queued.
const realFetch = globalThis.fetch;
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
let calls;

const setOnline = (onLine) =>
  Object.defineProperty(globalThis, 'navigator', { value: { onLine }, configurable: true });

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ ok: true }) };
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
});

test('a write while offline throws "You\'re offline" with offline = true and sends no request', async () => {
  setOnline(false);
  const api = await import('../../src/lib/api.js');
  for (const call of [
    () => api.reserveSeat(1, 2, {}),
    () => api.releaseSeat(1, 2),
    () => api.followSpeaker(1, 3),
    () => api.unfollowSpeaker(1, 3),
    () => api.checkIn(1, 2, {}),
    () => api.rateSession(1, 2, { stars: 5 }),
  ]) {
    await assert.rejects(call(), (err) => err.message === "You're offline" && err.offline === true);
  }
  assert.equal(calls.length, 0);
});

test('a write whose fetch throws a TypeError is the same offline error', async () => {
  setOnline(true);
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const api = await import('../../src/lib/api.js');
  await assert.rejects(api.reserveSeat(1, 2, {}), (err) => err.message === "You're offline" && err.offline === true);
});

test('online writes and every read go through untouched, and a failed read is not marked offline', async () => {
  setOnline(true);
  const api = await import('../../src/lib/api.js');
  assert.deepEqual(await api.reserveSeat(1, 2, {}), { ok: true });
  assert.equal(calls.length, 1);

  setOnline(false);
  assert.deepEqual(await api.getSessions({}), { ok: true });
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(api.getSessions({}), (err) => !err.offline);
});
