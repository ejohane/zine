import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runtimeHarness } from '../scripts/runtime-harness';
import { scheduleIndexes } from '../src/jobs';
import type { Env } from '../src/types';

describe('recovery from a snapshot with historical indexing jobs', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>, folder: string;
  beforeAll(async () => {
    runtime = await runtimeHarness();
    folder = await mkdtemp(join(tmpdir(), 'zine-recovery-'));
    execFileSync('python3', ['test/fixtures/recovery.py', folder]);
    execFileSync('python3', [
      'scripts/restore-sql.py',
      folder + '/source.sqlite',
      folder + '/triggers.json',
      folder + '/restore.sql',
    ]);
    const sql = (await readFile(folder + '/restore.sql', 'utf8')).replace(
      'PRAGMA defer_foreign_keys=OFF;',
      ''
    );
    const [initial, ...triggers] = sql.split(/(?=CREATE TRIGGER)/);
    const statements = [
      ...initial
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      ...triggers,
    ];
    await runtime.db.batch(statements.map((sql) => runtime.db.prepare(sql)));
  });
  afterAll(async () => {
    await runtime?.close();
    if (folder) await rm(folder, { recursive: true, force: true });
  });
  it('restores private text and keyword search, removes live credentials and queues a fresh rebuild despite old job IDs', async () => {
    expect(
      await runtime.db
        .prepare('PRAGMA foreign_key_check')
        .all()
        .then((r) => r.results)
    ).toEqual([]);
    expect(
      await runtime.db
        .prepare("SELECT text FROM context_entries WHERE id='ctx_restore'")
        .first<string>('text')
    ).toBe('Retained café; context');
    expect(
      await runtime.db
        .prepare("SELECT COUNT(*) AS n FROM search_fts WHERE search_fts MATCH 'Retained'")
        .first<number>('n')
    ).toBe(1);
    expect(
      await runtime.db.prepare('SELECT COUNT(*) AS n FROM api_tokens').first<number>('n')
    ).toBe(0);
    const request = await runtime.db
      .prepare(
        "SELECT requested_revision,indexed_revision FROM index_requests WHERE item_id='itm_restore'"
      )
      .first();
    expect(request).toMatchObject({ requested_revision: 10, indexed_revision: 0 });
    await scheduleIndexes({ DB: runtime.db, VECTORS: {} } as Env, 'restore-owner');
    const pending = await runtime.db
      .prepare("SELECT item_id FROM jobs WHERE status='pending'")
      .all();
    expect(pending.results).toEqual([{ item_id: 'itm_restore' }]);
    // A second scheduling pass does not duplicate the active rebuild.
    await scheduleIndexes({ DB: runtime.db, VECTORS: {} } as Env, 'restore-owner');
    expect(
      await runtime.db
        .prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='pending'")
        .first<number>('n')
    ).toBe(1);
  });
});
