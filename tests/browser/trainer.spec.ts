import { test, expect } from '@playwright/test';

test('keyboard flight, two camera views, clean capture, pause and reset', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#connection-status')).toContainText('Keyboard');
  await expect(page.locator('.world-canvas')).toBeVisible();
  await page.locator('#pause').click(); await page.keyboard.press('t');
  await expect(page.locator('#flight-state')).toHaveText('FLYING', { timeout: 10_000 });
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(650); await page.keyboard.up('ArrowRight');
  await expect.poll(async () => Number((await page.locator('#speed').innerText()).split(' ')[0])).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await expect(page.locator('#speed')).toContainText('0.0');
  await page.keyboard.down('f'); await page.waitForTimeout(250); await page.keyboard.up('f');
  await expect(page.locator('#gimbal-value')).not.toContainText('-12');
  await page.locator('#capture').click();
  await expect(page.locator('#photos img')).toHaveCount(1);
  const image = page.locator('#photos img');
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1280);
  await expect(page.locator('#camera-view')).not.toHaveClass(/flash/);
  await page.screenshot({ path: 'test-results/simulator.png', fullPage: true });
  const downloadPromise = page.waitForEvent('download'); await page.locator('.photo-thumb').click();
  const download = await downloadPromise; await download.saveAs('test-results/camera-photo.png');
  await page.locator('#pause').click(); await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.locator('#reset').click(); await expect(page.locator('#flight-state')).toHaveText('GROUNDED');
  await expect(page.locator('#altitude')).toContainText('0.0');
  expect(errors).toEqual([]);
});

test('phone pairing, simultaneous sticks, release, cancellation and disconnect pause', async ({ page, browser }) => {
  await page.goto('/'); await page.locator('#pair').click();
  await expect(page.locator('#pair-url')).not.toHaveValue('');
  const url = await page.locator('#pair-url').inputValue(); await page.locator('#close-pair').click();
  const phoneContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const phone = await phoneContext.newPage();
  await phone.goto(url); await expect(phone.locator('#enable')).toBeEnabled();
  await phone.locator('#enable').click(); await expect(page.locator('#connection-status')).toContainText('ready');
  await page.locator('#pause').click(); await expect(phone.locator('#phone-takeoff')).toBeEnabled();
  await phone.locator('#phone-takeoff').click(); await expect(page.locator('#flight-state')).toHaveText('FLYING', { timeout: 10_000 });
  const left = await phone.locator('#left-stick').boundingBox(), right = await phone.locator('#right-stick').boundingBox();
  if (!left || !right) throw new Error('Stick bounds unavailable');
  const cdp = await phoneContext.newCDPSession(phone);
  const points = [
    { id: 1, x: left.x + left.width / 2, y: left.y + left.height * 0.3 },
    { id: 2, x: right.x + right.width * 0.7, y: right.y + right.height / 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await expect(phone.locator('#left-value')).not.toHaveText('YAW 0% · CLIMB 0%');
  await expect(phone.locator('#right-value')).not.toHaveText('RIGHT 0% · FORWARD 0%');
  await phone.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(phone.locator('#left-value')).toHaveText('YAW 0% · CLIMB 0%');
  await expect(phone.locator('#right-value')).toHaveText('RIGHT 0% · FORWARD 0%');
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[1]] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(phone.locator('#right-value')).toHaveText('RIGHT 0% · FORWARD 0%');
  await phone.screenshot({ path: 'test-results/controller.png', fullPage: true });
  await phoneContext.close();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect(page.locator('#pause-reason')).toContainText(/Phone|Controller/i);
});

test('hidden laptop pauses flight and camera-only mode stays usable', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  await page.locator('#pause').click();
  await page.locator('#camera-only').check(); await expect(page.locator('#observer-view')).toBeHidden();
  await expect(page.locator('#camera-view')).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#pause')).toContainText('Start');
  await expect(page.locator('#capture')).toBeDisabled();
});
