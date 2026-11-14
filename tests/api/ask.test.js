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

const ask = (question) => api.post('/ask', { messages: [{ role: 'user', content: question }] });

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
    setAskModel(searchingModel({ day: days[1].date, trackSlug: (await api.json('/bootstrap')).tracks[0].slug }));
    const res = await fetch(`${origin}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(res.status, 200);
    let chunks = 0;
    for await (const _ of res.body) chunks += 1;
    assert.ok(chunks > 1, `expected several chunks, got ${chunks}`);
  });

  test('rejects a missing or empty messages array with 400', async () => {
    setAskModel(searchingModel({}));
    for (const body of [{}, { messages: [] }, { messages: 'hi' }]) {
      const res = await api.post('/ask', body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
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
