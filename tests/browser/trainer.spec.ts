import { test, expect } from '@playwright/test';

test('park routes launch, count flown hoops, reset, and remain usable in fullscreen and on mobile', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/practice'); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  const routes = page.getByRole('combobox', { name: 'Choose a practice route' });
  await expect(routes).toBeVisible(); await expect(page.locator('#photo-spot option')).toHaveCount(4);
  await expect(page.locator('#course-progress')).toBeHidden();
  await page.locator('#flight-speed').selectOption('5');
  await routes.selectOption('hoop-slalom');
  await expect(page.locator('#course-name')).toHaveText('Hoop slalom');
  await expect(page.locator('#course-count')).toHaveText('0 / 7');
  await expect(page.locator('#observer-mode')).toHaveValue('follow');
  await page.locator('#takeoff').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
  await page.keyboard.down('ArrowUp');
  await expect(page.locator('#course-count')).toHaveText('1 / 7', { timeout: 8_000 });
  await page.keyboard.up('ArrowUp');
  await expect(page.locator('#course-next')).toContainText('Next: 02');
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying');
  await page.locator('#pause').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
  await page.mouse.move(0, 0);
  await page.screenshot({ style: '#toast { visibility: hidden; }', path: 'test-results/park-hoop-slalom.png', fullPage: true });
  await page.locator('#reset').click();
  await expect(page.locator('#course-count')).toHaveText('0 / 7');
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'grounded');
  for (const [id, name, count] of [['window-gaps', 'Window gaps', '0 / 5'], ['tight-corridor', 'Tight corridor', '0 / 6']]) {
    await routes.selectOption(id);
    await expect(page.locator('#course-name')).toHaveText(name); await expect(page.locator('#course-count')).toHaveText(count);
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
    await page.locator('#takeoff').click();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
    await page.locator('#pause').click();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
    await page.mouse.move(0, 0);
    await page.screenshot({ style: '#toast { visibility: hidden; }', path: `test-results/park-${id}.png`, fullPage: true });
  }
  await page.locator('#simulator-fullscreen').click();
  await expect(page.locator('#course-progress')).toBeVisible();
  await page.locator('#simulator-fullscreen').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(routes).toBeVisible(); await expect(page.locator('#course-progress')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ style: '#toast { visibility: hidden; }', path: 'test-results/park-route-mobile.png', fullPage: true });
  await page.locator('#simulator-fullscreen').click();
  const progress = (await page.locator('#course-progress').boundingBox())!, camera = (await page.locator('#camera-column').boundingBox())!;
  expect(progress.y).toBeGreaterThan(camera.y + camera.height);
  await page.screenshot({ style: '#toast { visibility: hidden; }', path: 'test-results/park-route-mobile-fullscreen.png' });
  await page.locator('#simulator-fullscreen').click();
  await routes.selectOption('sculpture'); await expect(page.locator('#course-progress')).toBeHidden();
  await page.locator('#observer-mode').selectOption('overview');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('button', { name: 'Observer only', exact: true }).click();
  await page.mouse.move(0, 0);
  await page.screenshot({ style: '#toast { visibility: hidden; }', path: 'test-results/park-courses-overview.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('campus trees toggle immediately and the preference survives location changes and reloads', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/practice'); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  const trees=page.getByRole('button',{name:'Campus trees',exact:true});
  await expect(trees).toBeHidden();
  await page.locator('#map').selectOption('ateneo'); await expect(page.locator('#photo-spot')).toBeEnabled();
  await expect(trees).toBeVisible(); await expect(trees).toHaveAttribute('aria-pressed','true');
  await page.locator('#photo-spot').selectOption('25766555');
  await page.locator('#observer-mode').selectOption('fixed');
  await page.locator('#panel-collapse').click(); await page.locator('#aids').click();
  await page.screenshot({path:'test-results/ateneo-trees-optimized.png',fullPage:true});
  await trees.click(); await expect(trees).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>localStorage.getItem('trainer-trees-visible'))).toBe('false');
  await page.screenshot({path:'test-results/ateneo-trees-off.png',fullPage:true});
  await page.locator('#photo-spot').selectOption('1363092068');
  await expect(trees).toHaveAttribute('aria-pressed','false');
  await page.locator('#map').selectOption('park'); await expect(trees).toBeHidden();
  await page.locator('#map').selectOption('ateneo'); await expect(trees).toHaveAttribute('aria-pressed','false');
  await page.reload(); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  await page.locator('#map').selectOption('ateneo'); await expect(trees).toHaveAttribute('aria-pressed','false');
  await trees.click(); await expect(trees).toHaveAttribute('aria-pressed','true');
  await page.locator('#quality').click(); await expect(page.locator('#quality')).toHaveAttribute('aria-pressed','true');
  await page.locator('#quality').click(); await expect(page.locator('#quality')).toHaveAttribute('aria-pressed','false');
  expect(errors).toEqual([]);
});

