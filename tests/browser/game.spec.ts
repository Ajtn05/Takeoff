import { test, expect } from '@playwright/test';

test('landing menu opens either mode and both modes return to the menu', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Where will you take it?' })).toBeVisible();
  await page.screenshot({ path: 'test-results/menu-desktop.png', fullPage: true });
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('link', { name: 'Play game', exact: true }).click();
  await expect(page).toHaveURL('/game'); await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('#game-stage > canvas')).toBeVisible(); await expect(page.locator('#game-camera')).toBeVisible();
  await page.getByRole('link', { name: 'Takeoff main menu', exact: true }).click();
  await page.getByRole('link', { name: 'Open practice tool', exact: true }).click();
  await expect(page).toHaveURL('/practice'); await expect(page.locator('#map')).toHaveValue('park');
  await page.getByRole('link', { name: 'Takeoff main menu', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Play game', exact: true })).toBeVisible(); expect(errors).toEqual([]);
});

test('runs score, pause without advancing, bank a result, retry, and remember the best score', async ({ page }) => {
  test.setTimeout(45_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/game'); await page.locator('#game-start').click();
  await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'takeoff');
  await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'running', { timeout: 12_000 });
  await expect.poll(async () => Number(await page.locator('#game-score').textContent())).toBeGreaterThan(5);
  await page.keyboard.down('ArrowUp');
  await expect(page.locator('#game-requirement')).toContainText('MOVE REGISTERED');
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: 'test-results/game-running.png', fullPage: true });
  await page.keyboard.press('Space'); await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'paused');
  await expect(async () => {
    const score = await page.locator('#game-score').textContent();
    await page.waitForTimeout(400); expect(await page.locator('#game-score').textContent()).toBe(score);
  }).toPass();
  await page.locator('#game-start').click(); await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'running');
  await page.keyboard.press('KeyL'); await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'over');
  const score = await page.locator('#game-score').textContent(); expect(Number(score)).toBeGreaterThan(5);
  await expect(page.locator('#game-results')).toBeVisible(); await expect(page.locator('#game-prompt-eyebrow')).toHaveText('NEW PERSONAL BEST');
  await page.locator('#game-start').click(); await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'takeoff');
  await page.locator('#game-retry').click(); await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('#game-score')).toHaveText('0'); await expect(page.locator('#game-best')).toHaveText(score!);
  await page.reload(); await expect(page.locator('#game-best')).toHaveText(score!);
  await page.screenshot({ path: 'test-results/game-ready.png', fullPage: true }); expect(errors).toEqual([]);
});

test('game guide pauses flight and layouts fit a narrow screen', async ({ page }) => {
  await page.goto('/game'); await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('#game-start')).toBeVisible();
  await page.locator('#game-guide').click(); await expect(page.locator('#game-guide-dialog')).toBeVisible();
  await page.locator('#game-guide-close').click(); await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('#game-start')).toBeEnabled();
  await page.screenshot({ path: 'test-results/game-mobile.png', fullPage: true });
  await page.locator('#game-fullscreen').click(); await expect(page.locator('.rush-game')).toHaveClass(/rush-fullscreen/);
  await expect(page.locator('#game-instrument-tilt')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const stage = (await page.locator('#game-stage').boundingBox())!;
  expect(stage.y + stage.height).toBeLessThanOrEqual(844);
  await page.locator('#game-fullscreen').click();
  await page.goto('/'); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('link', { name: 'Open practice tool', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/menu-mobile.png', fullPage: true });
});

test('phone uses the existing sticks to launch, pause, and resume a game run', async ({ page, browser }) => {
  test.setTimeout(45_000);
  await page.goto('/game'); await page.locator('#pair').click(); await expect(page.locator('#pair-url')).not.toHaveValue('');
  const url = await page.locator('#pair-url').inputValue(); await page.locator('#close-pair').click();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  try {
    const phone = await context.newPage(); await phone.goto(url); await expect(phone.locator('#enable')).toBeEnabled();
    await expect(page.locator('#source')).toHaveValue('phone'); await expect(page.locator('#game-start')).toBeDisabled();
    await phone.locator('#enable').click(); await expect(phone.locator('#phone-takeoff')).toBeEnabled(); await phone.locator('#phone-takeoff').click();
    await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'running', { timeout: 12_000 });
    const cdp = await context.newCDPSession(phone), stick = (await phone.locator('#right-stick').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height * 0.15 }] });
    await expect(page.locator('#game-requirement')).toContainText('MOVE REGISTERED');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.locator('#game-pause').click(); await expect(phone.locator('#phone-pause-prompt')).toBeVisible();
    await expect(page.locator('#game-start')).toBeDisabled(); await phone.locator('#enable').click();
    await expect(phone.locator('#phone-resume')).toBeEnabled(); await phone.locator('#phone-resume').click();
    await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'running');
    await page.locator('#game-guide').click(); await phone.locator('#enable').click(); await phone.locator('#phone-resume').click();
    await expect(phone.locator('#phone-resume-hint')).toContainText('Close the open dialog');
    await page.locator('#game-guide-close').click(); await phone.locator('#phone-resume').click();
    await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'running');
  } finally { await context.close(); }
});
