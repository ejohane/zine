import assert from 'node:assert/strict';
import { quietCommand } from './quiet-command';
import { archiveBackup } from './backup-storage';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cloudflare, environments } from './cloudflare-control';
const environment = process.argv[2];
assert.ok(
  environment === 'production' || environment === 'staging',
  'Use: bun run scripts/backup.ts production|staging'
);
const target = environments[environment],
  startedAt = new Date().toISOString();
const directory =
  process.argv[3] ?? '.local-data/backups/' + environment + '-' + startedAt.replace(/[:.]/g, '-');
assert.ok(
  directory.startsWith('.local-data/backups/' + environment + '-') && !directory.includes('..'),
  'Resume only an ignored backup for this environment'
);
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
interface ExportState {
  at_bookmark?: string;
  status?: string;
  result?: { signed_url?: string };
  error?: string;
}
let state: ExportState = {},
  sql: string;
const sqlPath = directory + '/database.sql';
if (process.argv[3]) {
  sql = await readFile(sqlPath, 'utf8');
  const metadata = JSON.parse(await readFile(directory + '/snapshot-metadata.json', 'utf8'));
  assert.equal(metadata.environment, environment);
  state.at_bookmark = metadata.bookmark;
} else {
  let attempt = 0;
  while (!state.result?.signed_url) {
    assert.ok(attempt++ < 180, 'Export deadline reached');
    state = await cloudflare<ExportState>('d1/database/' + target.databaseId + '/export', 'POST', {
      output_format: 'polling',
      ...(state.at_bookmark ? { current_bookmark: state.at_bookmark } : {}),
      dump_options: { compatibility: 'sqlite3_cli_only' },
    });
    assert.notEqual(
      state.status,
      'error',
      'Snapshot export failed; no library data has been changed'
    );
    if (!state.result?.signed_url) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const download = new URL(state.result.signed_url);
  assert.equal(download.protocol, 'https:');
  const response = await fetch(download, { redirect: 'error', signal: AbortSignal.timeout(60000) });
  assert.ok(response.ok, 'Private snapshot download failed');
  sql = await response.text();
  await writeFile(sqlPath, sql, { mode: 0o600 });
  await writeFile(
    directory + '/snapshot-metadata.json',
    JSON.stringify({ bookmark: state.at_bookmark, startedAt, environment }),
    { mode: 0o600 }
  );
}
if (!process.argv[3]) await quietCommand('sqlite3', [directory + '/database.sqlite'], sql);
assert.equal(
  (
    await quietCommand('sqlite3', [directory + '/database.sqlite', 'PRAGMA integrity_check'])
  ).trim(),
  'ok'
);
await chmod(directory + '/database.sqlite', 0o600);
const tables = JSON.parse(
  await quietCommand('sqlite3', [
    '-json',
    directory + '/database.sqlite',
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_fts%' ORDER BY name",
  ])
) as { name: string }[];
const counts: Record<string, number> = {};
for (const { name } of tables) {
  assert.match(name, /^[a-zA-Z0-9_]+$/);
  const output = await quietCommand('sqlite3', [
    directory + '/database.sqlite',
    `SELECT COUNT(*) FROM "${name}"`,
  ]);
  counts[name] = Number(output.trim());
}
const keys = JSON.parse(
  await quietCommand('sqlite3', [
    '-json',
    directory + '/database.sqlite',
    `SELECT artifact_key FROM contributions WHERE artifact_key IS NOT NULL
 UNION SELECT state_key AS artifact_key FROM understanding_runs WHERE state_key IS NOT NULL AND status='processing'
 UNION SELECT json_extract(cursor_json,'$.stateKey') AS artifact_key FROM subscriptions WHERE json_extract(cursor_json,'$.stateKey') IS NOT NULL
 UNION SELECT json_extract(payload_json,'$.feedEntryArtifactKey') AS artifact_key FROM jobs WHERE status IN ('pending','running','failed') AND COALESCE(json_extract(payload_json,'$.feedMetadataApplied'),0)=0 AND json_extract(payload_json,'$.feedEntryArtifactKey') IS NOT NULL`,
  ])
) as { artifact_key: string }[];
await mkdir(directory + '/objects', { mode: 0o700, recursive: true });
const artifacts: { key: string; file: string; bytes: number; sha256: string }[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < keys.length) {
      const { artifact_key: key } = keys[next++];
      const file = 'objects/' + createHash('sha256').update(key).digest('hex');
      for (let retry = 0; ; retry++) {
        try {
          await quietCommand('bunx', [
            'wrangler@4.158.0',
            'r2',
            'object',
            'get',
            target.bucket + '/' + key,
            '--remote',
            '--file',
            directory + '/' + file,
          ]);
          break;
        } catch (error) {
          if (retry >= 2 || String(error).includes('not_found')) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000 * (retry + 1)));
        }
      }
      await chmod(directory + '/' + file, 0o600);
      const bytes = await readFile(directory + '/' + file);
      artifacts.push({
        key,
        file,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  })
);
artifacts.sort((a, b) => a.key.localeCompare(b.key));
const manifest = {
  schemaVersion: 1,
  startedAt,
  completedAt: new Date().toISOString(),
  environment,
  databaseId: target.databaseId,
  bucket: target.bucket,
  bookmark: state.at_bookmark,
  sqlSha256: createHash('sha256').update(sql).digest('hex'),
  counts,
  artifacts,
  consistency:
    'D1 native point-in-time snapshot, followed by copies of immutable referenced R2 objects. Missing objects fail the backup; unreferenced/garbage objects are excluded.',
  security:
    'Private snapshot includes credential hashes/encrypted grants; secret encryption keys and provider secrets are not exported. Isolated restore removes live credentials and pauses external work.',
};
await writeFile(directory + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n', {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    backup: directory,
    environment,
    completedAt: manifest.completedAt,
    tables: tables.length,
    items: counts.personal_items,
    artifacts: artifacts.length,
    sqlSha256: manifest.sqlSha256,
  })
);

await archiveBackup(directory);