test('campus spots switch cleanly and preserve photos', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/practice'); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  await expect(page.getByRole('button', { name: 'Guide', exact: true })).toBeVisible();
  await expect(page.locator('#guide-dialog')).not.toBeVisible();
  await expect(page.locator('.photo-library')).toBeVisible();
  await page.locator('#map').selectOption('ateneo'); await expect(page.locator('#photo-spot')).toBeEnabled();
  await expect(page.locator('#photo-spot option')).toHaveCount(10);
  await page.locator('#observer-mode').selectOption('overview'); await expect(page.locator('.world-canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/ateneo-overview.png', fullPage: true });
  await page.locator('#observer-mode').selectOption('follow');
  await expect(page.locator('#flight-speed')).toHaveValue('20');
  await page.locator('#flight-speed').selectOption('5');
  await page.locator('#takeoff').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
  // Stay in the open flight corridor below the raised acacia branches.
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  await page.waitForTimeout(800);
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying');
  await page.locator('#capture').click(); await expect(page.locator('#photos img')).toHaveCount(1);
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'false');
  await expect(page.locator('#camera-view')).not.toHaveClass(/flash/);
  await page.screenshot({ path: 'test-results/ateneo-architecture.png', fullPage: true });
  await page.locator('#land').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'grounded', { timeout: 20_000 });
  await expect(page.locator('#altitude')).toContainText('0.0');
  await page.locator('#flight-speed').selectOption('20');
  for (const site of ['568930822', '160456354', '24911828', '25850724', '25766486', '25766779', '1363092068', '25766701', '25766555']) {
    await page.locator('#photo-spot').selectOption(site);
    await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'grounded');
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true'); await expect(page.locator('#altitude')).toContainText('0.0');
  }
  await page.locator('#observer-mode').selectOption('fixed');
  await page.locator('#panel-collapse').click();
  await page.locator('#aids').click();
  await page.screenshot({ path: 'test-results/ateneo-acacias-and-halls.png', fullPage: true });
  await page.screenshot({ path: 'test-results/ateneo-flight.png', fullPage: true });
  await page.locator('#map').selectOption('park'); await expect(page.getByRole('combobox', { name: 'Choose a practice route' })).toBeVisible();
  await expect(page.locator('#photo-spot option')).toHaveCount(4); await expect(page.locator('#course-progress')).toBeHidden();
  await expect(page.locator('#map-boundary')).toContainText('240 × 240'); await expect(page.locator('#photos img')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('keyboard flight, two camera views, clean capture, pause and reset', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/practice');
  await expect(page.locator('#connection-status')).toContainText('Keyboard');
  await expect(page.locator('.world-canvas')).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(650); await page.keyboard.up('ArrowRight');
  await expect.poll(async () => parseFloat(await page.locator('#speed').innerText())).toBeGreaterThan(0);
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
  await page.locator('#pause').click(); await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
  await page.locator('#reset').click(); await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'grounded');
  await expect(page.locator('#altitude')).toContainText('0.0');
  expect(errors).toEqual([]);
});

