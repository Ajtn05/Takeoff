import { defineConfig } from '@playwright/test';
import localConfig from './playwright.config';

const port = 8097;
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...localConfig,
  testIgnore: [],
  testMatch: 'hosting.spec.ts',
  use: { ...localConfig.use, baseURL: origin },
  webServer: {
    command: `PORT=${port} PUBLIC_ORIGIN=${origin} DEPLOYMENT_MODE=hosted npm start`,
    url: `${origin}/api/health`,
    reuseExistingServer: false,
  },
});
