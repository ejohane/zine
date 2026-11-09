import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
import { ZineClient } from '../client';
const minutes = Number(process.argv[2] ?? 45);
assert.ok(
  Number.isInteger(minutes) && minutes >= 30 && minutes <= 240,
  'Use a duration from 30 to 240 minutes'
);
const origin = 'https://api-next.myzine.app',
  session = await realSession(),
  client = new ZineClient({ baseUrl: origin, token: session.getToken, retries: 0 });
const startedAt = new Date().toISOString(),
  deadline = Date.now() + minutes * 60000;
const observations: unknown[] = [];
const versions = new Set<string>(),
  advances = new Map<string, number>(),
  lastSuccess = new Map<string, string>();
let failures = 0,
  authReads = 0;
try {
  do {
    const at = new Date().toISOString();
    try {
      const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 200);
      const health = (await response.json()) as { deploymentId: string; releaseSha?: string };
      versions.add(health.deploymentId);
      const library = await client.list({}, { limit: 1 });
      assert.ok(Array.isArray(library.items));
      authReads++;
      const sourceMap = new Map<string, string>();
      let cursor: string | undefined;
      do {
        const page = await client.request<{
          sources: { id: string; platform: string }[];
          nextCursor: string | null;
        }>(
          'GET',
          '/v1/sources?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')
        );
        for (const source of page.sources) sourceMap.set(source.id, source.platform);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      const states: { provider: string; active: number; successful: number; errors: number }[] = [];
      cursor = undefined;
      do {
        const page: {
          subscriptions: {
            id: string;
            sourceId: string;
            status: string;
            lastSuccessAt: string | null;
            lastErrorCode: string | null;
          }[];
          nextCursor: string | null;
        } = await client.request<{
          subscriptions: {
            id: string;
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
        for (const subscription of page.subscriptions.filter((s) => s.status === 'active')) {
          const provider = sourceMap.get(subscription.sourceId) ?? 'unknown';
          let aggregate = states.find((s) => s.provider === provider);
          if (!aggregate) {
            aggregate = { provider, active: 0, successful: 0, errors: 0 };
            states.push(aggregate);
          }
          aggregate.active++;
          if (subscription.lastSuccessAt) aggregate.successful++;
          if (subscription.lastErrorCode) aggregate.errors++;
          if (
            subscription.lastSuccessAt &&
            lastSuccess.has(subscription.id) &&
            lastSuccess.get(subscription.id) !== subscription.lastSuccessAt
          )
            advances.set(provider, (advances.get(provider) ?? 0) + 1);
          if (subscription.lastSuccessAt)
            lastSuccess.set(subscription.id, subscription.lastSuccessAt);
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      observations.push({
        at,
        status: 'ok',
        deploymentId: health.deploymentId,
        releaseSha: health.releaseSha ?? null,
        libraryReadable: true,
        subscriptions: states.sort((a, b) => a.provider.localeCompare(b.provider)),
      });
    } catch (error) {
      failures++;
      observations.push({
        at,
        status: 'failed',
        category: error instanceof Error ? error.name : 'unknown',
      });
    }
    // The checkpoint is private and rewritten after each real observation for fresh-session recovery.
    await writeFile(
      '.local-data/soak-progress.json',
      JSON.stringify(
        {
          startedAt,
          observations,
          failures,
          authReads,
          successfulPollAdvances: Object.fromEntries(advances),
        },
        null,
        2
      ) + '\n',
      { mode: 0o600 }
    );
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(60000, deadline - Date.now())));
  } while (Date.now() <= deadline);
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    requestedMinutes: minutes,
    observations: observations.length,
    failures,
    authenticatedLibraryReads: authReads,
    versions: [...versions],
    successfulPollAdvances: Object.fromEntries(advances),
    observationSha256: createHash('sha256').update(JSON.stringify(observations)).digest('hex'),
    scope:
      'Timestamped live public health, real Clerk library reads and subscription-state observations across scheduled polling cycles. No manual syncs, source fetches or library mutations are performed by this observer.',
    limits:
      'A bounded observation window, not an uptime guarantee. Provider poll advances and errors reflect the subscriptions actually active during this run; unavailable Google authorization remains excluded.',
  };
  await writeFile('evidence/production-soak.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  assert.equal(failures, 0, 'Live observations failed; inspect the private checkpoint');
} finally {
  await session.close();
}
