import { test, expect } from '@playwright/test';
import { API, ATTENDEES, momentOn, visit, shotForPR } from './helpers.js';

/**
 * Ask ORBIT, as the attendee sees it. `/api/ask` is always fulfilled by the
 * test, so nothing here reaches a model; the rules behind the answer (real
 * sessions only, streaming, 503) are proved in tests/api/ask.test.js.
 */
/** A UI-message SSE body: one assistant message made of `chunks`. */
const sse = (chunks) => [{ type: 'start' }, { type: 'start-step' }, ...chunks, { type: 'finish-step' }, { type: 'finish' }]
  .map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';

const sseReply = (text) => ({
  status: 200,
  contentType: 'text/event-stream',
  headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
  body: sse([{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: text }, { type: 'text-end', id: 't' }]),
});

test('Ask ORBIT: an answer links sessions, the missing key is explained, and the input fits', async ({ page }) => {
  await visit(page, '/ask');
  await expect(page.getByRole('heading', { name: 'Ask ORBIT' }).first()).toBeVisible();

  const input = page.getByTestId('ask-input');
  const send = page.getByRole('button', { name: 'Send' });
  await expect(input).toBeVisible();
  await expect(send).toBeVisible();
  expect((await input.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // An answer: a session link becomes an anchor, any other link is only text. Send is
  // disabled while the request is pending.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/ask', async (route) => {
    await gate;
    await route.fulfill(sseReply('Try [The agent talk](/sessions/7) or [elsewhere](https://example.com/x).'));
  });
  await input.fill('agent talks on day 2');
  await send.click();
  await expect(send).toBeDisabled();
  release();

  const messages = page.getByTestId('ask-messages');
  await expect(messages.getByRole('link', { name: 'The agent talk' })).toHaveAttribute('href', '/sessions/7');
  await expect(messages).toContainText('elsewhere');
  await expect(messages.getByRole('link', { name: 'elsewhere' })).toHaveCount(0);
  await shotForPR(page, 'Ask ORBIT answering with a session link');

  // No key: the API says 503 and the page says so.
  await page.unroute('**/api/ask');
  await page.route('**/api/ask', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Ask ORBIT is not configured' }),
  }));
  await input.fill('anything');
  await send.click();
  await expect(page.getByTestId('ask-not-configured')).toContainText("Ask ORBIT isn't configured");
});

test('Ask ORBIT: a Markdown table renders as a table, links in cells work, and a wide one scrolls inside the reply', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await visit(page, '/ask');
  const wide = 'A very long description that keeps this column wider than a phone screen can show';
  await page.route('**/api/ask', (route) => route.fulfill(sseReply(`Compare:\n\n| Mode | Talk | Notes |\n| --- | :--: | --- |\n| Walk | [The agent talk](/sessions/7) | ${wide} |\n| Bus | [elsewhere](https://example.com/x) | ${wide} |\n\nPick one.`)));
  await page.getByTestId('ask-input').fill('how do I get there');
  await page.getByRole('button', { name: 'Send' }).click();

  const reply = page.getByTestId('ask-messages').locator('[data-role="assistant"]');
  const table = reply.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Mode', 'Talk', 'Notes']);
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('cell', { name: 'Walk' })).toBeVisible();
  await expect(table.getByRole('link', { name: 'The agent talk' })).toHaveAttribute('href', '/sessions/7');
  await expect(table.getByRole('cell', { name: 'elsewhere' })).toBeVisible();
  await expect(table.getByRole('link', { name: 'elsewhere' })).toHaveCount(0);
  await expect(reply).toContainText('Compare:');
  await expect(reply).toContainText('Pick one.');
  expect(await reply.innerText()).not.toContain('|');

  const box = await table.evaluate((t) => { const w = t.parentElement; return { sw: w.scrollWidth, cw: w.clientWidth }; });
  expect(box.sw).toBeGreaterThan(box.cw);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shotForPR(page, 'Ask ORBIT answering with a table');
});

test('Ask ORBIT: the request knows today and who is asking, and the model can answer with cards', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const ids = (await (await request.get(`${API}/sessions`)).json()).slice(0, 2).map((s) => s.id);
  const sessions = await Promise.all(ids.map(async (id) => (await request.get(`${API}/sessions/${id}`)).json()));
  const { travel } = await (await request.get(`${API}/bootstrap`)).json();
  const from = travel[0].fromVenueId;
  const to = travel[0].toVenueId;
  const modes = travel.filter((t) => t.fromVenueId === from && t.toVenueId === to);

  let body;
  await page.route('**/api/ask', (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1', 'cache-control': 'no-cache' },
      body: sse([
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Compare:\n\n| Mode | Talk |\n| --- | --- |\n| Walk | [The agent talk](/sessions/7) |\n\nHere you go.' },
        { type: 'text-end', id: 't1' },
        { type: 'tool-input-available', toolCallId: 'c1', toolName: 'showSessions', input: { ids } },
        { type: 'tool-output-available', toolCallId: 'c1', output: { ids } },
        { type: 'tool-input-available', toolCallId: 'c2', toolName: 'showTravel', input: { fromVenueId: from, toVenueId: to } },
        { type: 'tool-output-available', toolCallId: 'c2', output: { fromVenueId: from, toVenueId: to } },
      ]),
    });
  });

  const at = await momentOn(1, '14:00');
  await visit(page, '/ask', { as: ATTENDEES.andy, at });
  await page.getByTestId('ask-input').fill('what is on this afternoon?');
  await page.getByRole('button', { name: 'Send' }).click();

  const reply = page.getByTestId('ask-messages').locator('[data-role="assistant"]');
  // Text parts still render Markdown, tables included.
  await expect(reply.getByRole('table').getByRole('columnheader')).toHaveText(['Mode', 'Talk']);
  await expect(reply.getByRole('link', { name: 'The agent talk' })).toHaveAttribute('href', '/sessions/7');

  // The request knows the clock and the attendee.
  expect(body.day).toBe(at.split('T')[0]);
  expect(body.time).toBe('14:00');
  expect(body.userId).toBe(ATTENDEES.andy);
  expect(body.messages.at(-1).parts[0].text).toBe('what is on this afternoon?');

  // showSessions: one card per id with its time, room and seats from the API.
  const cards = reply.getByTestId('session-card');
  await expect(cards).toHaveCount(2);
  for (const [i, s] of sessions.entries()) {
    await expect(cards.nth(i)).toContainText(s.startsAt);
    await expect(cards.nth(i)).toContainText(s.room.name);
  }

  // showTravel: a row per mode.
  const rows = reply.getByTestId('ask-travel');
  await expect(rows).toHaveCount(modes.length);
  for (const m of modes) await expect(reply).toContainText(m.mode);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shotForPR(page, 'Ask ORBIT answering with session and travel cards');
});
