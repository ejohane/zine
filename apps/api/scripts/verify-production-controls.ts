import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { ZineClient, ZineError } from '../client';
import { realSession } from './clerk-session';

// Staging-only mutations. Credentials are held in memory and revoked in finally.
const baseUrl = 'https://api-next-staging.myzine.app';
const session = await realSession();
const admin = new ZineClient({ baseUrl, token: session.getToken, retries: 0 });
const issued: string[] = [];
let itemId: string | undefined;
let writer: ZineClient | undefined;
const startedAt = new Date().toISOString();
try {
  const health = (await fetch(baseUrl + '/health').then((r) => r.json())) as {
    deploymentId: string;
    status: string;
  };
  assert.equal(health.status, 'ok');
  const production = new ZineClient({
    baseUrl: 'https://api-next.myzine.app',
    token: session.getToken,
    retries: 0,
  });
  const marker = 'production-controls-' + crypto.randomUUID();
  const url =
    'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API?zine-verification=' + marker;
  assert.equal((await production.list({ url })).items.length, 0);
  async function issue(scopes?: string[]) {
    const value = await admin.request<{ id: string; token: string; scopes: string[] }>(
      'POST',
      '/v1/tokens',
      {
        name: 'Staging production controls verification',
        expiresInDays: 1,
        ...(scopes ? { scopes } : {}),
      }
    );
    issued.push(value.id);
    return { ...value, client: new ZineClient({ baseUrl, token: value.token, retries: 0 }) };
  }
  const read = await issue();
  assert.deepEqual(read.scopes, ['library:read']);
  await read.client.list({ url });
  await assert.rejects(
    read.client.save({ url }),
    (e: unknown) => e instanceof ZineError && e.status === 403 && e.code === 'insufficient_scope'
  );
  const write = await issue(['library:read', 'library:write']);
  writer = write.client;
  const key = crypto.randomUUID();
  const receipt = await writer.save({ url, context: { text: marker } }, key);
  itemId = receipt.item.id;
  assert.deepEqual(await writer.save({ url, context: { text: marker } }, key), receipt);
  const item = await writer.item(itemId);
  assert.equal(item.occurrences.length, 1);
  assert.equal(item.context.length, 1);
  assert.equal(item.context[0].text, marker);
  assert.equal((await writer.search({ query: marker, match: 'keyword' })).items[0].id, itemId);
  assert.equal((await production.list({ url })).items.length, 0);
  const burst = await issue(['library:read']);
  // A complete 25-request burst fits one minute; avoid starting across a window boundary.
  if (Date.now() % 60000 > 45000)
    await new Promise((resolve) => setTimeout(resolve, 61000 - (Date.now() % 60000)));
  const burstAt = Date.now();
  const results = await Promise.all(
    Array.from({ length: 25 }, async () => {
      try {
        await burst.client.request('GET', '/v1/me');
        return 200;
      } catch (error) {
        assert.ok(error instanceof ZineError);
        assert.equal(error.status, 429);
        assert.equal(error.code, 'usage_limit_exceeded');
        assert.ok((error.retryAfterMs ?? 0) > 0);
        return error.status;
      }
    })
  );
  assert.equal(
    Math.floor(Date.now() / 60000),
    Math.floor(burstAt / 60000),
    'Burst crossed a usage window; rerun'
  );
  assert.equal(results.filter((s) => s === 200).length, 20);
  assert.equal(results.filter((s) => s === 429).length, 5);
  // Another caller still has allowance despite the exhausted burst key.
  assert.equal((await read.client.list({ url })).items.length, 1);
  const check = await admin.request<{
    status: { environment: string; deploymentId: string };
    alerts: unknown[];
  }>('POST', '/v1/ops/check');
  assert.equal(check.status.environment, 'staging');
  assert.equal(check.status.deploymentId, health.deploymentId);
  await admin.request('DELETE', '/v1/tokens/' + read.id);
  issued.splice(issued.indexOf(read.id), 1);
  await assert.rejects(
    read.client.list(),
    (e: unknown) => e instanceof ZineError && e.status === 401
  );
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    origin: baseUrl,
    deploymentId: health.deploymentId,
    scope:
      'Actual Cloudflare staging Worker/D1 and real Clerk sign-in; production receives read-only isolation checks. No fixture issuer or auth bypass.',
    checks: {
      readOnlyDefault: true,
      deniedWrite: true,
      idempotentSaveReadback: true,
      contextAndOccurrenceExactlyOnce: true,
      keywordRetrieval: true,
      productionIsolation: true,
      requestBurst: { attempts: 25, accepted: 20, limited: 5, retryHeader: true },
      otherCallerUnaffected: true,
      operationalStatus: true,
      immediateRevocation: true,
    },
    limits:
      'A bounded single-owner live run. Expiry, multi-owner concurrency, erasure races and external failures have separate isolated-runtime tests. Provider enrichment is asynchronous and is not asserted here.',
  };
  await writeFile('evidence/production-controls-live.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  if (itemId && writer) await writer.request('DELETE', '/v1/items/' + encodeURIComponent(itemId));
  for (const id of issued) await admin.request('DELETE', '/v1/tokens/' + id);
  await session.close();
}
