import { test, expect } from '@playwright/test';
import { neutralControls, type Controls } from '../../shared/protocol';

test('phone stick modes send the DJI axis commands and switching clears held input', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await page.goto('/'); await page.locator('#pair').click();
  await expect(page.locator('#pair-url')).not.toHaveValue('');
  const url = await page.locator('#pair-url').inputValue(); await page.locator('#close-pair').click();
  const phoneContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  try {
    const phone = await phoneContext.newPage(), errors: string[] = [], inputs: Controls[] = [];
    phone.on('pageerror', error => errors.push(error.message));
    phone.on('websocket', socket => socket.on('framesent', frame => {
      const message = JSON.parse(String(frame.payload));
      if (message.type === 'input') inputs.push(message.controls);
    }));
    await phone.goto(url); await expect(phone.locator('#enable')).toBeEnabled();
    await expect(phone.getByRole('combobox', { name: 'Stick mode', exact: true })).toHaveValue('2');
    const cdp = await phoneContext.newCDPSession(phone);
    const layouts = [
      { mode: '2', left: ['yaw', 'climb'], right: ['right', 'forward'], labels: ['Throttle · Yaw', 'Pitch · Roll'] },
      { mode: '1', left: ['yaw', 'forward'], right: ['right', 'climb'], labels: ['Pitch · Yaw', 'Throttle · Roll'] },
      { mode: '3', left: ['right', 'forward'], right: ['yaw', 'climb'], labels: ['Pitch · Roll', 'Throttle · Yaw'] },
    ] as const;
    for (const layout of layouts) {
      await phone.locator('#stick-mode').selectOption(layout.mode);
      await expect(phone.locator('#left-axes')).toHaveText(layout.labels[0]);
      await expect(phone.locator('#right-axes')).toHaveText(layout.labels[1]);
      await expect(phone.locator('#enable')).toHaveText('Enable controls');
      await phone.locator('#enable').click(); await expect(phone.locator('#phone-connection')).toHaveText('Controls ready');
      for (const side of ['left', 'right'] as const) {
        const rect = (await phone.locator(`#${side}-stick`).boundingBox())!;
        for (const [index, axis] of layout[side].entries()) {
          for (const sign of [1, -1]) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1,
              x: rect.x + rect.width * (index === 0 ? 0.5 + sign * 0.36 : 0.5),
              y: rect.y + rect.height * (index === 1 ? 0.5 - sign * 0.36 : 0.5),
            }] });
            await expect.poll(() => {
              const input = inputs.at(-1);
              return input && Object.entries(input).every(([key, value]) => Math.abs(value - (key === axis ? sign : 0)) < 0.001);
            }).toBe(true);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await expect.poll(() => inputs.at(-1)).toEqual(neutralControls());
          }
        }
      }
      await phone.screenshot({ path: `test-results/controller-mode-${layout.mode}.png` });
      if (layout.mode !== '3') {
        await phone.locator('#enable').click(); await expect(phone.locator('#phone-connection')).toHaveText('Controls paused');
      }
    }
    await phone.locator('#phone-takeoff').click();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
    const left = (await phone.locator('#left-stick').boundingBox())!, right = (await phone.locator('#right-stick').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { id: 1, x: left.x + left.width * 0.7, y: left.y + left.height * 0.3 },
      { id: 2, x: right.x + right.width * 0.7, y: right.y + right.height * 0.3 },
    ] });
    await expect.poll(() => inputs.at(-1)?.climb ?? 0).toBeGreaterThan(0);
    // Change the select while both stick pointer captures are still active.
    await phone.locator('#stick-mode').selectOption('1');
    await expect(phone.locator('#enable')).toHaveText('Enable controls');
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
    await expect(phone.locator('#left-value')).toHaveText('YAW 0% · PITCH 0%');
    await expect(phone.locator('#right-value')).toHaveText('ROLL 0% · THROTTLE 0%');
    expect(inputs.at(-1)).toEqual(neutralControls());
    for (const side of ['left', 'right']) await expect(phone.locator(`#${side}-knob`)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await phone.reload(); await expect(phone.locator('#enable')).toBeEnabled();
    await expect(phone.locator('#stick-mode')).toHaveValue('1');
    await expect(phone.locator('#left-axes')).toHaveText('Pitch · Yaw');
    await phone.locator('#enable').click(); await expect(phone.locator('#phone-connection')).toHaveText('Controls ready');
    await expect.poll(() => inputs.at(-1)).toEqual(neutralControls());
    expect(errors).toEqual([]);
  } finally { await phoneContext.close(); }
});

