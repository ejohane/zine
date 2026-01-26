// apps/worker/src/db/index.ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

let userItemsLastOpenedAtReady: boolean | null = null;
let userItemsLastOpenedAtPromise: Promise<void> | null = null;

export async function ensureUserItemsLastOpenedAt(d1: D1Database) {
  if (!d1 || typeof d1.prepare !== 'function') {
    return;
  }

  if (userItemsLastOpenedAtReady) {
    return;
  }

  if (userItemsLastOpenedAtPromise) {
    await userItemsLastOpenedAtPromise;
    return;
  }

  userItemsLastOpenedAtPromise = (async () => {
    const result = await d1.prepare("PRAGMA table_info('user_items')").all();
    const columns = Array.isArray(result.results) ? result.results : [];
    const hasColumn = columns.some((column) => column?.name === 'last_opened_at');

    if (!hasColumn) {
      await d1.prepare('ALTER TABLE user_items ADD COLUMN last_opened_at text').run();
    }

    await d1
      .prepare(
        'CREATE INDEX IF NOT EXISTS user_items_recent_opened_idx ON user_items (user_id, state, last_opened_at)'
      )
      .run();

    userItemsLastOpenedAtReady = true;
  })().catch((error) => {
    userItemsLastOpenedAtReady = false;
    userItemsLastOpenedAtPromise = null;
    throw error;
  });

  await userItemsLastOpenedAtPromise;
}

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
