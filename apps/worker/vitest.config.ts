/**
 * Vitest configuration for Cloudflare Workers
 *
 * Uses @cloudflare/vitest-pool-workers for accurate Workers runtime behavior
 */

import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => ({
  test: {
    globals: true,
    setupFiles: ['./src/test/vitest.setup.ts'],
    poolOptions: {
      workers: {
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: await readD1Migrations('./src/db/migrations'),
            BOOK_LIVE_PROOF: process.env.ZINE_BOOK_LIVE_PROOF === '1',
          },
        },
        wrangler: {
          configPath: './wrangler.test.toml',
        },
      },
    },
  },
}));