test('controller layouts fit landscape phones and pairing-free previews still change modes', async ({ page }) => {
  await page.goto('/controller');
  await expect(page.locator('#phone-connection')).toHaveText('Pairing needed');
  await page.locator('#stick-mode').selectOption('3');
  await expect(page.locator('#left-axes')).toHaveText('Pitch · Roll');
  await expect(page.locator('#right-axes')).toHaveText('Throttle · Yaw');
  for (const [width, height] of [[844, 390], [667, 375], [568, 320]]) {
    await page.setViewportSize({ width, height });
    for (const size of ['normal', 'small', 'large']) {
      await page.locator('#stick-size').selectOption(size);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
      const center = (await page.locator('.controller-center').boundingBox())!;
      const left = (await page.locator('#left-stick').boundingBox())!, right = (await page.locator('#right-stick').boundingBox())!;
      expect(left.x + left.width).toBeLessThan(center.x);
      expect(right.x).toBeGreaterThan(center.x + center.width);
    }
    await page.screenshot({ path: `test-results/controller-${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.rotate-hint')).toBeVisible();
  await expect(page.locator('#stick-mode')).toBeVisible();
  await page.locator('#stick-mode').selectOption('2');
  await expect(page.locator('#left-axes')).toHaveText('Throttle · Yaw');
});

test('paused flights prompt on the phone and resume there while respecting laptop blockers', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await page.goto('/'); await page.locator('#pair').click();
  await expect(page.locator('#pair-url')).not.toHaveValue('');
  const url = await page.locator('#pair-url').inputValue(); await page.locator('#close-pair').click();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  try {
    const phone = await context.newPage(), errors: string[] = [];
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(url); await expect(phone.locator('#enable')).toBeEnabled();
    await expect(phone.locator('#phone-pause-prompt')).toBeHidden();
    await phone.locator('#enable').click(); await phone.locator('#phone-takeoff').click();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
    await page.locator('#pause').click();
    await expect(phone.locator('#phone-pause-title')).toHaveText('Game paused');
    await expect(phone.locator('#phone-resume-hint')).toContainText('enable controls');
    await expect(phone.getByRole('button', { name: 'Resume game' })).toBeDisabled();
    await phone.setViewportSize({ width: 568, height: 320 });
    expect(await phone.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(320);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(568);
    await phone.locator('#enable').click();
    await expect(phone.getByRole('button', { name: 'Resume game' })).toBeEnabled();
    await expect(phone.locator('#phone-resume-hint')).toHaveText('Tap Resume game to continue.');
    await phone.screenshot({ path: 'test-results/controller-paused.png' });
    // Resume with a held stick: the request must neutralize it first.
    const cdp = await context.newCDPSession(phone), stick = (await phone.locator('#left-stick').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: stick.x + stick.width * 0.86, y: stick.y + stick.height / 2 }] });
    await expect(phone.locator('#left-value')).toContainText('YAW 100%');
    await phone.locator('#phone-resume').click();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'false');
    await expect(phone.locator('#phone-pause-prompt')).toBeHidden();
    await expect(phone.locator('#left-value')).toHaveText('YAW 0% · THROTTLE 0%');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(phone.locator('#phone-capture')).toBeEnabled();
    await phone.locator('#enable').click();
    await expect(phone.locator('#phone-pause-title')).toHaveText('Game paused');
    await phone.locator('#enable').click(); await phone.locator('#phone-resume').click();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'false');
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    await expect(phone.locator('#phone-pause-prompt')).toBeVisible();
    await phone.locator('#enable').click(); await phone.locator('#phone-resume').click();
    await expect(phone.locator('#phone-resume-hint')).toContainText('Close the open dialog');
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
    await expect(phone.locator('#phone-resume')).toBeEnabled();
    await page.locator('#close-guide').click(); await phone.locator('#phone-resume').click();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'false');
    await expect(phone.locator('#phone-pause-prompt')).toBeHidden();
    const left = (await phone.locator('#left-stick').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: left.x + left.width / 2, y: left.y + left.height * 0.86 }] });
    await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'collided', { timeout: 10_000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(phone.locator('#phone-pause-title')).toHaveText('Flight stopped');
    await expect(phone.locator('#phone-resume-hint')).toHaveText('Reset the flight on the laptop to continue.');
    await expect(phone.locator('#phone-resume')).toBeHidden();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
