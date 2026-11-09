import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { cloudflare, environments } from './cloudflare-control';
import { quietCommand } from './quiet-command';
import { assertProductionRollbackReceipt, rollbackReleaseSha } from './rollback-policy';
const environment = process.argv[2],
  version = process.argv[3];
assert.ok(
  environment === 'staging' || environment === 'production',
  'Use environment and an explicit reviewed Worker version ID'
);
assert.match(version ?? '', /^[a-f0-9-]{36}$/);
const target = environments[environment];
assert.ok(process.argv[4] === undefined || process.argv[4] === '--check-only');
// Validate this version belongs to the selected Worker before asking Cloudflare to promote it.
const details = await cloudflare<{
  resources: { bindings: { type: string; name: string; text?: string }[] };
}>('workers/scripts/' + target.worker + '/versions/' + version);
if (environment === 'production') {
  const sourceSha = rollbackReleaseSha(details.resources.bindings);
  const directory = '.local-data/rollback-manifests';
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = directory + '/' + version + '.json';
  await quietCommand('bunx', [
    'wrangler@4.158.0',
    'r2',
    'object',
    'get',
    `zine-api-next-backups/releases/production/${sourceSha}/${version}.json`,
    '--remote',
    '--file',
    path,
  ]);
  await chmod(path, 0o600);
  assertProductionRollbackReceipt(JSON.parse(await readFile(path, 'utf8')), version, sourceSha);
}
if (process.argv[4] === '--check-only') {
  console.log(
    JSON.stringify({ environment, version, preflightPassed: true, deploymentChanged: false })
  );
  process.exit(0);
}
await quietCommand('bunx', [
  'wrangler@4.158.0',
  'rollback',
  version,
  '--config',
  target.config,
  '--message',
  'Reviewed Zine API recovery to explicit version',
]);
let observed: string | undefined;
for (let attempt = 0; attempt < 30; attempt++) {
  const response = await fetch(target.origin + '/health', { signal: AbortSignal.timeout(15000) });
  if (response.ok) {
    const body = (await response.json()) as { deploymentId: string };
    observed = body.deploymentId;
    if (observed === version) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(observed, version, 'Rollback serving-version readback failed');
const report = {
  at: new Date().toISOString(),
  environment,
  worker: target.worker,
  servingVersion: version,
  healthReadback: true,
  storageRolledBack: false,
  scope:
    'Explicit Worker code/config rollback only. Database, retained objects, queues and vectors remain in their current state; verify application data separately.',
};
await writeFile('.local-data/rollback-latest.json', JSON.stringify(report, null, 2) + '\n', {
  mode: 0o600,
});
console.log(JSON.stringify(report));
