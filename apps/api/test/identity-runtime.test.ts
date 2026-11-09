import { afterEach, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
let runtime: Awaited<ReturnType<typeof runtimeHarness>> | undefined;
afterEach(async () => runtime?.close());
const outbound = (request: Request) => {
  const url = new URL(request.url);
  if (url.hostname === 'cloudflare-dns.com')
    return Response.json({
      Status: 0,
      Answer: url.searchParams.get('type') === 'AAAA' ? [] : [{ type: 1, data: '93.184.216.34' }],
    });
  if (url.hostname === 'short.example') {
    expect(request.headers.get('authorization')).toBeNull();
    return new Response(null, {
      status: 301,
      headers: { location: 'https://canonical.example/automatic' },
    });
  }
  if (url.hostname === 'canonical.example') {
    expect(request.headers.get('authorization')).toBeNull();
    return new Response(
      `<html><head><title>Canonical queue material</title></head><body><article><h1>Canonical queue material</h1><p>${'Rich source metadata survives automatic identity resolution through a real durable Worker job. '.repeat(30)}</p></article></body></html>`,
      { headers: { 'content-type': 'text/html' } }
    );
  }
  if (url.hostname === 'api.x.com') {
    expect(request.headers.get('authorization')).toBe('Bearer synthetic-provider-token');
    if (url.pathname.startsWith('/2/users/'))
      return Response.json({
        data: {
          id: '424242',
          username: 'current_handle',
          name: 'Synthetic source account',
          description: 'Provider-verified account metadata',
        },
      });
    const user = { id: '424242', username: 'current_handle', name: 'Synthetic source account' };
    if (url.pathname === '/2/tweets/search/recent') return Response.json({ data: [], meta: {} });
    if (url.pathname === '/2/tweets')
      return Response.json({
        data: [{ id: '101', text: 'Quoted source context', author_id: '424242' }],
        includes: { users: [user] },
      });
    if (['/2/tweets/100', '/2/tweets/101'].includes(url.pathname)) {
      const selected = url.pathname.endsWith('100') ? '100' : '101';
      return Response.json({
        data: {
          id: selected,
          text:
            selected === '100'
              ? 'A selected post with quoted context'
              : 'A deliberately saved quoted post',
          author_id: '424242',
          conversation_id: selected,
          ...(selected === '100' ? { referenced_tweets: [{ id: '101', type: 'quoted' }] } : {}),
        },
        includes: { users: [user] },
      });
    }
  }
  throw new Error(`Unexpected controlled upstream ${url.hostname}${url.pathname}`);
};
async function boot(owner: string) {
  runtime = await runtimeHarness({
    consumeJobs: true,
    bindings: { X_BEARER_TOKEN: 'synthetic-provider-token' },
    outbound,
  });
  const token = await runtime.token(owner);
  const running = runtime;
  return async (path: string, method = 'GET', body?: unknown) => {
    const response = await running.mf.dispatchFetch(`http://localhost/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = response.status === 204 ? null : JSON.parse(await response.text());
    expect(response.status, JSON.stringify(value)).toBeLessThan(400);
    return value;
  };
}
async function until<T>(get: () => Promise<T>, ready: (value: T) => boolean): Promise<T> {
  for (let attempt = 0; attempt < 70; attempt++) {
    const value = await get();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Controlled queue outcome did not become visible');
}
describe('automatic identity and relationship work through real Worker queue execution', () => {
  it('reconciles a permanent redirect during asynchronous extraction and enriches the canonical item', async () => {
    const request = await boot('automatic-web-identity');
    const canonical = await request('/saves', 'POST', {
      url: 'https://canonical.example/automatic',
      context: { text: 'Previously saved canonical reference' },
    });
    const source = await request('/saves', 'POST', {
      url: 'https://short.example/automatic',
      context: { text: 'Later short reference' },
    });
    const item = await until(
      () => request(`/items/${source.item.id}`),
      (v) =>
        v.id === canonical.item.id &&
        v.content.title === 'Canonical queue material' &&
        v.enrichment.components.some(
          (c: { component: string; status: string }) =>
            c.component === 'article' && c.status === 'available'
        )
    );
    expect(item.context.map((c: { text: string }) => c.text).sort()).toEqual([
      'Later short reference',
      'Previously saved canonical reference',
    ]);
    const library = await request('/items');
    expect(library.items).toHaveLength(1);
    expect(library.items[0].id).toBe(canonical.item.id);
    const events = await request(`/items/${source.item.id}/reconciliations`);
    expect(events.events).toHaveLength(1);
    expect(events.events[0].evidence.method).toBe('http-redirect');
  });
  it('resolves an account handle to its verified immutable provider ID before canonical enrichment', async () => {
    const request = await boot('automatic-profile-identity');
    const saved = await request('/saves', 'POST', {
      url: 'https://x.com/alias_handle',
      context: { text: 'Stable account reference' },
    });
    const item = await until(
      () => request(`/items/${saved.item.id}`),
      (v) =>
        v.content.url === 'https://x.com/i/user/424242' &&
        v.content.title === 'Synthetic source account'
    );
    expect(item.id).not.toBe(saved.item.id);
    expect(item.context[0].text).toBe('Stable account reference');
    expect(item.content.type).toBe('account');
    const receipts = await request(`/items/${saved.item.id}/reconciliations`);
    expect(receipts.events[0].evidence.method).toBe('platform-identifier');
    expect((await request('/items')).items).toHaveLength(1);
    expect((await request(`/items/${item.id}/relationships`)).relationships).toHaveLength(0);
  });
  it('retains direct quoted context and source relationships without implicitly saving their targets', async () => {
    const request = await boot('automatic-thread-relationships');
    const saved = await request('/saves', 'POST', { url: 'https://x.com/i/status/100' });
    const edges = await until(
      () => request(`/items/${saved.item.id}/relationships`),
      (v) => v.relationships.length === 2
    );
    expect(edges.relationships.map((r: { kind: string }) => r.kind).sort()).toEqual([
      'part_of',
      'quotes',
    ]);
    expect(
      edges.relationships.every(
        (r: {
          target: { itemId: string | null };
          provenance: { inputContributionIds: string[] };
        }) => r.target.itemId === null && r.provenance.inputContributionIds.length === 1
      )
    ).toBe(true);
    expect((await request('/items')).items).toHaveLength(1);
    const quoted = await request('/saves', 'POST', { url: 'https://x.com/i/status/101' });
    const incoming = await request(`/items/${quoted.item.id}/relationships?direction=incoming`);
    expect(incoming.relationships).toHaveLength(1);
    expect(incoming.relationships[0].kind).toBe('quotes');
    expect(incoming.relationships[0].source.itemId).toBe(saved.item.id);
    expect((await request('/items')).items).toHaveLength(2);
  });
});
