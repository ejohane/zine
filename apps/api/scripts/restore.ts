import assert from 'node:assert/strict';
import { readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { cloudflare, environments } from './cloudflare-control';
import { quietCommand } from './quiet-command';
const directory = process.argv[2];
assert.ok(
  directory?.startsWith('.local-data/backups/') && !directory.includes('..'),
  'Use an ignored backup directory'
);
const manifest = JSON.parse(await readFile(directory + '/manifest.json', 'utf8')) as {
  schemaVersion: number;
  environment: keyof typeof environments;
  databaseId: string;
  sqlSha256: string;
  counts: Record<string, number>;
  artifacts: { key: string; file: string; sha256: string; bytes: number }[];
};
assert.equal(manifest.schemaVersion, 1);
assert.ok(manifest.environment === 'production' || manifest.environment === 'staging');
assert.equal(manifest.databaseId, environments[manifest.environment].databaseId);
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
assert.equal(
  hash(await readFile(directory + '/database.sql')),
  manifest.sqlSha256,
  'Snapshot integrity check failed'
);
const configPath = 'verification/wrangler.recovery.jsonc';
const config = ts.parseConfigFileTextToJson(configPath, await readFile(configPath, 'utf8')).config;
assert.equal(config.name, 'zine-api-next-recovery');
const databaseId = config.d1_databases[0].database_id as string,
  bucket = config.r2_buckets[0].bucket_name as string;
assert.ok(
  !Object.values(environments).some((e) => e.databaseId === databaseId || e.bucket === bucket),
  'Recovery cannot replace staging/production'
);
const database = await cloudflare<{ name: string }>('d1/database/' + databaseId);
assert.match(database.name, /^zine-api-next-recovery-/);
assert.equal(bucket, 'zine-api-next-recovery-artifacts');
async function query<T>(sql: string) {
  const results = await cloudflare<{ success: boolean; results: T[] }[]>(
    'd1/database/' + databaseId + '/query',
    'POST',
    { sql }
  );
  assert.ok(results.every((r) => r.success));
  return results[0].results;
}
const tables = await query<{ name: string }>(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_fts%' AND name NOT IN ('d1_migrations','_cf_KV')"
);
assert.ok(tables.length > 30, 'Apply current migrations to the fresh recovery database first');
for (const { name } of tables) assert.match(name, /^[a-zA-Z0-9_]+$/);
async function tableCounts() {
  const rows: { name: string; n: number }[] = [];
  for (const { name } of tables) {
    const count = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name}"`);
    rows.push({ name, n: count[0].n });
  }
  return rows;
}
const initial = await tableCounts();
assert.ok(
  initial.every((r) => r.n === 0),
  'Recovery target must be empty; this command never overwrites data'
);
const triggers = await query<{ name: string; sql: string }>(
  "SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name"
);
await writeFile(directory + '/restore-triggers.json', JSON.stringify(triggers), { mode: 0o600 });
await quietCommand(
  'python3',
  [
    'scripts/restore-sql.py',
    directory + '/database.sqlite',
    directory + '/restore-triggers.json',
    directory + '/restore.sql',
  ],
  undefined,
  directory + '/restore-import-error.log'
);
await quietCommand(
  'bunx',
  [
    'wrangler@4.158.0',
    'd1',
    'execute',
    'DB',
    '--remote',
    '--config',
    configPath,
    '--file',
    directory + '/restore.sql',
  ],
  undefined,
  directory + '/restore-import-error.log'
);
assert.deepEqual(await query('PRAGMA foreign_key_check'), []);
const restored = await tableCounts();
const counts = Object.fromEntries(restored.map((r) => [r.name, r.n]));
for (const name of [
  'personal_items',
  'context_entries',
  'annotations',
  'contributions',
  'collections',
  'sources',
  'subscriptions',
  'progress',
  'search_documents',
])
  assert.equal(counts[name], manifest.counts[name] ?? 0, 'Restored count mismatch: ' + name);
for (const name of [
  'api_tokens',
  'connections',
  'webhooks',
  'webhook_deliveries',
  'indexed_documents',
])
  assert.equal(counts[name], 0, 'Unsafe restored state: ' + name);
