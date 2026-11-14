import { test, expect } from '@playwright/test';
import { visit, failOnPageErrors, ATTENDEES, shotForPR } from './helpers.js';

test('9 opens the release notes anywhere, never while typing, and it fits a phone', async ({ page }) => {
  failOnPageErrors(page);
  const dialog = page.getByTestId('release-notes');

  for (const path of ['/', '/schedule', '/my-agenda']) {
    await visit(page, path, { as: ATTENDEES.jonas });
    await page.keyboard.press('9');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h3')).toHaveCount(6);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press('9');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('9');
    await expect(dialog).toHaveCount(0);
  }

  // Focus returns to what had it.
  await visit(page, '/schedule');
  const search = page.getByRole('searchbox').first();
  await search.focus();
  await search.press('9');
  await expect(search).toHaveValue('9');
  await expect(dialog).toHaveCount(0);
  await search.evaluate((el) => el.blur());
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await skip.focus();
  await page.keyboard.press('9');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(skip).toBeFocused();

  // Ask ORBIT input.
  await page.getByTestId('ask-launcher').click();
  const ask = page.getByTestId('ask-input');
  await ask.fill('');
  await ask.press('9');
  await expect(ask).toHaveValue('9');
  await expect(dialog).toHaveCount(0);

  // Links, and the fit.
  await visit(page, '/');
  await page.keyboard.press('9');
  await shotForPR(page, 'The release notes dialog');
  const hrefs = await dialog.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThanOrEqual(27);
  for (const h of hrefs) expect(h).toMatch(/^https:\/\/github\.com\/brookie32\/nam-2026-conference\/issues\/\d+$/);
  await expect(dialog.getByRole('link', { name: '#13' })).toHaveAttribute('href', /issues\/13$/);

  await page.setViewportSize({ width: 375, height: 667 });
  const m = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="release-notes-panel"]');
    return { dw: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pw: p.scrollWidth - p.clientWidth, ph: p.getBoundingClientRect().height, vh: window.innerHeight };
  });
  expect(m.dw).toBeLessThanOrEqual(0);
  expect(m.pw).toBeLessThanOrEqual(0);
  expect(m.ph).toBeLessThanOrEqual(m.vh * 0.85 + 1);
  await dialog.getByRole('link', { name: '#19' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('link', { name: '#19' })).toBeInViewport();
});
