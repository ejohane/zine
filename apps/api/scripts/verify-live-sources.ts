import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
const session = await realSession();
const observations: unknown[] = [];
interface ApiResponse {
  error?: { code: string };
  items: { id: string }[];
  subscriptions: { id: string; sourceId: string }[];
  id: string;
  sourceId: string;
  routes: { id: string }[];
  jobId: string;
  status: string;
  initialized: boolean;
}
async function call(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(`https://api-next.myzine.app${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await session.getToken()}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const value = (await r.json()) as ApiResponse;
  observations.push({
    path,
    method,
    status: r.status,
    requestId: r.headers.get('x-request-id'),
    responseSha256: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  });
  assert.ok(r.ok, `${method} ${path}: ${r.status} ${value.error?.code ?? ''}`);
  return value;
}
async function wait(jobId: string) {
  for (let i = 0; i < 45; i++) {
    const job = await call(`/v1/jobs/${jobId}`);
    if (job.status === 'succeeded' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Job did not finish within observation window');
}
try {
  const sourceId = 'src_b5bf0266ca164215b4e5591a801129ba887572e3';
  const bySource = await call(`/v1/items?sourceId=${sourceId}&status=saved&limit=100`);
  assert.ok(
    bySource.items.length > 1,
    'Source filter must include one-off saves as well as subscription arrivals'
  );
  const xSubscriptionId = 'sub_3be673302825459ebf77905e375d062e';
  const xSub = await call(`/v1/subscriptions/${xSubscriptionId}`);
  const xIntake = await call(
    `/v1/items?subscriptionId=${xSubscriptionId}&status=received&limit=100`
  );
  assert.equal(xSub.initialized, true);
  assert.ok(xIntake.items.length >= 1);
  const xPoll = await call(`/v1/subscriptions/${xSubscriptionId}/sync`, 'POST');
  const xJob = await wait(xPoll.jobId);
  const xRepeat = await call(
    `/v1/items?subscriptionId=${xSubscriptionId}&status=received&limit=100`
  );
  assert.equal(xJob.status, 'succeeded');
  assert.ok(xIntake.items.every((before) => xRepeat.items.some((after) => after.id === before.id)));
  assert.equal(new Set(xRepeat.items.map((item) => item.id)).size, xRepeat.items.length);
  const listing = await call('/v1/subscriptions?limit=100');
  let sub = listing.subscriptions.find(
    (s) => s.sourceId === 'src_5288f0bcfd8be936d4be721c49ee2dfad5ec8b6c'
  );
  if (!sub) {
    const source = await call('/v1/sources/resolve', 'POST', {
      url: 'https://buildinghealthier.substack.com',
    });
    sub = await call('/v1/subscriptions', 'POST', {
      sourceId: source.id,
      routeId: source.routes[0].id,
      autoSave: false,
    });
  }
  const sync = await call(`/v1/subscriptions/${sub.id}/sync`, 'POST');
  const job = await wait(sync.jobId);
  const substackReceived = await call(
    `/v1/items?subscriptionId=${sub.id}&status=received&limit=100`
  );
  const substackSaved = await call(`/v1/items?subscriptionId=${sub.id}&status=saved&limit=100`);
  const substack = { items: [...substackReceived.items, ...substackSaved.items] };
  assert.equal(job.status, 'succeeded');
  assert.equal(substack.items.length, 1);
  const resync = await call(`/v1/subscriptions/${sub.id}/sync`, 'POST');
  const repeat = await wait(resync.jobId);
  assert.equal(repeat.status, 'succeeded');
  const againReceived = await call(`/v1/items?subscriptionId=${sub.id}&status=received&limit=100`);
  const againSaved = await call(`/v1/items?subscriptionId=${sub.id}&status=saved&limit=100`);
  const again = { items: [...againReceived.items, ...againSaved.items] };
  assert.equal(again.items.length, 1);
  assert.equal(again.items[0].id, substack.items[0].id);
  const youtubeSub = 'sub_8d8644123a58489ba39c5be96df0bb00';
  let youtubeStatus = await call(`/v1/subscriptions/${youtubeSub}`);
  for (let attempt = 0; !youtubeStatus.initialized && attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    youtubeStatus = await call(`/v1/subscriptions/${youtubeSub}`);
  }
  assert.equal(youtubeStatus.initialized, true);
  const youtubeReceived = await call(
    `/v1/items?subscriptionId=${youtubeSub}&status=received&limit=100`
  );
  const youtubeSaved = await call(`/v1/items?subscriptionId=${youtubeSub}&status=saved&limit=100`);
  const youtubeItems = [...youtubeReceived.items, ...youtubeSaved.items];
  assert.equal(youtubeItems.length, 1);
  const youtubeSync = await call(`/v1/subscriptions/${youtubeSub}/sync`, 'POST');
  assert.equal((await wait(youtubeSync.jobId)).status, 'succeeded');
  const youtubeAgainReceived = await call(
    `/v1/items?subscriptionId=${youtubeSub}&status=received&limit=100`
  );
  const youtubeAgainSaved = await call(
    `/v1/items?subscriptionId=${youtubeSub}&status=saved&limit=100`
  );
  const youtubeAgain = [...youtubeAgainReceived.items, ...youtubeAgainSaved.items];
  assert.deepEqual(
    youtubeAgain.map((i) => i.id),
    youtubeItems.map((i) => i.id)
  );
  const report = {
    at: new Date().toISOString(),
    origin: 'https://api-next.myzine.app',
    authentication: 'real Clerk session',
    sourceFilterItems: bySource.items.length,
    x: {
      observedItems: xIntake.items.length,
      afterRepeat: xRepeat.items.length,
      newArrivals: xRepeat.items.length - xIntake.items.length,
      retainedPriorItems: true,
      repeatNoDuplicates: true,
    },
    substack: { latestItems: 1, repeatNoDuplicates: true },
    youtube: { route: 'public channel feed', latestItems: 1, repeatNoDuplicates: true },
    observations,
  };
  await writeFile('evidence/live-sources.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      sourceFilterItems: bySource.items.length,
      x: report.x,
      substack: report.substack,
      youtube: report.youtube,
    })
  );
} catch (error) {
  await writeFile(
    'evidence/latest-source-attempt.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        allAssertionsPassed: false,
        observations,
        error: error instanceof Error ? error.message : 'verification_failed',
      },
      null,
      2
    ) + '\n'
  );
  throw error;
} finally {
  await session.close();
}
