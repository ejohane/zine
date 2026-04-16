import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  testMatch: /storybook\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:6007',
    headless: true,
    viewport: { width: 1440, height: 1200 },
  },
  webServer: {
    command: 'python3 -m http.server 6007 -d storybook-static',
    cwd: path.resolve(__dirname),
    url: 'http://127.0.0.1:6007',
    reuseExistingServer: !process.env.CI,
  },
});
