#!/usr/bin/env bun
/**
 * Backfill Script: Populate *_ms columns from legacy ISO8601 timestamps.
 *
 * Preconditions:
 * - The *_ms columns must already exist (added via migration).
 * - Run on a copy/backup first for production.
 *
 * Usage:
 *   D1_DB_PATH=/path/to/db.sqlite bun run scripts/backfill-legacy-timestamps.ts
 *   D1_DB_PATH=/path/to/db.sqlite bun run scripts/backfill-legacy-timestamps.ts --dry-run
 */

import Database from 'bun:sqlite';

type ColumnMapping = {
  iso: string;
  ms: string;
};

type TableMapping = {
  name: string;
  columns: ColumnMapping[];
};

const TABLE_MAPPINGS: TableMapping[] = [
  {
    name: 'users',
    columns: [
      { iso: 'created_at', ms: 'created_at_ms' },
      { iso: 'updated_at', ms: 'updated_at_ms' },
    ],
  },
  {
    name: 'items',
    columns: [
      { iso: 'published_at', ms: 'published_at_ms' },
      { iso: 'created_at', ms: 'created_at_ms' },
      { iso: 'updated_at', ms: 'updated_at_ms' },
    ],
  },
  {
    name: 'user_items',
    columns: [
      { iso: 'ingested_at', ms: 'ingested_at_ms' },
      { iso: 'bookmarked_at', ms: 'bookmarked_at_ms' },
      { iso: 'archived_at', ms: 'archived_at_ms' },
      { iso: 'last_opened_at', ms: 'last_opened_at_ms' },
      { iso: 'progress_updated_at', ms: 'progress_updated_at_ms' },
      { iso: 'finished_at', ms: 'finished_at_ms' },
      { iso: 'created_at', ms: 'created_at_ms' },
      { iso: 'updated_at', ms: 'updated_at_ms' },
    ],
  },
  {
    name: 'sources',
    columns: [
      { iso: 'created_at', ms: 'created_at_ms' },
      { iso: 'updated_at', ms: 'updated_at_ms' },
      { iso: 'deleted_at', ms: 'deleted_at_ms' },
    ],
  },
  {
    name: 'provider_items_seen',
    columns: [{ iso: 'first_seen_at', ms: 'first_seen_at_ms' }],
  },
];

const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = process.env.D1_DB_PATH || process.env.DB_PATH || '';

function exitWithError(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function getColumnSet(db: Database, table: string): Set<string> {
  const rows = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  return new Set(rows.map((row) => row.name));
}

function countMissing(db: Database, table: string, isoColumn: string, msColumn: string): number {
  const result = db
    .query<{ missing: number }, []>(
      `SELECT COUNT(*) as missing
       FROM ${table}
       WHERE ${isoColumn} IS NOT NULL
         AND (${msColumn} IS NULL OR ${msColumn} = 0)
         AND strftime('%s', ${isoColumn}) IS NOT NULL`
    )
    .get();

  return result?.missing ?? 0;
}

function backfillColumn(
  db: Database,
  table: string,
  isoColumn: string,
  msColumn: string,
  dryRun: boolean
): { updated: number; before: number; after: number } {
  const before = countMissing(db, table, isoColumn, msColumn);

  if (dryRun) {
    return { updated: 0, before, after: before };
  }

  const result = db
    .query<unknown, []>(
      `UPDATE ${table}
       SET ${msColumn} = CAST(strftime('%s', ${isoColumn}) AS INTEGER) * 1000
       WHERE ${isoColumn} IS NOT NULL
         AND (${msColumn} IS NULL OR ${msColumn} = 0)
         AND strftime('%s', ${isoColumn}) IS NOT NULL`
    )
    .run();

  const after = countMissing(db, table, isoColumn, msColumn);
  return { updated: result.changes ?? 0, before, after };
}

async function main() {
  if (!DB_PATH) {
    exitWithError('Missing D1_DB_PATH or DB_PATH. Provide the local SQLite file path.');
  }

  console.log('🧭 Starting legacy timestamp backfill');
  console.log(`🗂  Database: ${DB_PATH}`);
  console.log(`🧪 Dry run: ${DRY_RUN ? 'yes' : 'no'}\n`);

  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');

  const missingColumns: string[] = [];
  const results: Array<{ table: string; iso: string; ms: string; before: number; after: number }> =
    [];

  try {
    db.exec('BEGIN');

    for (const table of TABLE_MAPPINGS) {
      const columns = getColumnSet(db, table.name);

      for (const mapping of table.columns) {
        if (!columns.has(mapping.iso) || !columns.has(mapping.ms)) {
          missingColumns.push(`${table.name}.${mapping.iso}/${mapping.ms}`);
          continue;
        }

        const { before, after } = backfillColumn(db, table.name, mapping.iso, mapping.ms, DRY_RUN);

        results.push({
          table: table.name,
          iso: mapping.iso,
          ms: mapping.ms,
          before,
          after,
        });
      }
    }

    if (DRY_RUN) {
      db.exec('ROLLBACK');
    } else {
      db.exec('COMMIT');
    }
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }

  if (missingColumns.length > 0) {
    console.log('⚠️  Skipped columns (missing):');
    for (const column of missingColumns) {
      console.log(`   - ${column}`);
    }
    console.log('');
  }

  console.log('📊 Backfill summary (missing counts):');
  for (const result of results) {
    const changed = DRY_RUN ? 'dry-run' : result.before - result.after;
    console.log(
      `   ${result.table}.${result.ms}: ${result.before} -> ${result.after} (${changed})`
    );
  }

  console.log('\n✅ Backfill complete');
}

main().catch((error) => {
  console.error('\n❌ Backfill failed');
  console.error(error);
  process.exit(1);
});
