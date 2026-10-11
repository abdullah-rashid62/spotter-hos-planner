import { test, expect } from '@playwright/test';

test('desktop preview connects itinerary, map, logs, validation and printing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A better plan. A smoother journey.' })).toBeVisible();
  await page.getByRole('button', { name: 'Overnight rest 5h 30m' }).click();
  await expect(page.locator('.map-selection')).toContainText('Chattanooga');
  await page.locator('.desktop-tabs').getByRole('button', { name: 'Daily logs' }).click();
  await expect(page.locator('.schedule-panel .log-selection')).toContainText('Overnight rest');
  await page.getByRole('button', { name: 'Day 2' }).click();
  await expect(page.locator('.schedule-panel .log-heading')).toContainText('Tuesday');
  await expect(page.locator('.schedule-panel .log-fields')).toContainText('118 mi');
  await page.getByLabel('Current cycle used').fill('71');
  await page.getByRole('button', { name: 'Generate trip plan' }).click();
  await expect(page.getByText('Enter a number between 0 and 70 hours.')).toBeVisible();
  await page.getByLabel('Current cycle used').fill('24');
  await page.getByRole('button', { name: 'Generate trip plan' }).click();
  await expect(page.getByText('Preview refreshed.', { exact: false })).toBeVisible();
  await page.screenshot({ path: '.preview/desktop.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-sheets')).toBeVisible();
  await expect(page.locator('.print-sheets .daily-log')).toHaveCount(2);
  await page.pdf({ path: '.preview/sample-logs.pdf', preferCSSPageSize: true, printBackground: true });
  expect(errors).toEqual([]);
});

test('mobile keeps views readable and confines horizontal scrolling to the log', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.map-section')).not.toBeVisible();
  await page.getByRole('button', { name: 'Edit trip' }).click();
  await expect(page.getByLabel('Current location')).toBeVisible();
  await page.getByRole('button', { name: 'Generate trip plan' }).click();
  await expect(page.getByText('Preview refreshed.', { exact: false })).toBeVisible();
  await expect(page.locator('.planner-panel')).not.toBeVisible();
  await page.screenshot({ path: '.preview/mobile.png', fullPage: true });
  await page.locator('.mobile-tabs').getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('.map-section')).toBeVisible();
  await page.getByRole('button', { name: 'Expand map', exact: true }).click();
  await expect(page.locator('.map-expanded')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-expanded')).toHaveCount(0);
  await page.locator('.mobile-tabs').getByRole('button', { name: 'Daily logs' }).click();
  await expect(page.locator('.schedule-panel .duty-graph')).toBeVisible();
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.viewport);
  await page.screenshot({ path: '.preview/mobile-logs.png', fullPage: true });
});

test('map tile failure preserves controls and explains the fallback', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByText('Map tiles unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fit entire route' })).toBeVisible();
  await page.getByRole('button', { name: 'Overnight rest 5h 30m' }).click();
  await expect(page.locator('.map-selection')).toContainText('Chattanooga');
});
