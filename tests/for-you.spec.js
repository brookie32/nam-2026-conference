import { test, expect } from '@playwright/test';
import { API, ATTENDEES, visit, momentOn, laneFor, bookableFor, shotForPR, failOnPageErrors } from './helpers.js';

/**
 * /for-you in one walk: the empty state, picking interests, surviving a reload and an
 * attendee switch-back, recommendations with reasons, and taking a seat from the list.
 * The rules behind the list (what is excluded, how it ranks) are proved in
 * tests/api/recommendations.test.js and tests/unit/recommend.test.js.
 */
test('For you: pick interests, see why each talk is recommended, take a seat from the list', async ({ page, request }, testInfo) => {
  const lane = await laneFor('foryou.seat', testInfo);
  const errors = failOnPageErrors(page);
  const at = await momentOn(2, '17:00');   // the 17:15 slot is still ahead

  // The talk this walk will book, and interests that make it the best match on the list.
  const target = (await bookableFor(request, lane.user, lane.day))
    .find((s) => s.startsAt === lane.slot && s.seatsLeft > 3);
  expect(target, `no open session at ${lane.slot}`).toBeTruthy();
  const topics = target.tags.filter((t) => t.kind === 'topic');
  const chips = [target.track.name, ...topics.map((t) => t.name)];
  await request.put(`${API}/users/${lane.user}/interests`, { data: { tracks: [], tags: [] } });

  const interest = (name) => page.getByTestId('foryou-interest').filter({ hasText: new RegExp(`^${name}$`) });
  const pressed = page.locator('[data-testid="foryou-interest"][aria-pressed="true"]');
  const item = page.locator(`[data-testid="foryou-item"][data-session-id="${target.id}"]`);

  // Nothing picked and nothing planned: the page asks for interests first.
  await page.route('**/recommendations*', (route) =>
    route.fulfill({ json: { items: [], needsInterests: true } }));
  await visit(page, '/for-you', { as: lane.user, at });
  await expect(page.getByTestId('foryou-empty')).toBeVisible();
  await page.unroute('**/recommendations*');

  // Picking saves, and the list fills in with a reason on every item.
  for (const name of chips) await interest(name).click();
  await expect(pressed).toHaveCount(chips.length);
  await expect(item).toBeVisible();
  await expect(page.getByTestId('foryou-empty')).toHaveCount(0);
  const reasons = page.getByTestId('foryou-reason');
  expect(await reasons.count()).toBeGreaterThan(0);
  for (const text of await reasons.allInnerTexts()) expect(text.trim()).not.toBe('');
  await expect(item.getByTestId('foryou-reason')).toContainText(target.track.name);
  await shotForPR(page, 'For you recommendations with their reasons');

  // They survive a reload, and an attendee switch-back.
  await page.reload();
  await expect(pressed).toHaveCount(chips.length);
  await visit(page, '/for-you', { as: ATTENDEES.jonas, at });
  await expect(interest(target.track.name)).toHaveAttribute('aria-pressed', 'false');
  await visit(page, '/for-you', { as: lane.user, at });
  await expect(pressed).toHaveCount(chips.length);

  // Taking the seat puts it on My Agenda and takes it off the list.
  try {
    await item.getByRole('button', { name: 'Add to my agenda' }).click();
    await expect(item).toHaveCount(0);
    await visit(page, '/my-agenda', { as: lane.user, at });
    await expect(page.locator(`[data-testid="agenda-row"][data-session-id="${target.id}"]`)).toBeVisible();
  } finally {
    await request.delete(`${API}/users/${lane.user}/reservations/${target.id}`);
  }
  expect(errors).toEqual([]);
});
