/**
 * Vitest configuration for Cloudflare Workers
 *
 * Uses @cloudflare/vitest-pool-workers for accurate Workers runtime behavior
 */

import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml',
        },
      },
    },
  },
});
