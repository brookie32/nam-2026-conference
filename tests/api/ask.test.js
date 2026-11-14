import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV2, simulateReadableStream } from 'ai/test';
import { startApi } from './harness.js';

/**
 * Ask ORBIT — `POST /api/ask`.
 *
 * The model is always a stub (`setAskModel`) and `AI_GATEWAY_API_KEY` is unset
 * for the whole file, so a call that reached the real gateway would fail.
 */

let api;
let origin;
let close;
let setAskModel;

before(async () => {
  delete process.env.AI_GATEWAY_API_KEY;
  ({ api, origin, close } = await startApi());
  ({ setAskModel } = await import('../../server/lib/ask.js'));
});
after(() => { setAskModel(null); return close(); });

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** The `tool-result` the last step produced, if any. */
const lastToolResult = (prompt) => prompt.flatMap((m) => (m.role === 'tool' ? m.content : [])).at(-1);

/**
 * A stub that calls `searchSessions` with `args`, then writes one markdown link
 * per session the tool returned, a few words at a time.
 */
function searchingModel(args) {
  return new MockLanguageModelV2({
    doStream: async ({ prompt }) => {
      const result = lastToolResult(prompt);
      if (!result) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'tool-call', toolCallId: 't1', toolName: 'searchSessions', input: JSON.stringify(args) },
              { type: 'finish', finishReason: 'tool-calls', usage },
            ],
          }),
        };
      }
      const sessions = result.output.value.sessions;
      const words = ['Here are the talks: ', ...sessions.map((s) => `- [${s.title}](/sessions/${s.id})\n`)];
      return {
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 25,
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'a' },
            ...words.map((delta) => ({ type: 'text-delta', id: 'a', delta })),
            { type: 'text-end', id: 'a' },
            { type: 'finish', finishReason: 'stop', usage },
          ],
        }),
      };
    },
  });
}

const userMessage = (text) => ({ id: 'u1', role: 'user', parts: [{ type: 'text', text }] });
const ask = (question, extra = {}) => api.post('/ask', { messages: [userMessage(question)], day: '2026-01-01', time: '10:00', userId: 1, ...extra });

/** A stub that records the prompt it was called with, then answers in one text part. */
function recordingModel(seen) {
  return new MockLanguageModelV2({
    doStream: async ({ prompt }) => {
      seen.push(prompt);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'a' },
            { type: 'text-delta', id: 'a', delta: 'ok' },
            { type: 'text-end', id: 'a' },
            { type: 'finish', finishReason: 'stop', usage },
          ],
        }),
      };
    },
  });
}

/** A stub that calls one tool, then says it is done. */
function toolModel(toolName, args) {
  return new MockLanguageModelV2({
    doStream: async ({ prompt }) => {
      const chunks = lastToolResult(prompt)
        ? [{ type: 'text-start', id: 'a' }, { type: 'text-delta', id: 'a', delta: 'done' }, { type: 'text-end', id: 'a' }, { type: 'finish', finishReason: 'stop', usage }]
        : [{ type: 'tool-call', toolCallId: 't1', toolName, input: JSON.stringify(args) }, { type: 'finish', finishReason: 'tool-calls', usage }];
      return { stream: simulateReadableStream({ chunks: [{ type: 'stream-start', warnings: [] }, ...chunks] }) };
    },
  });
}

