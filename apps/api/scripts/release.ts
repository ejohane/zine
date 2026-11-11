import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { cloudflare, environments } from './cloudflare-control';
import { quietCommand } from './quiet-command';
const environment = process.argv[2];
assert.ok(
  environment === 'staging' || environment === 'production',
  'Use: bun run scripts/release.ts staging|production'
);
const target = environments[environment],
  git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = git('rev-parse', 'HEAD');
assert.equal(git('status', '--porcelain'), '', 'Commit/review all work before release');
if (process.env.GITHUB_SHA) assert.equal(process.env.GITHUB_SHA, sha);
const config = ts.parseConfigFileTextToJson(
  target.config,
  await readFile(target.config, 'utf8')
).config;
assert.equal(config.name, target.worker);
assert.equal(config.vars.ENVIRONMENT, environment);
assert.equal(config.d1_databases[0].database_id, target.databaseId);
assert.equal(config.r2_buckets[0].bucket_name, target.bucket);
assert.equal(
  config.queues.producers.find((b: { binding: string }) => b.binding === 'JOBS')?.queue,
  target.worker + '-jobs'
);
assert.equal(
  config.vectorize.find((b: { binding: string }) => b.binding === 'VECTORS')?.index_name,
  target.worker + '-vectors'
);
assert.equal(config.queues.consumers[0].queue, target.worker + '-jobs');
assert.equal(config.queues.consumers[0].dead_letter_queue, target.worker + '-dead');
await quietCommand('bunx', ['wrangler@4.158.0', 'whoami']);
if (environment === 'production') {
  const stage = (await fetch(environments.staging.origin + '/health').then((r) => r.json())) as {
    releaseSha?: string;
  };
  assert.equal(stage.releaseSha, sha, 'Promote this exact source to staging before production');
}
const migrations = await Promise.all(
  (await readdir('migrations'))
    .filter((p) => p.endsWith('.sql'))
    .sort()
    .map(async (name) => ({
      name,
      sha256: createHash('sha256')
        .update(await readFile('migrations/' + name))
        .digest('hex'),
    }))
);
async function query<T>(sql: string, params: unknown[] = []) {
  const result = await cloudflare<{ success: boolean; results: T[] }[]>(
    'd1/database/' + target.databaseId + '/query',
    'POST',
    { sql, params }
  );
  assert.ok(result.every((r) => r.success));
  return result[0].results;
}
const applied = await query<{ name: string }>('SELECT name FROM d1_migrations ORDER BY name');
for (const { name } of applied)
  assert.ok(
    migrations.some((m) => m.name === name),
    'Remote migration is absent from the reviewed source: ' + name
  );
const hasLedger =
  (
    await query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_checksums'"
    )
  ).length > 0;
if (hasLedger)
  for (const recorded of await query<{ name: string; sha256: string }>(
    'SELECT name,sha256 FROM schema_checksums'
  ))
    assert.equal(
      migrations.find((m) => m.name === recorded.name)?.sha256,
      recorded.sha256,
      'An applied migration changed: ' + recorded.name
    );
const previous = await cloudflare<{
  deployments: { versions: { version_id: string; percentage: number }[] }[];
}>('workers/scripts/' + target.worker + '/deployments');
const previousVersions = previous.deployments[0]?.versions ?? [];
// A native snapshot plus referenced material is archived before every production migration/deploy.
let preDeployBackup: Record<string, unknown> | null = null;
if (environment === 'production') {
  await quietCommand('bun', ['run', 'scripts/backup.ts', 'production']);
  preDeployBackup = JSON.parse(await readFile('evidence/backup-latest.json', 'utf8'));
  assert.equal(preDeployBackup!.environment, 'production');
  assert.equal(preDeployBackup!.bucket, 'zine-api-next-backups');
}
await quietCommand('bunx', [
  'wrangler@4.158.0',
  'd1',
  'migrations',
  'apply',
  'DB',
  '--remote',
  '--config',
  target.config,
]);
for (const migration of migrations)
  await query(
    'INSERT OR IGNORE INTO schema_checksums(name,sha256,first_recorded_at) VALUES(?,?,?)',
    [migration.name, migration.sha256, new Date().toISOString()]
  );
