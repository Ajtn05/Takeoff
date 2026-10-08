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
