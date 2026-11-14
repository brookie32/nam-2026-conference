import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, clearAgenda, overlaps } from './harness.js';

let api;
let close;
let day;
let hole;
const USER = 1;

before(async () => {
  const started = await startApi();
  api = started.api;
  close = started.close;
  const boot = await api.json('/bootstrap');
  day = boot.days[1].date;
  const sessions = await api.json('/sessions');
  const ordinary = sessions
    .filter((s) => s.day === day && !s.isKeynote && s.format !== 'Social')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
  const open = ordinary.filter((s) => s.seatsTaken < s.capacity);
  const before = open[0];
  const after = open.find((s) => s.startsAt >= shift(before.endsAt, 90));
  assert.ok(after, 'the seed leaves a talk 90+ minutes after the first on day 2');
  hole = { before, after, sessions };

  await clearAgenda(api, USER);
  await api.put(`/users/${USER}/interests`, { tracks: boot.tracks.map((t) => t.slug), tags: [] });
});
after(async () => { await close(); });

const shift = (hhmm, mins) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + mins;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const gaps = (time = '00:00', id = USER) => api.json(`/users/${id}/gaps?day=${day}&time=${time}`);
const mine = (g) => g.gaps.find((x) => x.day === day && x.previousId === hole.before.id);

describe('GET /users/:id/gaps', () => {
  test('lists the hole between two seats, with at most 3 suggestions that fit inside it', async () => {
    assert.equal((await api.put(`/users/${USER}/reservations/${hole.before.id}`)).status, 200);
    assert.equal((await api.put(`/users/${USER}/reservations/${hole.after.id}`)).status, 200);

    const gap = mine(await gaps());
    assert.ok(gap, 'the hole is listed');
    assert.equal(gap.startsAt, hole.before.endsAt);
    assert.equal(gap.endsAt, hole.after.startsAt);
    assert.equal(gap.nextId, hole.after.id);
    assert.ok(gap.suggestions.length >= 1 && gap.suggestions.length <= 3, `${gap.suggestions.length} suggestions`);
    for (const { session: s, reasons } of gap.suggestions) {
      assert.ok(s.startsAt >= gap.startsAt && s.endsAt <= gap.endsAt, `${s.id} fits`);
      assert.ok(s.seatsTaken < s.capacity);
      assert.ok(reasons.length > 0);
    }
  });

  test('a waitlist place in the hole leaves it listed; the hole is hidden once it is over', async () => {
    const gap = mine(await gaps());
    const full = hole.sessions.find((s) => s.day === day && s.seatsTaken >= s.capacity
      && s.startsAt >= gap.startsAt && s.endsAt <= gap.endsAt);
    assert.ok(full, 'the seed has a sold-out talk inside the hole');
    const res = await api.put(`/users/${USER}/reservations/${full.id}`);
    assert.equal(res.body.status ?? res.body.reservation?.status, 'waitlisted');
    assert.ok(mine(await gaps()), 'still listed');
    await api.del(`/users/${USER}/reservations/${full.id}`);
    assert.equal(mine(await gaps(gap.endsAt)), undefined, 'over at its end time');
    assert.ok(mine(await gaps(shift(gap.endsAt, -1))), 'still on a minute before');
  });

  test('taking a suggested seat removes or shrinks the gap', async () => {
    const gap = mine(await gaps());
    const [{ session: taken }] = gap.suggestions;
    assert.equal((await api.put(`/users/${USER}/reservations/${taken.id}`)).status, 200);
    const left = (await gaps()).gaps.filter((g) => g.day === day && g.startsAt === gap.startsAt && g.endsAt === gap.endsAt);
    assert.deepEqual(left, []);
    assert.ok(!overlaps(taken, hole.before) && !overlaps(taken, hole.after));
  });

  test('404 for an unknown attendee, 400 without a day', async () => {
    assert.equal((await api.get(`/users/999999/gaps?day=${day}`)).status, 404);
    assert.equal((await api.get(`/users/${USER}/gaps`)).status, 400);
  });
});
