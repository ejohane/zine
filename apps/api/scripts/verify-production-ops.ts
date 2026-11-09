import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';
import { ZineClient } from '../client';

const expectedSha = process.argv[2];
assert.match(expectedSha ?? '', /^[a-f0-9]{40}$/, 'Supply the exact released source SHA');
const origin = 'https://api-next.myzine.app';
const health = (await fetch(origin + '/health').then((r) => r.json())) as {
  deploymentId: string;
  releaseSha: string;
};
assert.equal(health.releaseSha, expectedSha);
const session = await realSession();
try {
  const client = new ZineClient({ baseUrl: origin, token: session.getToken, retries: 0 });
  const status = await client.request<{
    observedAt: string;
    deploymentId: string;
    jobs: { ready: number; expiredLeases: number; oldestReadyAgeSeconds: number };
    subscriptions: { active: number; stale: number; errors: number };
    cron: { lastSucceededAt: string | null; ageSeconds: number | null };
    indexing: { total: number; dirty: number };
    conditions: Record<string, boolean>;
  }>('GET', '/v1/ops/status');
  assert.equal(status.deploymentId, health.deploymentId);
  for (const code of ['queue_stalled', 'cron_stale', 'cron_failed'])
    assert.equal(status.conditions[code], false, 'Critical operational condition: ' + code);
  assert.ok(status.cron.lastSucceededAt, 'Need a natural successful scheduler heartbeat');
  const sourcePlatforms = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page = await client.request<{
      sources: { id: string; platform: string }[];
      nextCursor: string | null;
    }>('GET', '/v1/sources?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    for (const source of page.sources) sourcePlatforms.set(source.id, source.platform);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  const sourceState: {
    platform: string;
    status: string;
    lastSuccessAt: string | null;
    errorCode: string | null;
  }[] = [];
  do {
    const page = await client.request<{
      subscriptions: {
        sourceId: string;
        status: string;
        lastSuccessAt: string | null;
        lastErrorCode: string | null;
      }[];
      nextCursor: string | null;
    }>(
      'GET',
      '/v1/subscriptions?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')
    );
    for (const subscription of page.subscriptions)
      sourceState.push({
        platform: sourcePlatforms.get(subscription.sourceId) ?? 'unknown',
        status: subscription.status,
        lastSuccessAt: subscription.lastSuccessAt,
        errorCode: subscription.lastErrorCode,
      });
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  const report = {
    at: status.observedAt,
    origin,
    sourceSha: health.releaseSha,
    deploymentId: health.deploymentId,
    jobs: status.jobs,
    subscriptions: status.subscriptions,
    cron: status.cron,
    indexing: status.indexing,
    conditions: status.conditions,
    sourceState: sourceState.sort((a, b) => a.platform.localeCompare(b.platform)),
    scope:
      'Real Clerk authenticated production operational readback after natural cron. Aggregate state only; no manual syncs, heartbeat injection, queue reset or quota override.',
    limits:
      'Point-in-time owner aggregates and shared scheduler heartbeat. Normal upstream job/source errors are reported separately from critical infrastructure conditions.',
  };
  await writeFile('evidence/production-ops-live.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await session.close();
}
