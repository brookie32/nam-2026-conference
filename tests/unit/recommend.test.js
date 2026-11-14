import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rankRecommendations } from '../../server/lib/recommend.js';

/** A hand-built session, open and upcoming unless the test says otherwise. */
const session = (id, over = {}) => ({
  id, title: `Talk ${id}`, day: '2026-05-04', startsAt: '14:00', endsAt: '14:45',
  capacity: 50, seatsTaken: 10, isKeynote: false, format: 'Talk', avgRating: 0,
  track: { slug: 'cloud', name: 'Cloud' }, tags: [], speakers: [],
  ...over,
});
const agents = { slug: 'agents', name: 'Agents' };
const cloud = { slug: 'cloud', name: 'Cloud' };
const topic = (slug, name) => ({ slug, name, kind: 'topic' });
const NOW = { day: '2026-05-04', time: '09:00' };
const NONE = { tracks: [], tags: [] };

const rank = (sessions, over = {}) => rankRecommendations({
  sessions, interests: { tracks: ['agents'], tags: [] }, followedSpeakerIds: [],
  agendaTagSlugs: [], booked: [], rated: [], now: NOW, ...over,
});
const ids = (r) => r.items.map((i) => i.session.id);

describe('which sessions can be recommended', () => {
  const control = session(1, { track: agents });

  test('an eligible match is listed, with its reason', () => {
    const r = rank([control]);
    assert.deepEqual(ids(r), [1]);
    assert.deepEqual(r.items[0].reasons, ['Agents track']);
    assert.equal(r.needsInterests, false);
  });

  test('a session that has ended is left out, today and on an earlier day', () => {
    const r = rank([control,
      session(2, { track: agents, startsAt: '08:00', endsAt: '08:45' }),
      session(3, { track: agents, startsAt: '08:15', endsAt: '09:00' }),
      session(4, { track: agents, day: '2026-05-03' })]);
    assert.deepEqual(ids(r), [1]);
  });

  test('one that is still running is kept, and a later day is kept', () => {
    const r = rank([session(2, { track: agents, startsAt: '08:30', endsAt: '09:15' }),
      session(3, { track: agents, day: '2026-05-05' })]);
    assert.deepEqual(ids(r).sort(), [2, 3]);
  });

  test('a full session is left out; one seat left is kept', () => {
    const r = rank([control, session(2, { track: agents, seatsTaken: 50 }),
      session(3, { track: agents, seatsTaken: 49 })]);
    assert.deepEqual(ids(r).sort(), [1, 3]);
  });

  test('a session already booked is left out, seat or waitlist place', () => {
    const r = rank([control, session(2, { track: agents, startsAt: '16:00', endsAt: '16:45' }),
      session(3, { track: agents, startsAt: '17:00', endsAt: '17:45' })], {
      booked: [{ id: 2, day: '2026-05-04', startsAt: '16:00', endsAt: '16:45', status: 'confirmed' },
        { id: 3, day: '2026-05-04', startsAt: '17:00', endsAt: '17:45', status: 'waitlisted' }],
    });
    assert.deepEqual(ids(r), [1]);
  });

  test('a clash with a confirmed seat is left out; a waitlist place does not block', () => {
    const clash = session(2, { track: agents, startsAt: '10:00', endsAt: '10:45' });
    const touching = session(3, { track: agents, startsAt: '10:45', endsAt: '11:30' });
    const otherDay = session(4, { track: agents, day: '2026-05-05', startsAt: '10:00', endsAt: '10:45' });
    const held = (status) => [{ id: 90, day: '2026-05-04', startsAt: '10:15', endsAt: '11:00', status }];

    assert.deepEqual(ids(rank([control, clash, touching, otherDay], { booked: held('confirmed') })), [1, 4]);
    assert.deepEqual(ids(rank([clash], { booked: held('waitlisted') })), [2]);
  });

  test('keynotes and socials are never recommended', () => {
    const r = rank([control, session(2, { track: agents, isKeynote: true }),
      session(3, { track: agents, format: 'Social' })]);
    assert.deepEqual(ids(r), [1]);
  });

  test('a session matching nothing is dropped, however well rated', () => {
    assert.deepEqual(ids(rank([control, session(2, { avgRating: 5 })])), [1]);
  });

  test('the list stops at ten', () => {
    const many = Array.from({ length: 14 }, (_, i) => session(i + 1, { track: agents }));
    assert.equal(rank(many).items.length, 10);
  });
});

