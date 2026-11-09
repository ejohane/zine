import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZineClient, ZineError } from '../client';
import { runtimeHarness } from '../scripts/runtime-harness';

describe('experience client retry and async contracts', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  beforeAll(async () => {
    runtime = await runtimeHarness();
  });
  afterAll(async () => runtime?.close());
  it('recovers a lost save acknowledgement without repeating its occurrence or context', async () => {
    const token = await runtime.token('client-owner');
    let loseAcknowledgement = true;
    const transport = (async (url: string, init: RequestInit) => {
      const response = await runtime.mf.dispatchFetch(url, {
        method: init.method,
        headers: init.headers as Record<string, string>,
        body: init.body as string | undefined,
      });
      if (init.method === 'POST' && loseAcknowledgement) {
        loseAcknowledgement = false;
        await response.text();
        throw new TypeError('Controlled connection loss after commit');
      }
      return response;
    }) as unknown as typeof fetch;
    const client = new ZineClient({ baseUrl: 'http://localhost', token, fetch: transport });
    const saved = await client.save(
      { url: 'https://example.com/client-save', context: { text: 'Durable client context' } },
      'lost-response'
    );
    const item = await client.item(saved.item.id);
    expect(item.occurrences).toHaveLength(1);
    expect(item.context).toHaveLength(1);
    expect(item.context[0].text).toBe('Durable client context');
    await client.save({ url: 'https://example.com/client-other' });
    const ids = [];
    for await (const listed of client.items({}, 1)) ids.push(listed.id);
    expect(new Set(ids).size).toBe(2);
    const search = await client.search({ query: 'Durable client', match: 'keyword' });
    expect(search.items[0].id).toBe(item.id);
  });
  it('does not retry a mutation without idempotency or sleep through a long quota reset', async () => {
    let calls = 0;
    const transport = (async () => {
      calls++;
      return Response.json(
        {
          error: {
            code: 'usage_limit_exceeded',
            message: 'Wait',
            requestId: 'fixture-request',
            details: { metric: 'requests' },
          },
        },
        { status: 429, headers: { 'retry-after': '3600' } }
      );
    }) as unknown as typeof fetch;
    const client = new ZineClient({
      baseUrl: 'https://example.com',
      token: 'fixture',
      fetch: transport,
    });
    await expect(client.request('POST', '/v1/subscriptions', {})).rejects.toMatchObject({
      status: 429,
      code: 'usage_limit_exceeded',
      retryAfterMs: 3600000,
      requestId: 'fixture-request',
    });
    expect(calls).toBe(1);
    await expect(client.list()).rejects.toBeInstanceOf(ZineError);
    expect(calls).toBe(2);
    await expect(client.request('GET', '//external.example/v1/me')).rejects.toThrow(
      'Only /v1/ paths'
    );
    expect(calls).toBe(2);
  });
  it('returns a failed job as a terminal outcome instead of implying enrichment succeeded', async () => {
    const transport = (async () =>
      Response.json({
        id: 'job-fixture',
        kind: 'enrich',
        itemId: 'item-fixture',
        status: 'failed',
        attempts: 1,
        errorCode: 'provider_unavailable',
        availableAt: new Date().toISOString(),
      })) as typeof fetch;
    const client = new ZineClient({
      baseUrl: 'https://example.com',
      token: 'fixture',
      fetch: transport,
    });
    expect(await client.waitForJob('job-fixture')).toMatchObject({
      status: 'failed',
      errorCode: 'provider_unavailable',
    });
  });
});
