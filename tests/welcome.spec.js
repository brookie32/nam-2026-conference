import { test, expect } from '@playwright/test';
import { API, visit, momentOn, laneFor, shotForPR, failOnPageErrors } from './helpers.js';

/**
 * The first-visit welcome on Home, in one walk: it shows for an attendee with no picks, Skip
 * hides it across a reload for that attendee only, a role pre-selects its topics, and Save
 * stores them and refreshes Recommended for you without a reload. What is stored, and the
 * 400s, are proved in tests/api/recommendations.test.js.
 */
test('Welcome: skip persists per attendee; a role pre-selects topics and Save fills the strip', async ({ page, request }, testInfo) => {
  const lane = await laneFor('home.welcome', testInfo);
  const errors = failOnPageErrors(page);
  const at = await momentOn(0, '09:00');
  for (const id of [lane.user, lane.other]) {
    await request.put(`${API}/users/${id}/interests`, { data: { tracks: [], tags: [] } });
  }

  const panel = page.getByTestId('welcome-panel');
  const save = page.getByTestId('welcome-save');
  const pressed = page.locator('[data-testid="welcome-chip"][aria-pressed="true"]');
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  // The strip has rendered, so a missing panel is a decision and not a page still loading.
  const settled = () => expect(page.getByTestId('recs-strip')).toBeVisible();

  // No interests: the panel shows, fits the screen, and Save waits for three picks.
  await visit(page, '/', { as: lane.user, at });
  await expect(panel).toBeVisible();
  expect(await fits(), 'no horizontal overflow with the welcome open').toBe(true);
  await expect(save).toBeDisabled();

  // Skip hides it, and still hides it after a reload.
  await page.getByTestId('welcome-skip').click();
  await expect(panel).toHaveCount(0);
  await page.reload();
  await settled();
  await expect(panel).toHaveCount(0);

  // Another attendee with no interests still sees it.
  await visit(page, '/', { as: lane.other, at });
  await expect(panel).toBeVisible();
  await expect(pressed).toHaveCount(0);

  // A role pre-selects its three topics; changing one below three disables Save.
  await page.getByTestId('welcome-role').filter({ hasText: 'All-week VIP' }).click();
  await expect(page.getByTestId('welcome-role').filter({ hasText: 'All-week VIP' })).toHaveAttribute('aria-pressed', 'true');
  const topics = ['Agent Design', 'Governance', 'Observability'];
  await expect(pressed).toHaveCount(3);
  for (const name of topics) {
    await expect(pressed.filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1);
  }
  const first = page.getByTestId('welcome-chip').filter({ hasText: /^Agent Design$/ });
  await first.click();
  await expect(save).toBeDisabled();
  await first.click();
  await expect(pressed).toHaveCount(3);
  expect(await fits()).toBe(true);
  await shotForPR(page, 'Welcome with a role chosen');

  // Save stores role and topics, hides the panel and fills the strip with no navigation.
  await page.evaluate(() => { window.__noReload = true; });
  await save.click();
  await expect(panel).toHaveCount(0);
  const stored = await (await request.get(`${API}/users/${lane.other}/interests`)).json();
  expect(stored).toEqual({ tracks: [], tags: ['agent-design', 'governance', 'observability'], role: 'vip' });
  await expect(page.getByTestId('recs-item').first()).toBeVisible();
  const reasons = (await page.getByTestId('recs-reason').allInnerTexts()).join(' | ');
  expect(topics.some((t) => reasons.includes(t)), `a reason names a picked topic: ${reasons}`).toBe(true);
  expect(await page.evaluate(() => window.__noReload), 'the page did not reload').toBe(true);

  // With interests it stays away after a reload.
  await page.reload();
  await settled();
  await expect(panel).toHaveCount(0);

  for (const id of [lane.user, lane.other]) {
    await request.put(`${API}/users/${id}/interests`, { data: { tracks: [], tags: [] } });
  }
  expect(errors).toEqual([]);
});
