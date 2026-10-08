import { test, expect } from '@playwright/test';

test('hosted wireless pairing controls only its own station and renewing the link revokes the phone', async ({ page, browser, baseURL }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/practice'); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  await page.locator('#pair').click();
  await expect(page.locator('#connection-path')).toHaveValue('wireless');
  await expect(page.locator('#connection-path option')).toHaveCount(1);
  await expect(page.locator('#connect-usb')).toBeHidden(); await expect(page.locator('#qr')).toBeVisible();
  await expect(page.locator('#pair-instructions')).toContainText('Both devices need internet access');
  await expect(page.locator('#copy-pair-url')).toBeEnabled();
  const url = await page.locator('#pair-url').inputValue();
  expect(new URL(url).origin).toBe(baseURL); expect(new URL(url).pathname).toBe('/controller');
  await page.locator('#close-pair').click();
  const stationContext = await browser.newContext(), phoneContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  try {
    const second = await stationContext.newPage(); await second.goto(new URL('/practice', baseURL!).href);
    await expect(second.locator('#connection-status')).toContainText('Keyboard');
    await second.locator('#pair').click();
    const secondUrl = await second.locator('#pair-url').inputValue(); expect(secondUrl).not.toBe(url);
    await second.locator('#close-pair').click();
    const phone = await phoneContext.newPage(); phone.on('pageerror', (error) => errors.push(error.message));
    await phone.goto(url); await expect(phone.locator('#enable')).toBeEnabled();
    await phone.locator('#enable').click(); await expect(page.locator('#connection-status')).toContainText('ready');
    await phone.locator('#phone-takeoff').click();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
    await expect(second.locator('#flight-status')).toHaveAttribute('data-mode', 'grounded');
    await expect(second.locator('#source')).toHaveValue('keyboard');
    await page.locator('#pair').click(); await page.locator('#revoke').click();
    await expect(page.locator('#pair-url')).not.toHaveValue(url);
    await expect(page.locator('#pair-url')).not.toHaveValue('');
    await expect(phone.locator('#phone-message')).toContainText(/revoked/i);
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
    expect(errors).toEqual([]);
  } finally { await phoneContext.close(); await stationContext.close(); }
});

test('an unavailable relay leaves keyboard flight usable and offers a pairing retry', async ({ page }) => {
  await page.route('**/api/session', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'All practice stations are in use. Try again shortly.' }) }));
  await page.goto('/practice');
  await expect(page.locator('#connection-status')).toContainText('Keyboard · phone pairing unavailable');
  await expect(page.locator('.world-canvas')).toBeVisible();
  await page.locator('#takeoff').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', /taking-off|flying/);
  await page.locator('#pair').click();
  await expect(page.locator('#qr')).toBeHidden();
  await expect(page.locator('#pair-instructions')).toContainText('All practice stations are in use');
  await expect(page.locator('#revoke')).toHaveText('Retry pairing');
  await page.unroute('**/api/session'); await page.locator('#revoke').click();
  await expect(page.locator('#pair-url')).not.toHaveValue('');
  await expect(page.locator('#qr')).toBeVisible();
  await expect(page.locator('#connection-path')).toHaveValue('wireless');
  await expect(page.locator('#revoke')).toHaveText('Revoke phone & renew link');
});
