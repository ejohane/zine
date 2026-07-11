import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  const bindings = env as Env & {
    AUTH_MIGRATIONS: D1Migration[];
    ARCHIVE_MIGRATIONS: D1Migration[];
  };
  await applyD1Migrations(bindings.AUTH_DB, bindings.AUTH_MIGRATIONS);
  await applyD1Migrations(bindings.ARCHIVE_DB, bindings.ARCHIVE_MIGRATIONS);
});
