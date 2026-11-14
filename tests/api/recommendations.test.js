import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, clearAgenda, overlaps } from './harness.js';

let api;
let close;
let days;
let sessions;
let boot;

before(async () => {
  const started = await startApi();
  api = started.api;
  close = started.close;
  boot = await api.json('/bootstrap');
  days = boot.days.map((d) => d.date);
  sessions = await api.json('/sessions');
});
after(async () => { await close(); });

const trackSlugs = () => boot.tracks.map((t) => t.slug);
const topicSlugs = () => boot.tags.filter((t) => t.kind === 'topic').map((t) => t.slug);
const recs = (id, day, time) => api.json(`/users/${id}/recommendations?day=${day}&time=${time}`);
const pick = (id, body) => api.put(`/users/${id}/interests`, body);
const ordinary = (s) => !s.isKeynote && s.format !== 'Social';

describe('interests', () => {
  test('saved per attendee, replaced as a set, returned as slugs', async () => {
    const [t1, t2] = trackSlugs();
    const [g1, g2] = topicSlugs();
    assert.deepEqual(await api.json('/users/1/interests'), { tracks: [], tags: [], role: null });

    const put = await pick(1, { tracks: [t1, t2], tags: [g1] });
    assert.equal(put.status, 200);
    assert.deepEqual(put.body, { tracks: [t1, t2].sort(), tags: [g1], role: null });
    assert.deepEqual(await api.json('/users/1/interests'), put.body);
    assert.deepEqual(await api.json('/users/2/interests'), { tracks: [], tags: [] }, 'another attendee is unaffected');

    const replaced = await pick(1, { tracks: [t2], tags: [g2], role: null });
    assert.deepEqual(replaced.body, { tracks: [t2], tags: [g2], role: null });
    assert.deepEqual((await pick(1, { tracks: [], tags: [], role: null })).body, { tracks: [], tags: [], role: null });
  });

  test('an unknown slug is a 400 and changes nothing', async () => {
    const [t1] = trackSlugs();
    await pick(3, { tracks: [t1], tags: [] });
    for (const body of [{ tracks: ['nope'], tags: [] }, { tracks: [], tags: ['nope'] }, { tracks: 'agents', tags: [] }]) {
      const res = await pick(3, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.body.error);
    }
    assert.deepEqual(await api.json('/users/3/interests'), { tracks: [t1], tags: [], role: null });
  });

  test('a role is stored as its own kind, never counts as a pick, and an unknown one is a 400', async () => {
    const [t1] = trackSlugs();
    const [g1, g2] = topicSlugs();
    const put = await pick(2, { tracks: [t1], tags: [g1, g2], role: 'short-stay' });
    assert.equal(put.status, 200);
    assert.deepEqual(put.body, { tracks: [t1], tags: [g1, g2].sort(), role: 'short-stay' });
    assert.deepEqual(await api.json('/users/2/interests'), put.body);

    // A role alone is not a pick: nothing to recommend from.
    await pick(4, { tracks: [], tags: [], role: 'vip' });
    assert.deepEqual(await api.json('/users/4/interests'), { tracks: [], tags: [], role: 'vip' });
    assert.deepEqual(await recs(4, days[0], '08:00'), { items: [], needsInterests: true });

    for (const role of ['nope', 7, '']) {
      const res = await pick(2, { tracks: [], tags: [], role });
      assert.equal(res.status, 400, JSON.stringify(role));
    }
    assert.equal((await api.json('/users/2/interests')).role, 'short-stay', 'a rejected PUT changes nothing');
    const cleared = await pick(2, { tracks: [t1], tags: [] });
    assert.equal(cleared.body.role, null, 'omitting the role clears it');
    for (const role of ['vip', 'short-stay', 'speaking']) {
      assert.equal((await pick(2, { tracks: [], tags: [], role })).status, 200, role);
    }
    await pick(2, { tracks: [], tags: [] });
    await pick(4, { tracks: [], tags: [] });
  });

  test('an unknown attendee is a 404', async () => {
    assert.equal((await api.get('/users/999999/interests')).status, 404);
    assert.equal((await pick(999999, { tracks: [], tags: [], role: null })).status, 404);
    assert.equal((await api.get(`/users/999999/recommendations?day=${days[0]}&time=09:00`)).status, 404);
  });
});

