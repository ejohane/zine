import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';
import { ZineClient } from '../client';
const baseUrl = 'https://api-next-staging.myzine.app';
const receiver = 'https://zine-api-next-webhook-proof.yw9bvbwb9f.workers.dev';
const session = await realSession(),
  client = new ZineClient({ baseUrl, token: session.getToken, retries: 0 });
const readToken = crypto.randomUUID() + crypto.randomUUID();
let hookId: string | undefined, itemId: string | undefined;
const startedAt = new Date().toISOString();
try {
  const hook = await client.request<{ id: string; secret: string }>('POST', '/v1/webhooks', {
    url: receiver + '/hook',
  });
  hookId = hook.id;
  const child = spawn(
    'bunx',
    ['wrangler@4.158.0', 'secret', 'bulk', '--config', 'verification/wrangler.receiver.jsonc'],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  child.stdout.resume();
  child.stderr.resume();
  child.stdin.end(JSON.stringify({ SIGNING_SECRET: hook.secret, READ_TOKEN: readToken }));
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
  assert.equal(code, 0, 'Verifier secret configuration failed; output suppressed');
  let receiverStatus = 503;
  for (let attempt = 0; attempt < 20; attempt++) {
    receiverStatus = (
      await fetch(receiver + '/proof/ready', { headers: { authorization: 'Bearer ' + readToken } })
    ).status;
    if (receiverStatus === 404) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(receiverStatus, 404, 'Verifier secrets did not become active');
  assert.equal((await fetch(receiver + '/proof/unauthorized')).status, 401);
  assert.equal(
    (await fetch(receiver + '/hook', { method: 'POST', body: 'untrusted' })).status,
    401
  );
  const marker = 'webhook-proof-' + crypto.randomUUID();
  const saved = await client.save({
    url: 'https://example.com/' + marker,
    context: { text: marker },
  });
  itemId = saved.item.id;
  const replay = await client.request<{
    events: { id: string; subjectId: string }[];
    nextCursor: string;
  }>('GET', '/v1/events?limit=100');
  assert.ok(replay.events.some((e) => e.subjectId === itemId));
  const dispatch = await client.request<{ accepted: boolean; candidates: number }>(
    'POST',
    '/v1/webhooks/' + hookId + '/dispatch'
  );
  assert.equal(dispatch.accepted, true);
  assert.ok(dispatch.candidates > 0);
  let proof:
    | {
        deliveryId: string;
        eventId: string;
        bodySha256: string;
        attempts: number;
        accepted: number;
        firstSeenAt: string;
        lastSeenAt: string;
      }
    | undefined;
  let deliveryId: string | undefined;
  const until = Date.now() + 12 * 60000;
  while (Date.now() < until) {
    const page = await client.request<{
      deliveries: { id: string; status: string; attempts: number; httpStatus: number | null }[];
    }>('GET', '/v1/webhooks/' + hookId + '/deliveries');
    deliveryId ??= page.deliveries[0]?.id;
    if (deliveryId) {
      const response = await fetch(receiver + '/proof/' + encodeURIComponent(deliveryId), {
        headers: { authorization: 'Bearer ' + readToken },
      });
      if (response.ok) proof = (await response.json()) as typeof proof;
      const delivery = page.deliveries.find((d) => d.id === deliveryId);
      if (proof && proof.accepted === 1 && delivery?.status === 'succeeded') {
        assert.ok(proof.attempts >= 2);
        assert.ok(delivery.attempts >= 2);
        assert.equal(delivery.httpStatus, 204);
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  assert.ok(
    proof && proof.accepted === 1 && proof.attempts >= 2,
    'A scheduled signed retry was not observed before the deadline'
  );
  assert.ok(
    Date.parse(proof.lastSeenAt) - Date.parse(proof.firstSeenAt) >= 60000,
    'Retry delay must be honored'
  );
  const metadata = await client.request<{ webhooks: unknown[] }>('GET', '/v1/webhooks');
  assert.ok(!JSON.stringify(metadata).includes(hook.secret));
  const health = (await fetch(baseUrl + '/health').then((r) => r.json())) as {
    deploymentId: string;
  };
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    origin: baseUrl,
    receiver,
    deploymentId: health.deploymentId,
    scope:
      'Real Clerk, Cloudflare staging D1, a separately deployed Cloudflare receiver, and scheduled retry. The receiver intentionally returned 503 on the first valid signature and 204 on retry; no manual second dispatch.',
    checks: {
      transactionalReplay: true,
      signingSecretNotListed: true,
      receiverRejectsAnonymousProofRead: true,
      receiverRejectsUnsignedDelivery: true,
      signedDeliveryAccepted: true,
      stableDeliveryId: proof.deliveryId,
      bodySha256: proof.bodySha256,
      receiverAttempts: proof.attempts,
      firstAttemptAt: proof.firstSeenAt,
      retriedAt: proof.lastSeenAt,
      retryDelayHonored: true,
      deliveryMarkedSucceeded: true,
    },
    limits:
      'Controlled receiver failure demonstrates bounded at-least-once behavior. Concurrent cancellation/erasure, private URLs, redirects and quota exhaustion are tested separately in the isolated runtime. This does not promise exactly-once external side effects.',
  };
  await writeFile('evidence/webhooks-live.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  const cleanup = [];
  if (hookId) cleanup.push(client.request('DELETE', '/v1/webhooks/' + hookId));
  if (itemId) cleanup.push(client.request('DELETE', '/v1/items/' + itemId));
  const results = await Promise.allSettled(cleanup);
  await session.close();
  assert.ok(
    results.every((r) => r.status === 'fulfilled'),
    'Verifier cleanup failed; inspect staging owned hooks/items'
  );
}