test('phone pairing, simultaneous sticks, release, cancellation and disconnect pause', async ({ page, browser }) => {
  await page.goto('/practice'); await page.locator('#pair').click();
  await expect(page.locator('#pair-url')).not.toHaveValue('');
  const url = await page.locator('#pair-url').inputValue(); await page.locator('#close-pair').click();
  const phoneContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const phone = await phoneContext.newPage();
  await phone.goto(url); await expect(phone.locator('#enable')).toBeEnabled();
  await expect(phone.locator('#phone-takeoff')).toBeDisabled();
  await phone.locator('#enable').click(); await expect(page.locator('#connection-status')).toContainText('ready');
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
  await expect(phone.locator('#phone-takeoff')).toBeEnabled(); await expect(page.locator('#takeoff')).toBeEnabled();
  await expect(phone.locator('#phone-land')).toBeDisabled(); await expect(phone.locator('#phone-capture')).toBeDisabled();
  await phone.locator('#phone-takeoff').click(); await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
  await expect(phone.locator('#phone-takeoff')).toBeDisabled();
  const left = await phone.locator('#left-stick').boundingBox(), right = await phone.locator('#right-stick').boundingBox();
  if (!left || !right) throw new Error('Stick bounds unavailable');
  const cdp = await phoneContext.newCDPSession(phone);
  const points = [
    { id: 1, x: left.x + left.width / 2, y: left.y + left.height * 0.3 },
    { id: 2, x: right.x + right.width * 0.7, y: right.y + right.height / 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await expect(phone.locator('#left-value')).not.toHaveText('YAW 0% · THROTTLE 0%');
  await expect(phone.locator('#right-value')).not.toHaveText('ROLL 0% · PITCH 0%');
  await phone.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(phone.locator('#left-value')).toHaveText('YAW 0% · THROTTLE 0%');
  await expect(phone.locator('#right-value')).toHaveText('ROLL 0% · PITCH 0%');
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'false');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[1]] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(phone.locator('#right-value')).toHaveText('ROLL 0% · PITCH 0%');
  await phone.screenshot({ path: 'test-results/controller.png', fullPage: true });
  await phoneContext.close();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('#pause-reason')).toContainText(/Phone|Controller/i);
});

test('phone takeoff is gated by readiness and works from desktop after landing and reset', async ({ page, browser }) => {
  test.setTimeout(45_000);
  await page.goto('/practice'); await page.locator('#pair').click();
  await expect(page.locator('#pair-url')).not.toHaveValue('');
  const url = await page.locator('#pair-url').inputValue(); await page.locator('#close-pair').click();
  const phoneContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const phone = await phoneContext.newPage();
  await phone.goto(url); await expect(phone.locator('#enable')).toBeEnabled();
  await expect(page.locator('#takeoff')).toBeDisabled();
  await phone.locator('#enable').click(); await expect(phone.locator('#phone-takeoff')).toBeEnabled();
  await phone.locator('#enable').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('#takeoff')).toBeDisabled(); await expect(phone.locator('#phone-takeoff')).toBeDisabled();
  await phone.locator('#enable').click(); await expect(page.locator('#takeoff')).toBeEnabled();
  await page.locator('#takeoff').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
  await expect(phone.locator('#phone-land')).toBeEnabled(); await phone.locator('#phone-land').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'grounded', { timeout: 10_000 });
  await expect(phone.locator('#phone-takeoff')).toBeEnabled();
  await page.locator('#reset').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('#takeoff')).toBeDisabled(); await expect(phone.locator('#phone-takeoff')).toBeDisabled();
  await phone.locator('#enable').click(); await expect(phone.locator('#phone-takeoff')).toBeEnabled();
  await phone.locator('#phone-takeoff').click();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'false');
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', /taking-off|flying/);
  await phoneContext.close();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
});

test('hidden laptop pauses flight and camera-only mode stays usable', async ({ page }) => {
  await page.goto('/practice'); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  await page.locator('#pause').click();
  await page.getByRole('button', { name: 'Camera only', exact: true }).click(); await expect(page.locator('#observer-view')).toBeHidden();
  await expect(page.locator('#camera-view')).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#pause')).toHaveAttribute('aria-label', 'Start practice');
  await expect(page.locator('#capture')).toBeDisabled();
  await expect(page.locator('#takeoff')).toBeDisabled();
  await page.keyboard.press('t'); await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'grounded');
});

