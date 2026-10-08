import { expect, test } from '@playwright/test';

for (const mode of ['practice', 'game']) {
  test(`${mode} supports keyboard flight when pairing is unavailable and can renew the link`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let pairingUnavailable = true;
    await page.route('**/api/session', async (route) => {
      if (pairingUnavailable) {
        await route.fulfill({ status: 503, json: { error: 'Pairing temporarily unavailable.' } });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/${mode}`);
    const launch = page.locator(mode === 'practice' ? '#takeoff' : '#game-start');
    await expect(launch).toBeEnabled();
    await launch.click();
    if (mode === 'practice') {
      await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', {
        timeout: 10_000,
      });
    } else {
      await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'running', {
        timeout: 10_000,
      });
    }

    await page.locator('#pair').click();
    await expect(page.locator('#pair-state')).toHaveText('Pairing unavailable');
    await expect(page.locator('#pair-url')).toHaveValue('');
    await expect(page.locator('#revoke')).toHaveText('Retry pairing');
    pairingUnavailable = false;
    await page.locator('#revoke').click();
    await expect(page.locator('#pair-url')).not.toHaveValue('');
    await expect(page.locator('#qr')).toBeVisible();
    await expect(page.locator('#revoke')).toBeEnabled();
    await expect(page.locator('#revoke')).toHaveText('Revoke phone & renew link');
    expect(errors).toEqual([]);
  });
}

test('the same phone stays paired through game, menu, practice, and reload', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  let createdSessions = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/session' && request.method() === 'POST')
      createdSessions++;
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Play game', exact: true }).click();
  await page.locator('#pair').click();
  await expect(page.locator('#pair-url')).not.toHaveValue('');
  const url = await page.locator('#pair-url').inputValue();
  const path = await page.locator('#connection-path').inputValue();
  await page.locator('#close-pair').click();
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const phone = await context.newPage();
    let phoneConnections = 0;
    phone.on('pageerror', (error) => errors.push(error.message));
    phone.on('websocket', () => phoneConnections++);
    await phone.goto(url);
    await expect(phone.locator('#enable')).toBeEnabled();
    await phone.locator('#enable').click();
    await expect(phone.locator('#phone-takeoff')).toBeEnabled();
    await phone.locator('#phone-takeoff').click();
    await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'running', {
      timeout: 12_000,
    });

    await page.goBack();
    await expect(phone.locator('#phone-message')).toContainText('Your phone stays paired');
    await expect(phone.locator('#enable')).toHaveText('Enable controls');
    await expect(phone.locator('#phone-takeoff')).toBeDisabled();
    await phone.locator('#enable').click();
    await expect(phone.locator('#enable')).toHaveText('Enable controls');
    await expect(phone.locator('#phone-takeoff')).toBeDisabled();

    await page.getByRole('link', { name: 'Open practice tool', exact: true }).click();
    await expect(page.locator('#source')).toHaveValue('phone');
    await expect(page.locator('#connection-status')).toContainText('Phone paired');
    await expect(page.locator('#takeoff')).toBeDisabled();
    await phone.locator('#enable').click();
    await expect(phone.locator('#phone-takeoff')).toBeEnabled();
    await phone.locator('#phone-takeoff').click();
    await expect(page.locator('#flight-status')).toHaveAttribute('data-mode', 'flying', {
      timeout: 10_000,
    });

    await page.reload();
    await expect(page.locator('#source')).toHaveValue('phone');
    await expect(page.locator('#connection-status')).toContainText('Phone paired');
    await expect(phone.locator('#enable')).toHaveText('Enable controls');
    await page.locator('#pair').click();
    await expect(page.locator('#pair-url')).toHaveValue(url);
    await expect(page.locator('#connection-path')).toHaveValue(path);
    await page.locator('#close-pair').click();

    await page.getByRole('link', { name: 'Takeoff main menu', exact: true }).click();
    await expect(phone.locator('#phone-message')).toContainText('Your phone stays paired');
    await page.getByRole('link', { name: 'Play game', exact: true }).click();
    await expect(page.locator('#source')).toHaveValue('phone');
    await expect(page.locator('#game-start')).toBeDisabled();
    await phone.locator('#enable').click();
    await expect(phone.locator('#phone-takeoff')).toBeEnabled();
    await phone.locator('#phone-takeoff').click();
    await expect(page.locator('#game-stage')).toHaveAttribute('data-phase', 'running', {
      timeout: 12_000,
    });
    expect(createdSessions).toBe(1);
    expect(phoneConnections).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('a saved pairing invalidated by a server restart is replaced automatically', async ({
  page,
}) => {
  await page.goto('/practice');
  await page.locator('#pair').click();
  await expect(page.locator('#pair-url')).not.toHaveValue('');
  const oldUrl = await page.locator('#pair-url').inputValue();
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem('takeoff-phone-session')!);
    saved.session.sessionId = 'station-removed-by-restart';
    sessionStorage.setItem('takeoff-phone-session', JSON.stringify(saved));
  });
  await page.reload();
  await page.locator('#pair').click();
  await expect(page.locator('#pair-url')).not.toHaveValue('');
  await expect(page.locator('#pair-url')).not.toHaveValue(oldUrl);
  await expect(page.locator('#revoke')).toHaveText('Revoke phone & renew link');
  await expect(page.locator('#qr')).toBeVisible();
});
