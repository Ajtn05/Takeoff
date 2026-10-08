import { expect, test } from '@playwright/test';
import {
  neutralControls,
  parseClientMessage,
  CONTROLLER_TIMEOUT_MS,
  HOST_TIMEOUT_MS,
  type ClientMessage,
  type Controls,
  type ServerMessage,
} from '../../shared/protocol';

for (const mode of ['practice', 'game']) {
  test(`${mode} tolerates brief input gaps, restores neutral controls, and lets the user cancel recovery`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/${mode}`);
    await page.locator('#pair').click();
    await expect(page.locator('#pair-url')).not.toHaveValue('');
    const url = await page.locator('#pair-url').inputValue();
    await page.locator('#close-pair').click();
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    try {
      const phone = await context.newPage();
      phone.on('pageerror', (error) => errors.push(error.message));
      let dropInputs = false;
      let dropStatus = false;
      let lastInput: Controls | undefined;
      const resumes: Extract<ClientMessage, { type: 'resume' }>[] = [];
      await phone.routeWebSocket('**/ws', (socket) => {
        const server = socket.connectToServer();
        socket.onMessage((raw) => {
          const message = parseClientMessage(String(raw));
          if (message?.type === 'resume') resumes.push(message);
          if (message?.type === 'input') {
            if (dropInputs) return;
            lastInput = message.controls;
          }
          server.send(raw);
        });
        server.onMessage((raw) => {
          const message = JSON.parse(String(raw)) as ServerMessage;
          if (message.type === 'status' && dropStatus) return;
          socket.send(raw);
        });
      });
      await phone.goto(url);
      await expect(phone.locator('#enable')).toBeEnabled();
      await phone.locator('#enable').click();
      await expect(phone.locator('#phone-takeoff')).toBeEnabled();
      await phone.locator('#phone-takeoff').click();
      const flight = page.locator(mode === 'game' ? '#game-stage' : '#flight-status');
      const attribute = mode === 'game' ? 'data-phase' : 'data-paused';
      const flying = mode === 'game' ? 'running' : 'false';
      const paused = mode === 'game' ? 'paused' : 'true';
      await expect(flight).toHaveAttribute(attribute, flying, { timeout: 12_000 });
      if (mode === 'practice')
        await expect(flight).toHaveAttribute('data-mode', 'flying', { timeout: 10_000 });

      const initialResumes = resumes.length;
      dropInputs = true;
      await phone.waitForTimeout(900);
      await expect(flight).toHaveAttribute(attribute, flying);
      await expect(phone.locator('#phone-connection')).toHaveText('Controls ready');
      expect(resumes.length).toBe(initialResumes);
      dropInputs = false;
      await expect.poll(() => lastInput).toEqual(neutralControls());

      // Hold a stick across the longer interruption: recovery must clear that position.
      const cdp = await context.newCDPSession(phone);
      const stick = (await phone.locator('#left-stick').boundingBox())!;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ id: 1, x: stick.x + stick.width * 0.86, y: stick.y + stick.height / 2 }],
      });
      await expect.poll(() => lastInput?.yaw ?? 0).toBeGreaterThan(0.99);
      dropInputs = true;
      await expect(flight).toHaveAttribute(attribute, paused, {
        timeout: CONTROLLER_TIMEOUT_MS + 5000,
      });
      dropInputs = false;
      await expect(phone.locator('#phone-connection')).toHaveText('Controls ready');
      await expect.poll(() => resumes.length).toBeGreaterThan(initialResumes);
      for (const resume of resumes) expect(resume.controls).toEqual(neutralControls());
      await expect.poll(() => lastInput).toEqual(neutralControls());
      await expect(phone.locator('#left-value')).toHaveText('YAW 0% · THROTTLE 0%');
      await expect(flight).toHaveAttribute(attribute, paused);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(phone.locator('#phone-resume')).toBeEnabled();
      await phone.locator('#phone-resume').click();
      await expect(flight).toHaveAttribute(attribute, flying);

      // Lose laptop telemetry while the socket stays open; cancel the automatic retry.
      await phone.setViewportSize({ width: 568, height: 320 });
      const recoveredResumes = resumes.length;
      dropStatus = true;
      await expect(phone.locator('#phone-connection')).toHaveText('Restoring controls…', {
        timeout: HOST_TIMEOUT_MS + 5000,
      });
      await expect(phone.locator('#enable')).toHaveText('Pause controls');
      expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        568,
      );
      expect(await phone.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        320,
      );
      await phone.screenshot({ path: `test-results/controller-recovering-${mode}.png` });
      await phone.locator('#enable').click();
      dropStatus = false;
      await expect(phone.locator('#enable')).toHaveText('Enable controls');
      await expect(phone.locator('#phone-connection')).toHaveText('Controls paused');
      await phone.waitForTimeout(700);
      expect(resumes.length).toBe(recoveredResumes);
      await expect(flight).toHaveAttribute(attribute, paused);
      await expect(phone.locator('#phone-resume')).toBeDisabled();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
