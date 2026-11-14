import { test, expect } from '@playwright/test';
import { visit, failOnPageErrors, shotForPR } from './helpers.js';

/**
 * Readable venue map (#18). Below `lg` the route map is drawn on its own phone
 * canvas; at `lg` and up the desktop canvas is unchanged. Read-only: no data
 * lane, no clock. One walk: phone widths on the mobile project, desktop guard
 * on the desktop project.
 */

test('venue map: readable on phones at 375 and 320, desktop canvas unchanged', async ({ page }, testInfo) => {
  const errors = failOnPageErrors(page);
  const mobile = testInfo.project.name === 'mobile';

  if (!mobile) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await visit(page, '/venues');
    const wide = page.getByTestId('venue-map-wide');
    await expect(wide).toBeVisible();
    await expect(wide).toHaveAttribute('viewBox', '0 0 900 290');
    await expect(page.getByTestId('venue-map-phone')).toBeHidden();
    const box = await wide.boundingBox();
    expect(Math.abs(box.height - (box.width * 290) / 900)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    return;
  }

  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 667 });
    await visit(page, '/venues');
    const map = page.getByTestId('venue-map-phone');
    await expect(map, `${width}px`).toBeVisible();
    await expect(page.getByTestId('venue-map-wide'), `${width}px`).toBeHidden();

    // tall enough, and inside the viewport
    const box = await map.boundingBox();
    if (width === 375) expect(box.height).toBeGreaterThanOrEqual(220);
    expect(box.x + box.width, `${width}px right edge`).toBeLessThanOrEqual(width);

    // every label renders at 12px or larger, and the expected labels exist
    const labels = await map.locator('text').evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent.trim(),
        px: parseFloat(getComputedStyle(el).fontSize) * el.getScreenCTM().a,
      })).filter((l) => l.text));
    const joined = labels.map((l) => l.text).join('|');
    expect(joined, `${width}px labels`).toMatch(/stages ·/);
    expect(joined).toContain('6.2 miles');
    expect(joined).toMatch(/min by /);
    expect(labels.length).toBeGreaterThanOrEqual(6);
    for (const l of labels) expect(l.px, `${width}px "${l.text}"`).toBeGreaterThanOrEqual(12);

    // no sideways scroll
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px overflow`).toBeLessThanOrEqual(1);

    if (width === 375) await shotForPR(page, 'the venue map readable at phone width');
  }
  expect(errors).toEqual([]);
});