assert.equal(
  (await query<{ n: number }>("SELECT COUNT(*) AS n FROM subscriptions WHERE status='active'"))[0]
    .n,
  0
);
assert.equal(
  (
    await query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM jobs WHERE kind IN ('enrich','sync') AND status IN ('pending','running')"
    )
  )[0].n,
  0
);
// Compare full authoritative row values, including large retained text, after safety overlays.
const provenTables: { table: string; rows: number; sha256: string }[] = [];
for (const name of [
  'content_items',
  'personal_items',
  'save_occurrences',
  'context_entries',
  'item_tags',
  'progress',
  'annotations',
  'collections',
  'collection_members',
  'collection_notes',
  'collection_note_references',
  'sources',
  'source_routes',
  'subscriptions',
  'subscription_seen',
  'contributions',
  'enrichment_components',
  'item_relationships',
  'home_editions',
  'item_aliases',
  'reconciliation_events',
  'search_documents',
]) {
  if (manifest.counts[name] === undefined) continue;
  const source = JSON.parse(
    await quietCommand('python3', [
      'scripts/read-snapshot.py',
      directory + '/database.sqlite',
      name,
    ])
  ) as { columns: string[]; rows: Record<string, unknown>[] };
  for (const column of source.columns) assert.match(column, /^[a-zA-Z0-9_]+$/);
  if (name === 'subscriptions')
    for (const row of source.rows) {
      row.status = 'unsubscribed';
      row.sync_lease_token = null;
      row.sync_lease_until = null;
    }
  const restoredRows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 100) {
    const rows = await query<Record<string, unknown>>(
      `SELECT ${source.columns.map((c) => `"${c}"`).join(',')} FROM "${name}" ORDER BY rowid LIMIT 100 OFFSET ${offset}`
    );
    restoredRows.push(...rows);
    if (rows.length < 100) break;
  }
  const rowHash = (rows: Record<string, unknown>[]) =>
    hash(
      rows
        .map((row) =>
          JSON.stringify(
            Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)))
          )
        )
        .join('\n')
    );
  const expected = rowHash(source.rows);
  assert.equal(rowHash(restoredRows), expected, 'Restored row content mismatch: ' + name);
  provenTables.push({ table: name, rows: source.rows.length, sha256: expected });
}
await mkdir(directory + '/readback', { mode: 0o700 });
let next = 0,
  verified = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < manifest.artifacts.length) {
      const artifact = manifest.artifacts[next++];
      assert.match(artifact.file, /^objects\/[a-f0-9]{64}$/);
      assert.ok(!artifact.key.includes('..'));
      const file = directory + '/' + artifact.file;
      assert.equal(hash(await readFile(file)), artifact.sha256, 'Backup object integrity failed');
      const readback = directory + '/readback/' + artifact.file.slice(8);
      for (let attempt = 0; ; attempt++) {
        try {
          await quietCommand('bunx', [
            'wrangler@4.158.0',
            'r2',
            'object',
            'put',
            bucket + '/' + artifact.key,
            '--remote',
            '--file',
            file,
          ]);
          await quietCommand('bunx', [
            'wrangler@4.158.0',
            'r2',
            'object',
            'get',
            bucket + '/' + artifact.key,
            '--remote',
            '--file',
            readback,
          ]);
          break;
        } catch (error) {
          if (attempt >= 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      await chmod(readback, 0o600);
      assert.equal(
        hash(await readFile(readback)),
        artifact.sha256,
        'Remote object readback mismatch'
      );
      verified++;
    }
  })
);
const report = {
  at: new Date().toISOString(),
  sourceSnapshotSha256: manifest.sqlSha256,
  sourceEnvironment: manifest.environment,
  targetDatabase: databaseId,
  targetBucket: bucket,
  authoritativeItems: counts.personal_items,
  contributions: counts.contributions,
  restoredObjects: verified,
  authoritativeTableHashes: provenTables,
  hashComparison:
    'Exact row values after the documented isolated-restore subscription/lease safety overlays',
  allObjectHashesReadBack: true,
  foreignKeysValid: true,
  credentialsRemoved: true,
  subscriptionsPaused: true,
  externalJobsPaused: true,
  scope:
    'Actual isolated Cloudflare D1 import and full referenced-object R2 write/readback. Search vectors are deliberately absent and must be rebuilt. This does not mutate the source database, bucket or Worker.',
};
await writeFile('evidence/recovery-restore.json', JSON.stringify(report, null, 2) + '\n');
await writeFile(directory + '/restore-report.json', JSON.stringify(report, null, 2) + '\n', {
  mode: 0o600,
});
console.log(JSON.stringify(report));
