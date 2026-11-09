import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';
import { ZineClient } from '../client';
import { cloudflare, environments } from './cloudflare-control';
const target = environments.staging,
  session = await realSession(),
  client = new ZineClient({
    baseUrl: target.origin,
    token: session.getToken,
    retries: 0,
    timeoutMs: 60000,
  });
const startedAt = new Date().toISOString();
let subscriptionId: string | undefined;
const cleanupItems: string[] = [];
try {
  const rows = await cloudflare<{ results: { url: string }[] }[]>(
    'd1/database/' + environments.production.databaseId + '/query',
    'POST',
    {
      sql: "SELECT r.url FROM subscriptions s JOIN sources so ON so.id=s.source_id JOIN source_routes r ON r.id=s.route_id WHERE so.platform='youtube' AND s.status='active' LIMIT 1",
    }
  );
  const url = rows[0].results[0].url;
  const source = await client.request<{ id: string; routes: { id: string }[] }>(
    'POST',
    '/v1/sources/resolve',
    { url }
  );
  const subscription = await client.subscribe({
    sourceId: source.id,
    routeId: source.routes[0].id,
    autoSave: false,
  });
  subscriptionId = subscription.id;
  const first = await client.waitForJob(subscription.jobId, {
    timeoutMs: 180000,
    intervalMs: 10000,
  });
  assert.equal(first.status, 'succeeded', 'Initial public feed intake failed');
  const page = await client.list({ status: 'received', subscriptionIds: [subscription.id] });
  assert.ok(page.items.length > 0, 'No matching baseline item was retained');
  for (const item of page.items) {
    assert.equal(item.content.type, 'video');
    assert.ok(item.content.title);
    if (
      item.createdAt >= startedAt &&
      item.occurrences.every((o) => o.subscriptionId === subscription.id)
    )
      cleanupItems.push(item.id);
  }
  const second = await client.request<{ jobId: string }>(
    'POST',
    '/v1/subscriptions/' + subscription.id + '/sync'
  );
  assert.equal(
    (await client.waitForJob(second.jobId, { timeoutMs: 180000, intervalMs: 10000 })).status,
    'succeeded'
  );
  const again = await client.list({ status: 'received', subscriptionIds: [subscription.id] });
  assert.deepEqual(again.items.map((i) => i.id).sort(), page.items.map((i) => i.id).sort());
  const health = (await fetch(target.origin + '/health').then((r) => r.json())) as {
    deploymentId: string;
  };
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    origin: target.origin,
    deploymentId: health.deploymentId,
    received: page.items.length,
    checks: {
      publicFeedResolved: true,
      initialPollSucceeded: true,
      videoMetadataRetained: true,
      repeatPollSucceeded: true,
      noDuplicateArrival: true,
    },
    scope:
      'Actual Cloudflare staging public YouTube channel-feed resolution/intake with real Clerk. The channel comes from an existing production subscription, read-only; all intake is staging. No Google-authorized API or pagination claim.',
  };
  await writeFile(
    'evidence/youtube-feed-productionization.json',
    JSON.stringify(report, null, 2) + '\n'
  );
  console.log(JSON.stringify(report));
} finally {
  if (subscriptionId) await client.unsubscribe(subscriptionId);
  for (const id of cleanupItems) await client.request('DELETE', '/v1/items/' + id);
  await session.close();
}