test('workspace layouts resize, instruments stay docked and preferences persist', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('trainer-workspace-v1')) localStorage.setItem('trainer-workspace-v1', JSON.stringify({ panelX: 1, panelY: 0 }));
  });
  await page.goto('/practice'); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  await expect(page.locator('.station-brand')).toHaveText('TAKEOFF');
  await expect(page.getByText('Paused', { exact: true })).toHaveCount(1);
  await expect(page.locator('#stage')).not.toContainText('Paused');
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset flight', exact: true }).hover();
  expect(await page.locator('#reset').evaluate((button) => getComputedStyle(button, '::after').visibility)).toBe('visible');
  const grid = page.getByRole('button', { name: 'Thirds grid', exact: true });
  await grid.click(); await expect(page.locator('#thirds')).toBeHidden(); await expect(grid).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space'); await expect(page.locator('#thirds')).toBeVisible();
  await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
  const stage = page.locator('#stage'), divider = page.getByRole('separator'), panel = page.getByRole('region', { name: 'Flight parameters', exact: true });
  await expect(stage).toHaveAttribute('data-layout', 'split');
  const initialObserver = (await page.locator('#observer-view').boundingBox())!;
  const stageBox = (await stage.boundingBox())!, dividerBox = (await divider.boundingBox())!;
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down(); await page.mouse.move(stageBox.x + stageBox.width * .45, dividerBox.y + dividerBox.height / 2); await page.mouse.up();
  expect((await page.locator('#observer-view').boundingBox())!.width).toBeLessThan(initialObserver.width);
  await divider.focus(); await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '47');
  const cameraBox = (await page.locator('#camera-view').boundingBox())!;
  expect(cameraBox.width / cameraBox.height).toBeCloseTo(16 / 9, 2);
  await expect(page.locator('#panel-handle')).toHaveCount(0);
  const initialPanel = (await panel.boundingBox())!;
  expect(initialPanel.x).toBeCloseTo(stageBox.x + 1, 0);
  expect(initialPanel.width).toBeCloseTo(stageBox.width - 2, 0);
  expect(initialPanel.y + initialPanel.height).toBeCloseTo(stageBox.y + stageBox.height - 1, 0);
  await page.locator('#panel-glass').click(); await expect(panel).not.toHaveClass(/is-glass/);
  await page.keyboard.press('Space'); await expect(panel).toHaveClass(/is-glass/);
  await expect(page.locator('#pause')).toHaveAttribute('aria-label', 'Start practice');
  await page.locator('#panel-glass').click();
  await page.locator('#panel-collapse').click(); await expect(page.locator('#flight-panel-body')).toBeHidden();
  await expect(page.locator('#altitude')).toBeVisible(); await expect(page.locator('#speed')).toBeVisible(); await expect(page.locator('#heading')).toBeVisible();
  await expect(page.locator('#gimbal-value')).toBeHidden();
  await page.reload(); await expect(stage).toHaveAttribute('data-layout', 'split');
  await expect(divider).toHaveAttribute('aria-valuenow', '47');
  await expect(panel).not.toHaveClass(/is-glass/); await expect(page.locator('#flight-panel-body')).toBeHidden();
  expect((await panel.boundingBox())!.x).toBeCloseTo(initialPanel.x, 0);
  const reloadedPanel = (await panel.boundingBox())!, reloadedStage = (await stage.boundingBox())!;
  expect(reloadedPanel.y + reloadedPanel.height).toBeCloseTo(reloadedStage.y + reloadedStage.height - 1, 0);
  await page.locator('#panel-collapse').click();
  await page.getByRole('button', { name: 'Stacked', exact: true }).click(); await expect(stage).toHaveAttribute('data-layout', 'stacked');
  await expect(divider).toHaveAttribute('aria-orientation', 'horizontal');
  await divider.focus(); await page.keyboard.press('ArrowUp'); await expect(divider).toHaveAttribute('aria-valuenow', '48');
  expect((await page.locator('#camera-column').boundingBox())!.y).toBeGreaterThan((await page.locator('#observer-view').boundingBox())!.y);
  await page.mouse.move(0, 0); await page.screenshot({ style: '#toast { visibility: hidden; }', path: 'test-results/workspace-stacked.png', fullPage: true });
  await page.getByRole('button', { name: 'Observer only', exact: true }).click(); await expect(page.locator('#camera-view')).toBeHidden();
  await expect(page.locator('#observer-view')).toBeVisible(); await expect(panel).toBeVisible(); await expect(divider).toBeHidden();
  await page.locator('#pause').click(); await page.locator('#capture').click(); await expect(page.locator('#photos img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Camera only', exact: true }).click(); await expect(page.locator('#observer-view')).toBeHidden();
  await expect(page.locator('#camera-view')).toBeVisible(); await expect(panel).toBeVisible();
  await page.locator('#pause').click(); await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  await expect(page.locator('#camera-column #flight-panel')).toBeVisible();
  const classicBackground = await panel.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.locator('#panel-glass').click();
  expect(await panel.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(classicBackground);
  await page.locator('#panel-glass').click();
  await page.setViewportSize({ width: 1920, height: 720 });
  await expect.poll(async () => {
    const instruments = (await panel.boundingBox())!, workspace = (await stage.boundingBox())!;
    return instruments.y + instruments.height <= workspace.y + workspace.height;
  }).toBe(true);
  const classicCamera = (await page.locator('#camera-view').boundingBox())!;
  expect(classicCamera.width / classicCamera.height).toBeCloseTo(16 / 9, 2);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.mouse.move(0, 0); await page.screenshot({ style: '#toast { visibility: hidden; }', path: 'test-results/workspace-classic.png', fullPage: true });
  await page.locator('#workspace-reset').click(); await expect(stage).toHaveAttribute('data-layout', 'split');
  await expect(panel).toHaveClass(/is-glass/); await expect(page.locator('#flight-panel-body')).toBeVisible();
  await expect(divider).toHaveAttribute('aria-valuenow', '62');
  await page.mouse.move(0, 0); await expect(page.locator('#toast')).not.toHaveClass(/visible/);
  await page.screenshot({ style: '#toast { visibility: hidden; }', path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.locator('#simulator-fullscreen').click(); await expect(page.locator('.simulator')).toHaveClass(/is-fullscreen/);
  await expect(panel).toBeVisible(); await expect(page.locator('.photo-library')).toBeHidden();
  await page.locator('#simulator-fullscreen').click(); await expect(page.locator('.simulator')).not.toHaveClass(/is-fullscreen/);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const layout of ['split', 'stacked', 'observer', 'classic']) {
    await page.getByRole('combobox', { name: 'View layout', exact: true }).selectOption(layout);
    await expect(page.locator('#observer-view')).toBeVisible(); await expect(panel).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const instruments = (await panel.boundingBox())!, workspace = (await stage.boundingBox())!;
    expect(instruments.y + instruments.height).toBeCloseTo(workspace.y + workspace.height - 1, 0);
  }
  await page.getByRole('combobox', { name: 'View layout', exact: true }).selectOption('camera');
  await expect(page.locator('#observer-view')).toBeHidden(); await expect(panel).toBeVisible();
  const mobilePanel = (await panel.boundingBox())!, mobileStage = (await stage.boundingBox())!;
  expect(mobilePanel.x).toBeGreaterThanOrEqual(mobileStage.x);
  expect(mobilePanel.x + mobilePanel.width).toBeLessThanOrEqual(mobileStage.x + mobileStage.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.mouse.move(0, 0); await page.screenshot({ style: '#toast { visibility: hidden; }', path: 'test-results/workspace-mobile.png', fullPage: true });
  // Stress the instrument layout with the longest supported readings, including units.
  for (const [width, height, layout] of [[900, 720, 'classic'], [390, 844, 'camera'], [320, 720, 'camera']] as const) {
    await page.setViewportSize({ width, height });
    await page.locator('#view-layout').evaluate((select: HTMLSelectElement, value) => { select.value = value; select.dispatchEvent(new Event('change')); }, layout);
    const overflowing = await page.locator('.telemetry').evaluate((telemetry) => {
      const values = { altitude: '80.0 <small>m</small>', speed: '20.0 <small>m/s</small>', heading: '359 <small>°</small>', 'gimbal-value': '−90 <small>°</small>' };
      return Object.entries(values).flatMap(([id, value]) => {
        const reading = telemetry.querySelector<HTMLElement>(`#${id}`)!;
        reading.innerHTML = value;
        const range = document.createRange(); range.selectNodeContents(reading);
        const right = Math.max(...[...range.getClientRects()].map(rect => rect.right));
        return right > reading.parentElement!.getBoundingClientRect().right + .5 ? [id] : [];
      });
    });
    expect(overflowing).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  expect(errors).toEqual([]);
});

test('fullscreen fills the window with flight views and restores desktop components', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    Object.defineProperty(document, 'webkitFullscreenEnabled', { configurable: true, value: false });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/practice'); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  await page.locator('#observer-mode').selectOption('follow');
  await page.locator('#aids').click();
  const root = page.locator('.simulator'), stage = page.locator('#stage'), panel = page.locator('#flight-panel');
  await page.locator('#simulator-fullscreen').click(); await expect(root).toHaveClass(/is-expanded/);
  for (const selector of ['.topbar', '.map-strip', '.workspace-bar', '.photo-library', '.simulator > footer', '#source', '#quality', '#pair']) await expect(page.locator(selector)).toBeHidden();
  const workspace = (await stage.boundingBox())!, observer = (await page.locator('#observer-view').boundingBox())!, camera = (await page.locator('#camera-view').boundingBox())!;
  expect(workspace).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  expect(observer).toEqual(workspace);
  expect(camera.width).toBeLessThan(500); expect(camera.x).toBeGreaterThan(900); expect(camera.width / camera.height).toBeCloseTo(16 / 9, 2);
  await expect(panel).toHaveClass(/is-collapsed/);
  for (const id of ['altitude', 'speed', 'heading', 'pause', 'takeoff', 'land', 'capture', 'reset', 'simulator-fullscreen']) await expect(page.locator(`#${id}`)).toBeVisible();
  await page.locator('#takeoff').click(); await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
  await expect(page.locator('#altitude')).toContainText('3.0');
  await page.locator('#capture').click(); await expect(page.locator('#photos img')).toHaveCount(1);
  await expect(page.locator('#camera-view')).not.toHaveClass(/flash/);
  await expect(page.locator('#toast')).not.toHaveClass(/visible/);
  await page.mouse.move(0, 0); await page.screenshot({ style: '#toast { visibility: hidden; }', path: 'test-results/workspace-fullscreen.png' });
  await page.locator('#panel-collapse').click(); await expect(page.locator('#flight-panel-body')).toBeVisible();
  for (const { width, height } of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize({ width, height });
    expect((await stage.boundingBox())!).toEqual({ x: 0, y: 0, width, height });
    await expect.poll(async () => {
      const instruments = (await panel.boundingBox())!, controls = (await page.locator('#flight-console').boundingBox())!;
      return instruments.x === 0 && instruments.y >= 0 && instruments.width === width && Math.abs(instruments.y + instruments.height - height) < 1 && controls.x >= 0 && controls.x + controls.width <= width && controls.y + controls.height < instruments.y;
    }).toBe(true);
    for (const id of ['takeoff', 'land', 'capture', 'reset', 'simulator-fullscreen']) {
      const button = (await page.locator(`#${id}`).boundingBox())!;
      expect(button.x).toBeGreaterThanOrEqual(0); expect(button.x + button.width).toBeLessThanOrEqual(width);
      expect(button.y + button.height).toBeLessThanOrEqual(height);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape'); await expect(root).not.toHaveClass(/is-fullscreen/);
  await expect(page.locator('.topbar')).toBeVisible(); await expect(page.locator('#flight-panel-body')).toBeVisible();
  await expect(page.locator('#transport-controls #reset')).toBeVisible(); await expect(page.locator('#utility-controls #simulator-fullscreen')).toBeVisible();
  await expect(page.locator('.workspace-bar #flight-status')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/flight-fullscreen/);
  await page.locator('#pause').click();
  for (const [layout, name] of [['camera', 'Camera only'], ['observer', 'Observer only'], ['classic', 'Classic'], ['stacked', 'Stacked']] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.locator('#simulator-fullscreen').click();
    expect((await stage.boundingBox())!).toEqual(workspace);
    if (layout === 'camera') { await expect(page.locator('#observer-view')).toBeHidden(); await expect(page.locator('#camera-view')).toBeVisible(); }
    else { expect((await page.locator('#observer-view').boundingBox())!).toEqual(workspace); }
    await expect(page.locator('#panel-handle')).toHaveCount(0);
    const instruments = (await panel.boundingBox())!;
    expect(instruments.y + instruments.height).toBeCloseTo(workspace.height, 0);
    await page.locator('#simulator-fullscreen').click(); await expect(root).not.toHaveClass(/is-fullscreen/);
    await expect(stage).toHaveAttribute('data-layout', layout);
    if (layout === 'classic') await expect(page.locator('#camera-column #flight-panel')).toBeVisible();
  }
});

test('collision reset prompt stays visible and resets the flight in desktop and fullscreen', async ({ page }) => {
  await page.goto('/practice'); await expect(page.locator('#connection-status')).toContainText('Keyboard');
  for (const fullscreen of [false, true]) {
    if (fullscreen) await page.locator('#simulator-fullscreen').click();
    await page.locator('#takeoff').click(); await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });
    await page.keyboard.down('s');
    await expect(page.locator('#collision-prompt')).toBeVisible({ timeout: 8_000 }); await page.keyboard.up('s');
    await expect(page.locator('#flight-status')).toHaveAttribute('data-paused', 'true');
    await expect(page.locator('#collision-details')).toContainText(/ground/i);
    await expect(page.locator('#collision-reset')).toBeFocused(); await expect(page.locator('#takeoff')).toBeDisabled();
    await page.mouse.move(0, 0); await page.screenshot({ style: '#toast { visibility: hidden; }', path: `test-results/collision-${fullscreen ? 'fullscreen' : 'desktop'}.png` });
    await page.locator('#collision-reset').press('Space');
    await expect(page.locator('#collision-prompt')).toBeHidden();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'grounded');
    await expect(page.locator('#altitude')).toContainText('0.0'); await expect(page.locator('#takeoff')).toBeEnabled();
  }
});
