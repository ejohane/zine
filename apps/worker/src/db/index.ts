// apps/worker/src/db/index.ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

let recapSchemaReady: boolean | null = null;
let recapSchemaPromise: Promise<void> | null = null;

export async function ensureRecapSchema(d1: D1Database) {
  if (!d1 || typeof d1.prepare !== 'function') {
    return;
  }

  if (recapSchemaReady) {
    return;
  }

  if (recapSchemaPromise) {
    await recapSchemaPromise;
    return;
  }

  recapSchemaPromise = (async () => {
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

    await d1
      .prepare(
        'CREATE INDEX IF NOT EXISTS user_items_finished_window_idx ON user_items (user_id, is_finished, finished_at DESC)'
      )
      .run();

    await d1
      .prepare(
        'CREATE INDEX IF NOT EXISTS user_items_progress_window_idx ON user_items (user_id, progress_updated_at DESC)'
      )
      .run();

    await d1
      .prepare(
        'CREATE INDEX IF NOT EXISTS user_items_last_opened_general_idx ON user_items (user_id, last_opened_at DESC)'
      )
      .run();

    await d1
      .prepare(
        `CREATE TABLE IF NOT EXISTS user_item_consumption_events (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL REFERENCES users(id),
          user_item_id text NOT NULL REFERENCES user_items(id),
          item_id text NOT NULL REFERENCES items(id),
          event_type text NOT NULL,
          occurred_at integer NOT NULL,
          position_seconds integer,
          duration_seconds integer,
          delta_seconds integer,
          source text NOT NULL,
          metadata text
        )`
      )
      .run();

    await d1
      .prepare(
        'CREATE INDEX IF NOT EXISTS user_item_consumption_events_user_idx ON user_item_consumption_events (user_id, occurred_at DESC)'
      )
      .run();

    await d1
      .prepare(
        'CREATE INDEX IF NOT EXISTS user_item_consumption_events_user_type_idx ON user_item_consumption_events (user_id, event_type, occurred_at DESC)'
      )
      .run();

    await d1
      .prepare(
        'CREATE INDEX IF NOT EXISTS user_item_consumption_events_user_item_idx ON user_item_consumption_events (user_item_id, occurred_at DESC)'
      )
      .run();

    await d1
      .prepare(
        'CREATE INDEX IF NOT EXISTS user_item_consumption_events_item_idx ON user_item_consumption_events (item_id, occurred_at DESC)'
      )
      .run();

    recapSchemaReady = true;
  })().catch((error) => {
    recapSchemaReady = false;
    recapSchemaPromise = null;
    throw error;
  });

  await recapSchemaPromise;
}

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
