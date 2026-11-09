import assert from 'node:assert/strict';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { quietCommand } from './quiet-command';
export async function archiveBackup(directory: string) {
  assert.ok(directory.startsWith('.local-data/backups/') && !directory.includes('..'));
  const manifest = JSON.parse(await readFile(directory + '/manifest.json', 'utf8')) as {
    environment: string;
    startedAt: string;
    completedAt: string;
    counts: Record<string, number>;
    artifacts: unknown[];
    sqlSha256: string;
  };
  assert.ok(['production', 'staging'].includes(manifest.environment));
  const archive = directory + '.tar.gz';
  await quietCommand('tar', [
    '-czf',
    archive,
    '-C',
    directory,
    'database.sql',
    'database.sqlite',
    'snapshot-metadata.json',
    'manifest.json',
    'objects',
  ]);
  await chmod(archive, 0o600);
  const bytes = await readFile(archive),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const key =
    'backups/' +
    manifest.environment +
    '/' +
    manifest.startedAt.replace(/[:.]/g, '-') +
    '/' +
    sha256 +
    '.tar.gz';
  await quietCommand('bunx', [
    'wrangler@4.158.0',
    'r2',
    'object',
    'put',
    'zine-api-next-backups/' + key,
    '--remote',
    '--file',
    archive,
  ]);
  const readback = archive + '.readback';
  await quietCommand('bunx', [
    'wrangler@4.158.0',
    'r2',
    'object',
    'get',
    'zine-api-next-backups/' + key,
    '--remote',
    '--file',
    readback,
  ]);
  await chmod(readback, 0o600);
  assert.equal(
    createHash('sha256')
      .update(await readFile(readback))
      .digest('hex'),
    sha256,
    'Remote backup archive differs'
  );
  const report = {
    at: new Date().toISOString(),
    environment: manifest.environment,
    bucket: 'zine-api-next-backups',
    key,
    archiveSha256: sha256,
    remoteArchiveHashVerified: true,
    bytes: bytes.length,
    items: manifest.counts.personal_items,
    referencedObjects: manifest.artifacts.length,
    snapshotSqlSha256: manifest.sqlSha256,
    retentionDays: 30,
    scope:
      'Private content-addressed R2 archive. No raw database, library text, credentials or object bodies are included in this public summary.',
  };
  await writeFile('evidence/backup-latest.json', JSON.stringify(report, null, 2) + '\n');
  return report;
}
