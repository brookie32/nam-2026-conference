import { test, expect } from '@playwright/test';
import { visit, failOnPageErrors, shotForPR } from './helpers.js';

/**
 * Bottom tab bar (#4): below `lg` every page inside <Layout> has a fixed
 * four-tab bar; at `lg` and up there is none. Read-only, so no data lane.
 */

const ROUTES = [
  '/', '/schedule', '/speakers', '/my-agenda', '/venues', '/food', '/expo',
  '/code-of-conduct', '/accessibility', '/sessions/1', '/speakers/1', '/definitely-not-a-page',
];
const TABS = [
  { name: 'Home', path: '/' },
  { name: 'Schedule', path: '/schedule' },
  { name: 'My Agenda', path: '/my-agenda' },
  { name: 'Venues', path: '/venues' },
];

test('phone: every page has the four-tab bar, clear of the footer, with 44px tabs', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone layout');
  const errors = failOnPageErrors(page);
  await page.setViewportSize({ width: 375, height: 667 });

  for (const path of ROUTES) {
    await visit(page, path);
    const bar = page.getByRole('navigation', { name: 'Tabs' });
    await expect(bar, path).toBeVisible();
    const links = bar.getByRole('link');
    await expect(links, path).toHaveCount(4);
    for (const [i, tab] of TABS.entries()) {
      await expect(links.nth(i), path).toHaveText(new RegExp(`^\\d*\\s*${tab.name}$`));
      const box = await links.nth(i).boundingBox();
      expect(box.height, `${path} ${tab.name} height`).toBeGreaterThanOrEqual(44);
    }

    // Scrolled to the end, the footer's last line ends above the bar.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const last = await page.getByRole('contentinfo').locator('p').last().boundingBox();
    const barBox = await bar.boundingBox();
    expect(last.y + last.height, `${path} footer hidden behind bar`).toBeLessThanOrEqual(barBox.y);
  }

  // The count badge matches the menu's.
  await visit(page, '/food');
  await page.getByRole('button', { name: 'Open menu' }).click();
  const menuText = await page.getByRole('navigation', { name: 'Mobile' })
    .getByRole('link', { name: /My Agenda/ }).innerText();
  const count = menuText.replace(/\D/g, '');
  expect(Number(count)).toBeGreaterThan(0);
  await expect(page.getByRole('navigation', { name: 'Tabs' }).getByRole('link', { name: /My Agenda/ }))
    .toHaveText(new RegExp(`^${count}\\s*My Agenda$`));
  await page.getByRole('button', { name: 'Close menu' }).click();

  // Tapping each tab navigates and marks only it current.
  const bar = page.getByRole('navigation', { name: 'Tabs' });
  for (const tab of TABS) {
    await bar.getByRole('link', { name: new RegExp(`^\\d*\\s*${tab.name}$`) }).click();
    await expect(page).toHaveURL(new RegExp(`${tab.path === '/' ? '/$' : tab.path + '$'}`));
    await expect(bar.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(bar.getByRole('link', { name: new RegExp(`^\\d*\\s*${tab.name}$`) })).toHaveAttribute('aria-current', 'page');
  }
  await shotForPR(page, 'Bottom tab bar on a phone');

  expect(errors).toEqual([]);
});

test('lg and up: no tab bar, the main nav stays', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop layout');
  for (const [width, height] of [[1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await visit(page, '/schedule');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Tabs' })).toBeHidden();
  }
  // Paired with the phone test: the bar exists below lg.
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.getByRole('navigation', { name: 'Tabs' })).toBeVisible();
});