describe('how matches rank', () => {
  const dv = { id: 7, name: 'Delphine Vandenberg' };

  test('picked and followed matches outrank an agenda-only match, each with its reason', () => {
    const agendaOnly = session(1, { tags: [topic('rag', 'RAG')] });
    const byTrack = session(2, { track: agents });
    const byTopic = session(3, { tags: [topic('evals', 'Evals')] });
    const byFollow = session(4, { speakers: [dv] });
    const r = rank([agendaOnly, byFollow, byTopic, byTrack], {
      interests: { tracks: ['agents'], tags: ['evals'] },
      followedSpeakerIds: [7], agendaTagSlugs: ['rag'],
    });

    assert.equal(ids(r).at(-1), 1, 'agenda-only is last');
    assert.deepEqual(ids(r).slice(0, 3).sort(), [2, 3, 4]);
    const reasons = Object.fromEntries(r.items.map((i) => [i.session.id, i.reasons]));
    assert.deepEqual(reasons[2], ['Agents track']);
    assert.deepEqual(reasons[3], ['Evals']);
    assert.deepEqual(reasons[4], ['you follow Delphine Vandenberg']);
    assert.deepEqual(reasons[1], ['like your agenda']);
  });

  test('a session with several reasons lists them all and ranks above one with a single reason', () => {
    const both = session(2, { track: agents, speakers: [dv] });
    const r = rank([session(1, { track: agents }), both], { followedSpeakerIds: [7] });
    assert.deepEqual(ids(r), [2, 1]);
    assert.deepEqual(r.items[0].reasons, ['Agents track', 'you follow Delphine Vandenberg']);
  });

  test('ties go to the better rated, then the lower id', () => {
    const r = rank([session(5, { track: agents, avgRating: 4.1 }), session(3, { track: agents, avgRating: 4.8 }),
      session(2, { track: agents, avgRating: 4.1 })]);
    assert.deepEqual(ids(r), [3, 2, 5]);
  });
});

describe('ratings move recommendations', () => {
  const rag = topic('rag', 'RAG');
  const dv = { id: 7, name: 'Delphine Vandenberg' };
  const rated = (stars, over = {}) => ({ id: 90, title: 'Talk 9', stars, tags: [rag], speakers: [], ...over });
  // two equal picked-track candidates; the one sharing the topic has the higher id, so only a rating can lead
  const pair = () => [session(1, { track: agents }), session(2, { track: agents, tags: [rag] })];

  test('a 5 star topic match outranks an otherwise equal candidate, and names the rated session', () => {
    const r = rank(pair(), { rated: [rated(5)] });
    assert.deepEqual(ids(r), [2, 1]);
    assert.deepEqual(r.items[0].reasons, ['Agents track', 'you rated Talk 9 5★']);
    assert.deepEqual(r.items[1].reasons, ['Agents track']);
  });

  test('a 1 star topic match ranks it below, and still lists it', () => {
    const r = rank([session(2, { track: agents, tags: [rag] }), session(1, { track: agents })], { rated: [rated(1)] });
    assert.deepEqual(ids(r), [1, 2]);
    assert.deepEqual(r.items[1].reasons, ['Agents track', 'you rated Talk 9 1★']);
  });

  test('4 and 2 star ratings count the same as 5 and 1; 3 stars changes nothing', () => {
    assert.deepEqual(ids(rank(pair(), { rated: [rated(4)] })), [2, 1]);
    assert.deepEqual(ids(rank([pair()[1], pair()[0]], { rated: [rated(2)] })), [1, 2]);
    const base = rank(pair());
    assert.deepEqual(rank(pair(), { rated: [rated(3)] }), base);
    assert.ok(base.items.every((i) => i.reasons.every((x) => !x.startsWith('you rated'))));
  });

  test('a shared speaker counts, and a rating sharing nothing is ignored', () => {
    const r = rank([session(1, { track: agents }), session(2, { track: agents, speakers: [dv] })],
      { rated: [rated(5, { tags: [], speakers: [dv] })] });
    assert.deepEqual(ids(r), [2, 1]);
    assert.deepEqual(ids(rank(pair(), { rated: [rated(5, { tags: [topic('evals', 'Evals')] })] })), [1, 2]);
  });

  test('the boost is clamped, so an explicit pick still outranks it', () => {
    const picked = session(5, { tags: [topic('evals', 'Evals')] });
    const boosted = session(1, { tags: [rag], speakers: [dv] }); // matches only through ratings
    const r = rank([boosted, picked], {
      interests: { tracks: [], tags: ['evals'] },
      rated: [rated(5, { speakers: [dv] }), rated(5, { id: 91, title: 'Talk 10' })],
    });
    assert.deepEqual(ids(r), [5, 1]);
  });

  test('a rating alone can list a session, but not unlock an empty state', () => {
    assert.deepEqual(ids(rank([session(1, { track: cloud, tags: [rag] })], { rated: [rated(5)] })), [1]);
    const none = rank([session(1, { tags: [rag] })], { interests: NONE, rated: [rated(5)] });
    assert.deepEqual(none, { items: [], needsInterests: true });
  });

  test('a net negative adjustment leaves a candidate with no other score out', () => {
    assert.deepEqual(ids(rank([session(1, { tags: [rag] })], { rated: [rated(1)] })), []);
  });
});

describe('the empty state', () => {
  test('needsInterests with nothing picked and nothing booked, and no items', () => {
    const r = rank([session(1, { track: agents })], { interests: NONE, followedSpeakerIds: [7] });
    assert.deepEqual(r, { items: [], needsInterests: true });
  });

  test('a booking alone is enough to be recommended from', () => {
    const r = rank([session(1, { tags: [topic('rag', 'RAG')] })], {
      interests: NONE, agendaTagSlugs: ['rag'],
      booked: [{ id: 99, day: '2026-05-04', startsAt: '08:00', endsAt: '08:45', status: 'confirmed' }],
    });
    assert.equal(r.needsInterests, false);
    assert.deepEqual(ids(r), [1]);
  });

  test('interests picked but nothing matching is an empty list, not the empty state', () => {
    const r = rank([session(1)]);
    assert.deepEqual(r, { items: [], needsInterests: false });
  });
});
