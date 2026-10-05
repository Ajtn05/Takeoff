import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: 'hosting.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8081',
    channel: process.env.BROWSER_CHANNEL || 'chrome',
    viewport: { width: 1440, height: 1050 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'PORT=8081 npm start', url: 'http://127.0.0.1:8081/api/health', reuseExistingServer: false },
});
