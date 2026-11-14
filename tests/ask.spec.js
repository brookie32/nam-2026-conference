import { test, expect } from '@playwright/test';
import { visit, shotForPR } from './helpers.js';

/**
 * Ask ORBIT, as the attendee sees it. `/api/ask` is always fulfilled by the
 * test, so nothing here reaches a model; the rules behind the answer (real
 * sessions only, streaming, 503) are proved in tests/api/ask.test.js.
 */
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
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: 'Try [The agent talk](/sessions/7) or [elsewhere](https://example.com/x).',
    });
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
  await page.route('**/api/ask', (route) => route.fulfill({
    status: 200,
    contentType: 'text/plain',
    body: `Compare:\n\n| Mode | Talk | Notes |\n| --- | :--: | --- |\n| Walk | [The agent talk](/sessions/7) | ${wide} |\n| Bus | [elsewhere](https://example.com/x) | ${wide} |\n\nPick one.`,
  }));
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
