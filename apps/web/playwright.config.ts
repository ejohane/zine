import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  testMatch: /app\.smoke\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:45173',
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command:
      'VITE_API_URL=http://127.0.0.1:8787 VITE_CLERK_PUBLISHABLE_KEY= bunx vite --host 127.0.0.1 --port 45173 --strictPort',
    cwd: __dirname,
    url: 'http://127.0.0.1:45173',
    reuseExistingServer: !process.env.CI,
  },
});
