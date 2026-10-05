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
          bindings: { TEST_MIGRATIONS: await readD1Migrations('./src/db/migrations') },
        },
        wrangler: {
          configPath: './wrangler.test.toml',
        },
      },
    },
  },
}));
