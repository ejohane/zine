import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { createWebhook, deliverWebhook, eventPage, fanoutWebhook } from '../src/events';
import { webhookSignature, openWebhookSecret } from '../src/webhook-crypto';
import { save, saveSchema } from '../src/items';
import { eraseAccountData } from '../src/portability';
import { now, stmt } from '../src/lib';
import type { Env } from '../src/types';

describe('transactional event replay and signed delivery', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>, env: Env;
  const received: { headers: Headers; body: string }[] = [];
  let receiverStatus = 200,
    releaseDns: (() => void) | undefined,
    enteredDns: (() => void) | undefined;
  async function outbound(request: Request | string | URL, init?: RequestInit) {
    const req = request instanceof Request ? request : new Request(request, init);
    if (new URL(req.url).hostname === 'cloudflare-dns.com') {
      if (releaseDns === undefined && enteredDns) {
        const entered = enteredDns;
        enteredDns = undefined;
        await new Promise<void>((resolve) => {
          releaseDns = resolve;
          entered();
        });
      }
      return Response.json({ Answer: [{ type: 1, data: '93.184.216.34' }] });
    }
    received.push({ headers: req.headers, body: await req.text() });
    return new Response(receiverStatus === 204 ? null : 'receiver fixture', {
      status: receiverStatus,
    });
  }
  beforeAll(async () => {
    const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    runtime = await runtimeHarness({
      bindings: { CREDENTIAL_KEY: key },
      outbound: (request) => outbound(request as unknown as Request) as never,
    });
    env = {
      DB: runtime.db,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
      JOBS: await runtime.mf.getQueueProducer('JOBS'),
      CREDENTIAL_KEY: key,
    } as Env;
    vi.stubGlobal('fetch', outbound);
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await runtime?.close();
  });
  async function hook(owner: string) {
    const created = await createWebhook(env, owner, 'https://receiver.example.com/hook');
    const row = await stmt(env.DB, 'SELECT * FROM webhooks WHERE id=?', created.id).first<
      Parameters<typeof fanoutWebhook>[1]
    >();
    return { created, row: row! };
  }
  async function capture(owner: string, path: string) {
    return save(
      env,
      { userId: owner, contributor: 'fixture' },
      saveSchema.parse({
        url: 'https://example.com/' + path,
        context: { text: 'Private context must not enter webhook payload' },
      })
    );
  }
  async function pending(hookId: string) {
    return (await stmt(
      env.DB,
      'SELECT id FROM webhook_deliveries WHERE webhook_id=? ORDER BY event_sequence LIMIT 1',
      hookId
    ).first<{ id: string }>())!.id;
  }
  it('records changes atomically, pages only owner events and does not duplicate an idempotent save', async () => {
    const owner = 'events-owner',
      key = 'events-idempotency';
    const input = saveSchema.parse({
      url: 'https://example.com/events-replay',
      context: { text: 'Private replay context' },
    });
    await save(env, { userId: owner, contributor: 'fixture' }, input, key);
    const first = await eventPage(env, owner, 0, 1);
    expect(first.events).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    const second = await eventPage(env, owner, Number(first.nextCursor), 1);
    expect(second.events).toHaveLength(1);
    const count = await stmt(
      env.DB,
      'SELECT COUNT(*) AS n FROM service_events WHERE owner_id=?',
      owner
    ).first<number>('n');
    await save(env, { userId: owner, contributor: 'fixture' }, input, key);
    expect(
      await stmt(
        env.DB,
        'SELECT COUNT(*) AS n FROM service_events WHERE owner_id=?',
        owner
      ).first<number>('n')
    ).toBe(count);
    expect((await eventPage(env, 'another-owner')).events).toEqual([]);
    await stmt(
      env.DB,
      "INSERT INTO content_items(id,identity_key,canonical_url,platform,kind,created_at) VALUES('event-rollback-content','event-rollback','https://example.com/rollback','web','article',?)",
      now()
    ).run();
    await expect(
      env.DB.batch([
        stmt(
          env.DB,
          "INSERT INTO personal_items(id,owner_id,content_id,status,created_at,updated_at) VALUES('event-rollback-item',?,'event-rollback-content','saved',?,?)",
          owner,
          now(),
          now()
        ),
        stmt(env.DB, "INSERT INTO write_guards(id,valid) VALUES('event-rollback',0)"),
      ])
    ).rejects.toThrow();
    expect(
      await stmt(
        env.DB,
        'SELECT COUNT(*) AS n FROM service_events WHERE owner_id=?',
        owner
      ).first<number>('n')
    ).toBe(count);
  });
  it('signs a stable delivery, retries a failed response and claims concurrent work once', async () => {
    const owner = 'webhook-retry',
      { created, row } = await hook(owner);
    await capture(owner, 'webhook-retry');
    await fanoutWebhook(env, row);
    const deliveryId = await pending(created.id),
      start = received.length;
    receiverStatus = 503;
    await deliverWebhook(env, deliveryId);
    let delivery = await stmt(
      env.DB,
      'SELECT * FROM webhook_deliveries WHERE id=?',
      deliveryId
    ).first();
    expect(delivery).toMatchObject({ status: 'pending', attempts: 1, http_status: 503 });
    await deliverWebhook(env, deliveryId);
    expect(received.length - start).toBe(1);
    await stmt(
      env.DB,
      'UPDATE webhook_deliveries SET available_at=? WHERE id=?',
      now(),
      deliveryId
    ).run();
    receiverStatus = 204;
    await Promise.all([deliverWebhook(env, deliveryId), deliverWebhook(env, deliveryId)]);
    delivery = await stmt(
      env.DB,
      'SELECT * FROM webhook_deliveries WHERE id=?',
      deliveryId
    ).first();
    expect(delivery).toMatchObject({ status: 'succeeded', attempts: 2, http_status: 204 });
    expect(received.length - start).toBe(2);
    for (const call of received.slice(start)) {
      const timestamp = call.headers.get('x-zine-timestamp')!;
      expect(call.headers.get('x-zine-delivery')).toBe(deliveryId);
      expect(call.headers.get('x-zine-signature')).toBe(
        await webhookSignature(created.secret, timestamp, call.body)
      );
      expect(call.headers.has('authorization')).toBe(false);
      expect(call.body).not.toContain('Private context');
    }
    expect(received[start].body).toBe(received[start + 1].body);
    const encrypted = (await stmt(
      env.DB,
      'SELECT secret_envelope FROM webhooks WHERE id=?',
      created.id
    ).first<string>('secret_envelope'))!;
    expect(encrypted).not.toContain(created.secret);
    await expect(
      openWebhookSecret(env, 'different-owner', created.id, encrypted)
    ).rejects.toThrow();
    await expect(openWebhookSecret(env, owner, 'different-hook', encrypted)).rejects.toThrow();
  });
  it('does not follow redirects or send to private destinations', async () => {
    for (const url of ['http://receiver.example.com', 'https://127.0.0.1/', 'https://localhost/'])
      await expect(createWebhook(env, 'unsafe-hook', url)).rejects.toMatchObject({
        code: 'unsafe_url',
      });
    const { created, row } = await hook('webhook-redirect');
    await capture('webhook-redirect', 'redirect');
    await fanoutWebhook(env, row);
    receiverStatus = 302;
    const start = received.length;
    await deliverWebhook(env, await pending(created.id));
    expect(received.length - start).toBe(1);
    expect(
      await stmt(
        env.DB,
        'SELECT error_code FROM webhook_deliveries WHERE webhook_id=? ORDER BY event_sequence LIMIT 1',
        created.id
      ).first<string>('error_code')
    ).toBe('webhook_redirect_rejected');
    receiverStatus = 200;
  });
  it('fences a delivery whose DNS await crosses account erasure', async () => {
    const owner = 'webhook-erasure',
      { created, row } = await hook(owner);
    await capture(owner, 'erasure');
    await fanoutWebhook(env, row);
    const deliveryId = await pending(created.id),
      start = received.length;
    const entered = new Promise<void>((resolve) => {
      enteredDns = resolve;
    });
    const delivering = deliverWebhook(env, deliveryId);
    await entered;
    await eraseAccountData(env, owner);
    releaseDns!();
    releaseDns = undefined;
    await delivering;
    expect(received.length).toBe(start);
    for (const table of ['webhooks', 'webhook_deliveries', 'service_events'])
      expect(
        await stmt(
          env.DB,
          `SELECT COUNT(*) AS n FROM ${table} WHERE owner_id=?`,
          owner
        ).first<number>('n')
      ).toBe(0);
  });
  it('protects replay and webhook management with scopes and cancels disabled work', async () => {
    const owner = 'webhook-scopes',
      session = await runtime.token(owner);
    async function request(path: string, method = 'GET', body?: unknown, token = session) {
      const response = await runtime.mf.dispatchFetch('http://localhost/v1' + path, {
        method,
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: response.status,
        body: response.status === 204 ? undefined : JSON.parse(await response.text()),
      };
    }
    const read = await request('/tokens', 'POST', {
      name: 'event reader',
      scopes: ['events:read'],
    });
    const { created, row } = await hook(owner);
    await capture(owner, 'scoped');
    await fanoutWebhook(env, row);
    expect((await request('/events', 'GET', undefined, read.body.token)).status).toBe(200);
    expect((await request('/webhooks', 'GET', undefined, read.body.token)).status).toBe(403);
    const disabled = await request('/webhooks/' + created.id, 'PATCH', { enabled: false });
    expect(disabled.status).toBe(200);
    const start = received.length;
    await deliverWebhook(env, await pending(created.id));
    expect(received.length).toBe(start);
    expect(
      await stmt(
        env.DB,
        'SELECT status FROM webhook_deliveries WHERE webhook_id=? LIMIT 1',
        created.id
      ).first<string>('status')
    ).toBe('cancelled');
    expect(JSON.stringify((await request('/webhooks')).body)).not.toContain('secret');
  });
  it('caps retries and defers quota-limited delivery without consuming failure attempts', async () => {
    const owner = 'webhook-quota',
      { created, row } = await hook(owner);
    await capture(owner, 'quota');
    await fanoutWebhook(env, row);
    const deliveries = await stmt(
      env.DB,
      'SELECT id FROM webhook_deliveries WHERE webhook_id=? ORDER BY event_sequence',
      created.id
    ).all<{ id: string }>();
    const limited = { ...env, USAGE_LIMITS_JSON: JSON.stringify({ webhookDeliveriesPerDay: 1 }) };
    receiverStatus = 200;
    await deliverWebhook(limited, deliveries.results[0].id);
    const start = received.length;
    await deliverWebhook(limited, deliveries.results[1].id);
    expect(received.length).toBe(start);
    expect(
      await stmt(
        env.DB,
        'SELECT status,attempts,error_code FROM webhook_deliveries WHERE id=?',
        deliveries.results[1].id
      ).first()
    ).toMatchObject({ status: 'pending', attempts: 0, error_code: 'usage_limit_exceeded' });
    await stmt(
      env.DB,
      'UPDATE webhook_deliveries SET attempts=7,available_at=? WHERE id=?',
      now(),
      deliveries.results[1].id
    ).run();
    receiverStatus = 503;
    await deliverWebhook(env, deliveries.results[1].id);
    expect(
      await stmt(
        env.DB,
        'SELECT status,attempts FROM webhook_deliveries WHERE id=?',
        deliveries.results[1].id
      ).first()
    ).toMatchObject({ status: 'failed', attempts: 8 });
    receiverStatus = 200;
  });
  it('reports replay expiry and disables a webhook whose retained history has a gap', async () => {
    const { created, row } = await hook('webhook-retention');
    const floor = (row as Parameters<typeof fanoutWebhook>[1]).last_sequence + 1;
    await stmt(
      env.DB,
      "INSERT INTO event_retention(owner_id,min_sequence) VALUES('webhook-retention',?) ON CONFLICT(owner_id) DO UPDATE SET min_sequence=excluded.min_sequence",
      floor
    ).run();
    await expect(eventPage(env, 'webhook-retention', floor - 1 || 1)).rejects.toMatchObject({
      code: 'event_cursor_expired',
    });
    await fanoutWebhook(env, row);
    expect(
      await stmt(
        env.DB,
        'SELECT enabled,last_error_code FROM webhooks WHERE id=?',
        created.id
      ).first()
    ).toMatchObject({ enabled: 0, last_error_code: 'event_retention_gap' });
  });
});