describe('Ask ORBIT with a stubbed model', () => {
  test('names only the real Day 2 afternoon sessions on a track, each linked to /sessions/:id', async () => {
    const { days } = await api.json('/bootstrap');
    const day = days[1].date;
    const all = await api.json(`/sessions?day=${day}`);
    const afternoon = all.filter((s) => s.startsAt >= '12:00');
    const trackSlug = afternoon[0].track.slug;
    const expected = afternoon.filter((s) => s.track.slug === trackSlug).map((s) => s.id).sort();
    assert.ok(expected.length > 0 && expected.length < afternoon.length, 'the track should be a real subset');

    setAskModel(searchingModel({ day, trackSlug, from: '12:00' }));
    const res = await ask(`What ${trackSlug} talks are on Day 2 in the afternoon?`);
    assert.equal(res.status, 200);

    const ids = [...res.text.matchAll(/\]\(\/sessions\/(\d+)\)/g)].map((m) => Number(m[1]));
    assert.deepEqual([...ids].sort(), expected);
    for (const id of ids) {
      const real = await api.get(`/sessions/${id}`);
      assert.equal(real.status, 200, `/sessions/${id} should exist`);
      assert.match(res.text, new RegExp(`\\[${real.body.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`));
    }
  });

  test('the notFull filter drops full sessions', async () => {
    const { days } = await api.json('/bootstrap');
    const day = days[1].date;
    const all = await api.json(`/sessions?day=${day}`);
    const open = all.filter((s) => !s.isFull).map((s) => s.id).sort();
    assert.ok(open.length < all.length, 'the seed should have a full session on Day 2');

    setAskModel(searchingModel({ day, notFull: true }));
    const res = await ask('anything not full on day 2?');
    const ids = [...res.text.matchAll(/\]\(\/sessions\/(\d+)\)/g)].map((m) => Number(m[1]));
    assert.deepEqual([...ids].sort(), open);
  });

  test('streams the reply in more than one chunk', async () => {
    const { days } = await api.json('/bootstrap');
    setAskModel(searchingModel({ day: days[1].date, from: '12:00' }));
    const res = await fetch(`${origin}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [userMessage('hi')], day: '2026-01-01', time: '10:00', userId: 1 }),
    });
    assert.equal(res.status, 200);
    let chunks = 0;
    for await (const _ of res.body) chunks += 1;
    assert.ok(chunks > 1, `expected several chunks, got ${chunks}`);
  });

  test('rejects a missing or empty messages array with 400', async () => {
    setAskModel(searchingModel({}));
    const old = [{ role: 'user', content: 'hi' }];
    const noText = [{ id: 'x', role: 'user', parts: [] }];
    const ok = [userMessage('hi')];
    for (const body of [{}, { messages: [] }, { messages: 'hi' }, { messages: old, day: 'd', time: 't' },
      { messages: noText, day: 'd', time: 't' }, { messages: ok }, { messages: ok, day: 'd', time: 5 }]) {
      const res = await api.post('/ask', body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });
});

describe('Ask ORBIT knows today and who is asking', () => {
  test('the system prompt carries the posted day and time and that attendee\'s agenda for the day', async () => {
    const { days: schedule } = await api.json('/users/1/schedule');
    const day = schedule.find((d) => d.sessions.length)?.date;
    assert.ok(day, 'Jonas should have a booked day');
    const titles = schedule.find((d) => d.date === day).sessions.map((s) => s.title);
    const other = schedule.filter((d) => d.date !== day).flatMap((d) => d.sessions.map((s) => s.title));

    const seen = [];
    setAskModel(recordingModel(seen));
    const res = await ask('what is on this afternoon?', { day, time: '14:00', userId: 1 });
    assert.equal(res.status, 200);
    const system = seen[0].find((m) => m.role === 'system').content;
    assert.ok(system.includes(day) && system.includes('14:00'));
    for (const t of titles) assert.ok(system.includes(t), `agenda title missing: ${t}`);
    for (const t of other.filter((t) => !titles.includes(t))) assert.ok(!system.includes(t), `another day's title leaked: ${t}`);
  });

  test('a showSessions call streams as a tool-input-available chunk', async () => {
    setAskModel(toolModel('showSessions', { ids: [1, 2] }));
    const res = await ask('show me two', { day: '2026-01-01', time: '10:00', userId: 1 });
    assert.equal(res.status, 200);
    assert.match(res.text, /"type":"tool-input-available"[^\n]*"toolName":"showSessions"/);
    assert.match(res.text, /"ids":\[1,2\]/);
  });

  test('a showTravel call streams as a tool-input-available chunk', async () => {
    setAskModel(toolModel('showTravel', { fromVenueId: 1, toVenueId: 2 }));
    const res = await ask('how do I get across', { day: '2026-01-01', time: '10:00', userId: 1 });
    assert.match(res.text, /"toolName":"showTravel"/);
  });
});

describe('Ask ORBIT is page-aware and streams for real', () => {
  test('a session page\'s id reaches the prompt, with its title', async () => {
    const session = await api.json('/sessions/3');
    const seen = [];
    setAskModel(recordingModel(seen));
    const res = await ask('is this one full?', { route: '/sessions/3', sessionId: 3 });
    assert.equal(res.status, 200);
    const system = seen[0].find((m) => m.role === 'system').content;
    assert.ok(system.includes(session.title), 'the prompt should name the session being looked at');
    assert.ok(system.includes('/sessions/3'));
  });

  test('the first chunk arrives before the model has finished, and the response is not buffered', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let finished = false;
    setAskModel(new MockLanguageModelV2({
      doStream: async () => ({
        stream: new ReadableStream({
          async start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 'a' });
            controller.enqueue({ type: 'text-delta', id: 'a', delta: 'first words' });
            await gate;
            finished = true;
            controller.enqueue({ type: 'text-end', id: 'a' });
            controller.enqueue({ type: 'finish', finishReason: 'stop', usage });
            controller.close();
          },
        }),
      }),
    }));
    const res = await fetch(`${origin}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [userMessage('hi')], day: '2026-01-01', time: '10:00', userId: 1 }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('x-accel-buffering'), /no/);
    assert.match(res.headers.get('cache-control'), /no-transform/);
    const reader = res.body.getReader();
    let seen = '';
    while (!seen.includes('first words')) {
      const { value, done } = await reader.read();
      assert.ok(!done, 'the stream ended before any text');
      seen += Buffer.from(value).toString();
    }
    assert.equal(finished, false, 'text should arrive while the model is still going');
    release();
    while (!(await reader.read()).done);
  });
});

describe('Ask ORBIT without a model', () => {
  test('answers 503 "not configured" when there is no key and no model', async () => {
    setAskModel(null);
    delete process.env.AI_GATEWAY_API_KEY;
    const res = await ask('hello');
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'Ask ORBIT is not configured');
  });
});
