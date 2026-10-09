import path from 'node:path';
import { defineConfig } from '@playwright/test';
const web = path.resolve(import.meta.dirname);
export default defineConfig({
  testDir: './e2e',
  testMatch: /publications\.spec\.ts/,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:45273',
    headless: true,
    viewport: { width: 1280, height: 1000 },
  },
  webServer: {
    command:
      'bunx wrangler deploy --dry-run --outdir /tmp/zine-public-sharing-bundle && bun scripts/serve-publications-fixture.ts',
    cwd: web,
    url: 'http://127.0.0.1:45273/i/01J00000000000000000000002',
    reuseExistingServer: false,
  },
});
