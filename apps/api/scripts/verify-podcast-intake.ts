import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
const subscriptionId = 'sub_f3a57d8b2bbc4e10bf7e88d2658a78ae';
const session = await realSession();
const observations: {
  operation: string;
  status: number;
  requestId: string | null;
  responseSha256: string;
}[] = [];
async function call(operation: string, path: string, method = 'GET') {
  const response = await fetch(`https://api-next.myzine.app${path}`, {
    method,
    headers: { authorization: `Bearer ${await session.getToken()}` },
    signal: AbortSignal.timeout(30000),
  });
  const body = JSON.parse(await response.text());
  observations.push({
    operation,
    status: response.status,
    requestId: response.headers.get('x-request-id'),
    responseSha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
  });
  return { status: response.status, body };
}
try {
  const subscription = await call('subscription-status', `/v1/subscriptions/${subscriptionId}`);
  assert.equal(subscription.status, 200);
  assert.equal(subscription.body.initialized, true);
  assert.equal(subscription.body.autoSave, true);
  const arrivals = await call(
    'automatic-intake',
    `/v1/items?subscriptionId=${subscriptionId}&status=saved&limit=10`
  );
  assert.equal(arrivals.status, 200);
  assert.equal(arrivals.body.items.length, 1);
  const item = arrivals.body.items[0];
  assert.equal(item.content.type, 'podcast_episode');
  const transcript = await call('retained-publisher-transcript', `/v1/items/${item.id}/transcript`);
  assert.equal(transcript.status, 200);
  const segments = transcript.body.value.segments as {
    text: string;
    startSeconds?: number;
    endSeconds?: number;
  }[];
  assert.ok(segments.length > 100);
  const timed = segments.filter((segment) => segment.startSeconds !== undefined);
  assert.ok(timed.length > 100);
  assert.equal(transcript.body.provenance.provenance.method, 'published-transcript');
  const resync = await call(
    'explicit-repeat-poll',
    `/v1/subscriptions/${subscriptionId}/sync`,
    'POST'
  );
  assert.equal(resync.status, 202);
  let status = 'pending';
  for (let attempt = 0; attempt < 30; attempt++) {
    const job = await call('repeat-poll-job', `/v1/jobs/${resync.body.jobId}`);
    status = job.body.status;
    if (status === 'succeeded' || status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(status, 'succeeded');
  const again = await call(
    'repeat-poll-no-duplicates',
    `/v1/items?subscriptionId=${subscriptionId}&status=saved&limit=10`
  );
  assert.equal(again.body.items.length, 1);
  assert.equal(again.body.items[0].id, item.id);
  const summary = again.body.items[0].enrichment.fields.summary?.provenance;
  const report = {
    at: new Date().toISOString(),
    origin: 'https://api-next.myzine.app',
    authentication: 'real Clerk session',
    actualPublishedFeed: true,
    automaticSavedItems: 1,
    transcript: {
      segments: segments.length,
      timedSegments: timed.length,
      firstTimestamp: timed[0].startSeconds,
      lastTimestamp: timed.at(-1)!.endSeconds ?? timed.at(-1)!.startSeconds,
      sourceMethod: 'published-transcript',
    },
    repeatPollNoDuplicates: true,
    understandingCoverageAtCheck: summary?.coverage ?? null,
    observations,
  };
  await writeFile('evidence/podcast-intake.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      segments: segments.length,
      timedSegments: timed.length,
      repeatPollNoDuplicates: true,
      understandingCoverageAtCheck: summary?.coverage ?? null,
    })
  );
} finally {
  await session.close();
}
