import { test, expect } from '@playwright/test';
import { API, ATTENDEES, visit, momentOn, laneFor, bookableFor, conferenceDays, shotForPR } from './helpers.js';

test.describe('Session detail', () => {
  test('shows the full session record', async ({ page }) => {
    await visit(page, '/sessions/1');
    const detail = page.getByTestId('session-detail');
    await expect(page.getByTestId('session-title')).toBeVisible();
    await expect(detail).toContainText('About this session');
    await expect(detail.getByRole('heading', { name: /Speaker/ })).toBeVisible();
  });

  test('adding from the detail page toggles the button', async ({ page, request }, testInfo) => {
    // Its own lane, so the click cannot land on a session this attendee is
    // already booked against — that would open the conflict dialog instead.
    const lane = await laneFor('session.add', testInfo);
    const target = (await bookableFor(request, lane.user, lane.day)).find((s) => s.seatsLeft > 3);
    expect(target, 'nothing this attendee can add').toBeTruthy();

    await visit(page, `/sessions/${target.id}`, { as: lane.user, at: await momentOn(0, '07:00') });
    const action = page.getByTestId('save-session');
    await expect(action).toHaveText('Add to my agenda');
    await action.click();
    await expect(action).toHaveText('On my agenda');

    await request.delete(`${API}/users/${lane.user}/reservations/${target.id}`);
  });

  test('off-site sessions warn about travel time', async ({ page }) => {
    // Find a Foundry session, then open it.
    await visit(page, '/schedule?venue=2&view=list');
    await expect(page.getByTestId('result-count')).not.toHaveText(/Loading/);
    await page.locator('article').first().getByRole('heading').click();

    await expect(page.getByTestId('travel-notice')).toBeVisible();
    await expect(page.getByTestId('travel-notice')).toContainText(/min/);
  });

  test('navigating from a session to its speaker works', async ({ page }) => {
    await visit(page, '/sessions/1');
    await page.getByRole('link', { name: /./ }).filter({ hasText: /Labs|Systems|AI|Research/ }).first().click();
    await expect(page.getByTestId('speaker-detail')).toBeVisible();
  });

  test('a session down to its last seat reads singular, not plural', async ({ page, request }) => {
    const all = await (await request.get(`${API}/sessions`)).json();
    const target = all.find((s) => s.seatsLeft === 1);
    expect(target, 'the seed should leave a session at exactly one seat left').toBeTruthy();

    await visit(page, `/sessions/${target.id}`);
    await expect(page.getByTestId('header-seats')).toHaveText('1 seat left');
    await expect(page.getByTestId('seats-left')).toHaveText('1 seat left');
  });

  test('a seat count over a thousand keeps its thousands separator', async ({ page, request }) => {
    const all = await (await request.get(`${API}/sessions`)).json();
    const target = all.find((s) => s.seatsLeft > 999);
    expect(target, 'the seed should have a session with over 999 seats left').toBeTruthy();

    await visit(page, `/sessions/${target.id}`);
    const expected = `${target.seatsLeft.toLocaleString()} seats left`;
    await expect(page.getByTestId('header-seats')).toHaveText(expected);
    await expect(page.getByTestId('seats-left')).toHaveText(expected);
  });

  test('an ended session offers no seat', async ({ page, request }) => {
    // Read-only: an ended session's controls make no call, so no lane is
    // needed. Taken from the end of Day 1, where no other lane books.
    const days = await conferenceDays();
    const me = await (await request.get(`${API}/users/${ATTENDEES.marcus}`)).json();
    const held = new Set(me.reservations.map((r) => r.sessionId));
    const onDay1 = await (await request.get(`${API}/sessions?day=${days[0]}`)).json();
    const target = onDay1.filter((s) => !held.has(s.id)).at(-1);
    expect(target, 'no Day 1 session Marcus has not booked').toBeTruthy();

    await visit(page, `/sessions/${target.id}`, { as: ATTENDEES.marcus, at: await momentOn(1, '10:00') });
    await expect(page.getByTestId('session-title')).toBeVisible();

    await expect(page.getByTestId('session-ended')).toContainText('ended');
    await expect(page.getByTestId('save-session')).toBeDisabled();
    await expect(page.getByTestId('session-ended-seat')).toBeDisabled();
    await expect(page.getByTestId('reserve-seat')).toHaveCount(0);
    await shotForPR(page, 'ended-session');
  });

  test('phone: the page fits 375px for a keynote, a many-tag talk and a full session', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout');
    await page.setViewportSize({ width: 375, height: 667 });
    const sessions = await (await request.get(`${API}/sessions`)).json();
    const list = Array.isArray(sessions) ? sessions : sessions.sessions;
    const keynote = list.find((s) => s.isKeynote);
    const manyTags = list.reduce((a, b) => (b.tags.length > a.tags.length ? b : a));
    const full = list.find((s) => s.isFull);
    for (const s of [keynote, manyTags, full]) {
      await visit(page, `/sessions/${s.id}`);
      await expect(page.getByTestId('session-title')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `session ${s.id} overflows sideways`).toBeLessThanOrEqual(1);
      const aside = await page.locator('aside').boundingBox();
      expect(aside.x + aside.width, `session ${s.id} aside`).toBeLessThanOrEqual(375);
      const chips = page.locator('aside a[href^="/schedule?tag="]');
      if (await chips.count()) {
        const box = await chips.last().boundingBox();
        expect(box.x + box.width, `session ${s.id} last tag chip`).toBeLessThanOrEqual(375);
      }
      if (s === manyTags) await shotForPR(page, 'session-page-fits-phone');
    }

    // 320px: the multi-speaker session's speaker cards stay inside the viewport
    await page.setViewportSize({ width: 320, height: 568 });
    const counts = await Promise.all(
      list.map(async (s) => {
        if (Array.isArray(s.speakers)) return [s, s.speakers.length];
        const full = await (await request.get(`${API}/sessions/${s.id}`)).json();
        return [s, full.speakers.length];
      }),
    );
    const [panel, n] = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(n, 'no multi-speaker session seeded').toBeGreaterThan(1);
    await visit(page, `/sessions/${panel.id}`);
    await expect(page.getByTestId('session-title')).toBeVisible();
    const overflow320 = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow320, `session ${panel.id} overflows sideways at 320px`).toBeLessThanOrEqual(1);
    const cards = page.locator('section', { has: page.getByRole('heading', { name: /Speakers?$/ }) }).locator('a[href^="/speakers/"]');
    expect(await cards.count()).toBe(n);
    for (let i = 0; i < n; i++) {
      const box = await cards.nth(i).boundingBox();
      expect(box.x + box.width, `speaker card ${i} at 320px`).toBeLessThanOrEqual(320);
    }
    await shotForPR(page, 'speaker-cards-fit-320');
  });

  test('desktop: the aside stays 20rem, beside the main column, with no overflow', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop layout');
    const sessions = await (await request.get(`${API}/sessions`)).json();
    const list = Array.isArray(sessions) ? sessions : sessions.sessions;
    await visit(page, `/sessions/${list[0].id}`);
    await expect(page.getByTestId('session-title')).toBeVisible();
    const aside = await page.locator('aside').boundingBox();
    const main = await page.locator('[data-testid="session-detail"] > div.grid > div').first().boundingBox();
    expect(Math.round(aside.width)).toBe(320);
    expect(aside.x).toBeGreaterThanOrEqual(main.x + main.width);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('an unknown session id shows a real not-found page, not a retry prompt', async ({ page }) => {
    await visit(page, '/sessions/999999');
    await expect(page.getByRole('heading', { name: 'Session not found' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse the schedule' })).toBeVisible();
    await expect(page).toHaveTitle("Not found · ORBIT '26");
    await shotForPR(page, 'session-not-found');
  });

  test('a genuine failure loading a session still offers a retry', async ({ page }) => {
    await page.route('**/api/sessions/1**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }),
    );
    await visit(page, '/sessions/1');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
