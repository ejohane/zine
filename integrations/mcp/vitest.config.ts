/**
 * Vitest configuration for Cloudflare Workers
 *
 * Uses @cloudflare/vitest-pool-workers for accurate Workers runtime behavior
 */

import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import { buildSync } from 'esbuild';

export default defineWorkersConfig(async () => ({
  plugins: [
    {
      name: 'bundle-mcp-sdk-for-workerd-tests',
      enforce: 'pre',
      load(id) {
        if (id.endsWith('/ui/library.html')) {
          return buildSync({
            entryPoints: [id],
            loader: { '.html': 'text' },
            format: 'esm',
            write: false,
          }).outputFiles[0].text;
        }
        // The older Worker test module fallback cannot load AJV's CJS JSON requires.
        // Bundle the real SDK exactly as Wrangler does; do not mock protocol behavior.
        if (id.endsWith('/@modelcontextprotocol/sdk/dist/esm/server/mcp.js')) {
          return buildSync({
            entryPoints: [id],
            bundle: true,
            format: 'esm',
            platform: 'browser',
            write: false,
          }).outputFiles[0].text;
        }
      },
    },
  ],
  test: {
    server: { deps: { inline: [/@modelcontextprotocol\/sdk/] } },
    globals: true,
    setupFiles: ['../../apps/worker/src/test/vitest.setup.ts'],
    poolOptions: {
      workers: {
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: await readD1Migrations('../../apps/worker/src/db/migrations'),
          },
        },
        wrangler: {
          configPath: './wrangler.local.toml',
        },
      },
    },
  },
}));
