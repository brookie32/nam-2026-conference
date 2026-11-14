import { test, expect } from '@playwright/test';
import { API, ATTENDEES, bookableFor, laneFor, momentOn, shotForPR, visit, waitForResults } from './helpers.js';

// Runs against a production build: the service worker is only registered there.
const PROD_PORT = Number(process.env.PROD_PORT ?? Number(process.env.PORT ?? 3001) + 100);
const WEB_PORT = process.env.WEB_PORT ?? 5173;
test.use({ baseURL: `http://localhost:${PROD_PORT}` });

const controlled = (page) => page.waitForFunction(() => !!navigator.serviceWorker.controller);

test('a visited page opens offline from the cache, writes fail without changing anything, and reconnecting refreshes it', async ({ page, request, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one walk on desktop; the worker is not layout');
  const lane = await laneFor('offline.seat', testInfo);
  const at = await momentOn(0, '08:00');
  const firstCard = () => page.getByTestId('session-card').first();
  const banner = page.getByTestId('offline-banner');
  const toaster = page.getByTestId('toaster');

  // The dev server registers no worker and still links the manifest.
  await visit(page, `http://localhost:${WEB_PORT}/`, { as: lane.user, at });
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);

  // The production build serves a manifest with an icon and registers the worker.
  const manifest = await (await request.get(`http://localhost:${PROD_PORT}/manifest.webmanifest`)).json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.theme_color).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  const icon = await request.get(`http://localhost:${PROD_PORT}${manifest.icons[0].src}`);
  expect(icon.status()).toBe(200);

  const listPath = `/schedule?day=${lane.day}&view=list`;
  await visit(page, listPath, { as: lane.user, at });
  const scriptURL = await page.evaluate(async () => (await navigator.serviceWorker.ready).active.scriptURL);
  expect(scriptURL).toMatch(/\/sw\.js$/);
  await controlled(page);

  // Visit both pages once while the worker is in charge, so they are cached.
  await page.goto(listPath);
  await waitForResults(page);
  const onlineTitle = await firstCard().locator('h3').first().innerText();
  await page.goto('/speakers');
  await expect(page.getByTestId('all-speakers')).toBeVisible();
  const speakerCount = await page.getByTestId('speaker-count').innerText();
  const [session] = await bookableFor(request, lane.user, lane.day);
  await page.goto(`/sessions/${session.id}`);
  await expect(page.getByTestId('reserve-seat')).toBeVisible();
  await expect(banner).toHaveCount(0);

  // Offline: the page that is open says so, and a seat is refused without a request.
  const before = (await (await request.get(`${API}/users/${lane.user}`)).json()).reservations.length;
  await context.setOffline(true);
  await expect(banner).toContainText("You're offline");
  await page.getByTestId('reserve-seat').click();
  await expect(toaster).toContainText("You're offline");
  await expect(toaster).not.toContainText('Could not book');
  expect((await (await request.get(`${API}/users/${lane.user}`)).json()).reservations.length).toBe(before);

  // Reloading the visited pages offline shows the cached content and the banner.
  await page.goto('/speakers');
  await expect(page.getByTestId('speaker-count')).toHaveText(speakerCount);
  await expect(banner).toBeVisible();
  await page.goto(listPath);
  await waitForResults(page);
  await expect(firstCard().locator('h3').first()).toHaveText(onlineTitle);
  await expect(banner).toBeVisible();
  await shotForPR(page, 'the schedule opened offline, from the cache, under the offline banner');

  // Make the cached copy stale, reload offline to see it, then reconnect.
  await page.evaluate(async (title) => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        if (new URL(req.url).pathname !== '/api/sessions') continue;
        const list = await (await cache.match(req)).json();
        const hit = list.find((s) => s.title === title);
        if (!hit) continue;
        hit.title = 'STALE COPY';
        await cache.put(req, new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }));
      }
    }
  }, onlineTitle);
  await page.goto(listPath);
  await waitForResults(page);
  await expect(page.getByTestId('session-card').filter({ hasText: 'STALE COPY' })).toHaveCount(1);

  await context.setOffline(false);
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId('session-card').filter({ hasText: 'STALE COPY' })).toHaveCount(0);
  await expect(firstCard().locator('h3').first()).toHaveText(onlineTitle);
});
