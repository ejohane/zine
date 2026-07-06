import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  testMatch: /storybook\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:6007',
    headless: true,
    viewport: { width: 1440, height: 1200 },
  },
  webServer: {
    command: 'node scripts/serve-static.mjs storybook-static',
    cwd: path.resolve(__dirname),
    url: 'http://127.0.0.1:6007',
    reuseExistingServer: !process.env.CI,
  },
});