await quietCommand('bunx', [
  'wrangler@4.158.0',
  'deploy',
  '--config',
  target.config,
  '--var',
  'RELEASE_SHA:' + sha,
]);
let health: { deploymentId: string; releaseSha?: string; status: string } | undefined;
let activeVersionConfirmed = false;
// The serving edge and the deployment control plane can converge at different
// times. Verify both views in the same bounded observation loop.
for (let attempt = 0; attempt < 60; attempt++) {
  const response = await fetch(target.origin + '/health', {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (response.ok) {
    health = (await response.json()) as typeof health;
    if (health?.releaseSha === sha && health.status === 'ok') {
      const deployments = await cloudflare<{
        deployments: { versions: { version_id: string; percentage: number }[] }[];
      }>('workers/scripts/' + target.worker + '/deployments');
      const active = deployments.deployments[0]?.versions ?? [];
      activeVersionConfirmed = active.some(
        (version) => version.version_id === health?.deploymentId && version.percentage === 100
      );
      if (activeVersionConfirmed) break;
    }
  }
  if (attempt < 59) await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.ok(
  health?.releaseSha === sha && health.status === 'ok',
  'Serving release identity did not converge'
);
assert.ok(activeVersionConfirmed, 'Deployment listing did not confirm the serving version at 100%');
const bindings = await cloudflare<{
  bindings: {
    type: string;
    name: string;
    id?: string;
    bucket_name?: string;
    queue_name?: string;
    index_name?: string;
  }[];
}>('workers/scripts/' + target.worker + '/settings');
const resources = bindings.bindings
  .filter((b) => ['d1', 'r2_bucket', 'queue', 'vectorize'].includes(b.type))
  .map((b) => ({
    type: b.type,
    name: b.name,
    resource: b.id ?? b.bucket_name ?? b.queue_name ?? b.index_name,
  }));
assert.equal(resources.find((r) => r.name === 'DB')?.resource, target.databaseId);
assert.equal(resources.find((r) => r.name === 'ARTIFACTS')?.resource, target.bucket);
const expectedResources: Record<string, string> = {
  DB: target.databaseId,
  ARTIFACTS: target.bucket,
  JOBS: target.worker + '-jobs',
  VECTORS: target.worker + '-vectors',
};
assert.equal(resources.length, 4, 'Unexpected runtime storage binding count');
for (const resource of resources)
  assert.equal(
    resource.resource,
    expectedResources[resource.name],
    'A foreign runtime binding was found: ' + resource.name
  );
const contract = (await fetch(target.origin + '/openapi.json').then((r) => r.json())) as {
  paths: Record<string, unknown>;
};
for (const path of ['/v1/saves', '/v1/events', '/v1/ops/status', '/v1/webhooks'])
  assert.ok(contract.paths[path]);
assert.equal(
  (await fetch(target.origin + '/v1/items')).status,
  401,
  'Anonymous access must remain closed'
);
const manifest = {
  schemaVersion: 1,
  at: new Date().toISOString(),
  environment,
  sourceSha: sha,
  worker: target.worker,
  origin: target.origin,
  deploymentId: health.deploymentId,
  previousVersions,
  preDeployBackup,
  resources,
  migrations,
  checks: {
    activeVersionAt100Percent: true,
    exactServingSource: true,
    contractPresent: true,
    anonymousLibraryDenied: true,
  },
  limitations:
    'Deployment/readiness receipt. Real authentication, provider operation, recovery and webhook delivery have separate acceptance artifacts. Worker rollback does not roll back D1/R2/queues/vectors.',
};
await mkdir('.local-data/releases', { recursive: true, mode: 0o700 });
const path = '.local-data/releases/' + environment + '-' + health.deploymentId + '.json';
await writeFile(path, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
await quietCommand('bunx', [
  'wrangler@4.158.0',
  'r2',
  'object',
  'put',
  'zine-api-next-backups/releases/' + environment + '/' + sha + '/' + health.deploymentId + '.json',
  '--remote',
  '--file',
  path,
]);
console.log(JSON.stringify(manifest));