describe('recommendations', () => {
  test('a day is required', async () => {
    assert.equal((await api.get('/users/1/recommendations')).status, 400);
  });

  test('with no interests and no agenda, the page is asked to collect interests', async () => {
    await clearAgenda(api, 4);
    await pick(4, { tracks: [], tags: [], role: null });
    assert.deepEqual(await recs(4, days[0], '08:00'), { items: [], needsInterests: true });
  });

  test('every item is upcoming, open, unbooked and clash-free, matches an interest, and has a reason', async () => {
    const id = 5;
    const wanted = trackSlugs();
    await pick(id, { tracks: wanted, tags: [] });
    const now = { day: days[1], time: '12:00' };
    const mine = await api.json(`/users/${id}`);
    const byId = new Map(sessions.map((s) => [s.id, s]));
    const confirmed = mine.reservations.filter((r) => r.status === 'confirmed').map((r) => byId.get(r.sessionId));

    const r = await recs(id, now.day, now.time);
    assert.equal(r.needsInterests, false);
    assert.ok(r.items.length > 0 && r.items.length <= 10);
    for (const { session: s, reasons } of r.items) {
      assert.ok(s.day > now.day || (s.day === now.day && s.endsAt > now.time), `${s.id} has ended`);
      assert.ok(s.seatsTaken < s.capacity, `${s.id} is full`);
      assert.ok(!mine.reservations.some((x) => x.sessionId === s.id), `${s.id} is booked`);
      assert.ok(!confirmed.some((c) => overlaps(c, s)), `${s.id} clashes with a confirmed seat`);
      assert.ok(ordinary(s), `${s.id} is a keynote or social`);
      assert.ok(reasons.length > 0);
    }
  });

  test('ended, full, booked and clashing sessions are each absent while a control is present', async () => {
    const id = 6;
    await clearAgenda(api, id);
    const now = { day: days[1], time: '12:00' };
    const upcoming = (s) => s.day > now.day || (s.day === now.day && s.endsAt > now.time);
    const open = sessions.filter((s) => ordinary(s) && s.seatsTaken < s.capacity && upcoming(s));

    const ended = sessions.find((s) => ordinary(s) && s.seatsTaken < s.capacity && s.day === now.day && s.endsAt <= now.time);
    const full = sessions.find((s) => ordinary(s) && s.seatsTaken >= s.capacity && upcoming(s));
    const booked = open[0];
    const clash = open.find((s) => s.id !== booked.id && overlaps(booked, s));
    const control = open.find((s) => s.id !== booked.id && !overlaps(booked, s));
    for (const [name, s] of Object.entries({ ended, full, clash, control })) assert.ok(s, `the seed has a ${name} session`);

    // book while the clock says nothing is over, then ask at the pinned moment
    const seat = await api.put(`/users/${id}/reservations/${booked.id}`, { day: days[0], time: '07:00' });
    assert.equal(seat.body.status, 'confirmed');
    const interested = [ended, full, booked, clash, control].map((s) => s.track.slug);
    await pick(id, { tracks: [...new Set(interested)], tags: [] });

    const listed = new Set((await recs(id, now.day, now.time)).items.map((i) => i.session.id));
    assert.ok(listed.has(control.id), 'the eligible control is listed');
    assert.ok(!listed.has(ended.id), 'ended is absent');
    assert.ok(!listed.has(full.id), 'full is absent');
    assert.ok(!listed.has(booked.id), 'booked is absent');
    assert.ok(!listed.has(clash.id), 'clashing is absent');
  });

  test('taking a seat from the list removes it from the list', async () => {
    const id = 2;
    await clearAgenda(api, id);
    await pick(id, { tracks: trackSlugs(), tags: [] });
    const first = (await recs(id, days[0], '07:00')).items[0].session;
    await api.put(`/users/${id}/reservations/${first.id}`, { day: days[0], time: '07:00' });
    const after = (await recs(id, days[0], '07:00')).items.map((i) => i.session.id);
    assert.ok(!after.includes(first.id));
  });

  test('a followed speaker is a reason, and ranks a session above those matching on track alone', async () => {
    const id = 3;
    await clearAgenda(api, id);
    const target = sessions.find((s) => ordinary(s) && s.seatsTaken < s.capacity && s.day > days[0] && s.speakers.length);
    const speaker = target.speakers[0];
    await pick(id, { tracks: [target.track.slug], tags: [] });
    await api.put(`/users/${id}/follows/${speaker.id}`, {});

    const r = await recs(id, days[0], '07:00');
    const reason = `you follow ${speaker.name}`;
    assert.ok(r.items[0].reasons.includes(reason), 'the first item is by a followed speaker');
    assert.ok(r.items.every((i) => i.reasons.length > 0));
    const firstTrackOnly = r.items.findIndex((i) => !i.reasons.includes(reason));
    assert.ok(r.items.slice(0, firstTrackOnly < 0 ? undefined : firstTrackOnly).every((i) => i.reasons.includes(reason)));
  });
});
