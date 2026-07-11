import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

const authMigrations = await readD1Migrations('src/test/auth-migrations');
const archiveMigrations = await readD1Migrations('src/db/migrations');

export default defineWorkersConfig({
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    poolOptions: {
      workers: {
        isolatedStorage: false,
        wrangler: { configPath: './wrangler.test.toml' },
        miniflare: {
          bindings: { AUTH_MIGRATIONS: authMigrations, ARCHIVE_MIGRATIONS: archiveMigrations },
        },
      },
    },
  },
});
