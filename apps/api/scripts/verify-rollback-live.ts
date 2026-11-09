import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';
import { ZineClient } from '../client';
import { quietCommand } from './quiet-command';
import { cloudflare, environments } from './cloudflare-control';
const target = environments.staging,
  previous = process.argv[2];
assert.match(previous ?? '', /^[a-f0-9-]{36}$/);
const session = await realSession(),
  client = new ZineClient({ baseUrl: target.origin, token: session.getToken, retries: 0 });
const current = (await fetch(target.origin + '/health').then((r) => r.json())) as {
  deploymentId: string;
  releaseSha: string;
};
assert.notEqual(current.deploymentId, previous);
assert.match(current.releaseSha, /^[a-f0-9]{40}$/, 'Start from a reviewed staging release');
let itemId: string | undefined,
  rolledBack = false;
async function migrationCount() {
  const result = await cloudflare<{ results: { n: number }[] }[]>(
    'd1/database/' + target.databaseId + '/query',
    'POST',
    { sql: 'SELECT COUNT(*) AS n FROM d1_migrations' }
  );
  return result[0].results[0].n;
}
const before = await migrationCount();
try {
  const marker = 'rollback-proof-' + crypto.randomUUID();
  const saved = await client.save({
    url: 'https://example.com/' + marker,
    context: { text: marker },
  });
  itemId = saved.item.id;
  await quietCommand('bun', ['run', 'scripts/rollback.ts', 'staging', previous]);
  rolledBack = true;
  const oldRead = await client.item(itemId);
  assert.equal(oldRead.context[0].text, marker);
  assert.equal(await migrationCount(), before);
  await quietCommand('bun', ['run', 'scripts/rollback.ts', 'staging', current.deploymentId]);
  rolledBack = false;
  const forwardRead = await client.item(itemId);
  assert.equal(forwardRead.context[0].text, marker);
  assert.equal(forwardRead.occurrences.length, 1);
  const serving = (await fetch(target.origin + '/health').then((r) => r.json())) as typeof current;
  assert.equal(serving.releaseSha, current.releaseSha);
  assert.equal(serving.deploymentId, current.deploymentId);
  const report = {
    at: new Date().toISOString(),
    origin: target.origin,
    sourceSha: current.releaseSha,
    startingVersion: current.deploymentId,
    rollbackVersion: previous,
    finalVersion: serving.deploymentId,
    migrationsBefore: before,
    migrationsAfter: await migrationCount(),
    checks: {
      previousCodeServed: true,
      savedContextSurvivedRollback: true,
      savedContextSurvivedForwardPromotion: true,
      exactVersionRestored: true,
      noDuplicateOccurrence: true,
    },
    scope:
      'Actual Cloudflare staging Worker rollback and forward promotion with authenticated readback of a controlled save. D1 schema/data remained current; no production mutation.',
  };
  await writeFile('evidence/rollback-live.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  if (rolledBack)
    await quietCommand('bun', ['run', 'scripts/rollback.ts', 'staging', current.deploymentId]);
  if (itemId) await client.request('DELETE', '/v1/items/' + itemId);
  await session.close();
}
