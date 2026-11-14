import { test, expect } from '@playwright/test';
import { ATTENDEES, momentOn, visit, shotForPR } from './helpers.js';

/**
 * The Ask ORBIT panel, as the attendee sees it. Read-only: `/api/ask` is always
 * fulfilled or replaced here, so nothing reaches a model.
 */
const sse = (chunks) => [{ type: 'start' }, { type: 'start-step' }, ...chunks, { type: 'finish-step' }, { type: 'finish' }]
  .map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
const reply = (text) => ({
  status: 200, contentType: 'text/event-stream', headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
  body: sse([{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: text }, { type: 'text-end', id: 't' }]),
});

test('Ask ORBIT panel: opens from every page and from Home, closes cleanly, stays off the tab bar, carries the page, and streams', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const at = await momentOn(0, '14:00');
  // A question that says "hold" gets a stream that sends text, then waits for window.__release.
  await page.addInitScript(() => {
    const real = window.fetch.bind(window);
    window.__released = false;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.includes('/api/ask') || !String(init?.body).includes('hold')) return real(input, init);
      const enc = new TextEncoder();
      const send = (c, o) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      return Promise.resolve(new Response(new ReadableStream({
        async start(c) {
          for (const o of [{ type: 'start' }, { type: 'start-step' }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'First words' }]) send(c, o);
          await new Promise((r) => { window.__release = r; });
          window.__released = true;
          for (const o of [{ type: 'text-delta', id: 't', delta: ' and the rest' }, { type: 'text-end', id: 't' }, { type: 'finish-step' }, { type: 'finish' }]) send(c, o);
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          c.close();
        },
      }), { status: 200, headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } }));
    };
  });
  const bodies = [];
  await page.route('**/api/ask', (route) => { bodies.push(route.request().postDataJSON()); return route.fulfill(reply('Sure.')); });
  const dialog = page.getByRole('dialog', { name: 'Ask ORBIT' });
  const launcher = page.getByRole('button', { name: 'Ask ORBIT' });

  await visit(page, '/', { as: ATTENDEES.jonas, at });
  // Home's input opens the panel with the question already sent.
  await page.getByRole('textbox', { name: 'Ask anything' }).fill('what is on now?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-role="user"]').first()).toHaveText('what is on now?');
  await expect(dialog.getByText('Sure.')).toBeVisible();
  await shotForPR(page, 'Ask ORBIT panel open on Home');

  // Esc closes and focus returns to the button; the conversation survives.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await expect(dialog.getByText('what is on now?')).toBeVisible();
  await expect(dialog.getByTestId('ask-input')).toBeFocused();
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'))).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent)).toMatch(/Ask ORBIT/);

  // The button clears the tab bar, and the page does not scroll sideways.
  const l = await launcher.boundingBox();
  const t = await page.getByRole('navigation', { name: 'Tabs' }).boundingBox();
  expect(l.y + l.height).toBeLessThanOrEqual(t.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Every page has the button; /ask, the full-page view, does not.
  const sessions = await (await page.request.get('/api/sessions')).json();
  for (const route of ['/schedule', '/speakers', '/my-agenda', '/for-you', '/venues', '/food', '/expo', `/sessions/${sessions[0].id}`]) {
    await page.goto(route);
    await launcher.click();
    await expect(dialog, route).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
  await page.goto('/ask');
  await expect(launcher).toHaveCount(0);

  // On a session page the request carries the route and the session id.
  await page.goto(`/sessions/${sessions[0].id}`);
  await launcher.click();
  await dialog.getByTestId('ask-input').fill('is it full?');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.getByText('Sure.').last()).toBeVisible();
  const last = bodies.at(-1);
  expect(last.sessionId).toBe(sessions[0].id);
  expect(last.route).toBe(`/sessions/${sessions[0].id}`);

  // Streaming: the first text is on the page while the stream is still open.
  await dialog.getByTestId('ask-input').fill('hold the answer');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog.getByText('First words')).toBeVisible();
  expect(await page.evaluate(() => window.__released)).toBe(false);
  await page.evaluate(() => window.__release());
  await expect(dialog.getByText('First words and the rest')).toBeVisible();
});
