import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { runtimeHarness } from '../scripts/runtime-harness';
import { proxiedImageUrl } from '../src/image-proxy';

const SECRET = 'synthetic-image-proxy-secret';
const ORIGIN = 'http://localhost';
const COVER = 'https://images.example/cover.png?size=large&v=2';
const AVATAR = 'https://images.example/avatar.png';

describe('image references at the HTTP response boundary', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let token: string;
  let itemId: string;
  let collectionId: string;
  let cover: string;
  let avatar: string;
  type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  async function call(
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {}
  ) {
    const response = await runtime.mf.dispatchFetch(`${ORIGIN}/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, text, body: (text ? JSON.parse(text) : null) as Json };
  }
  const expectRewritten = (content: Json) => {
    expect(content.thumbnail).toBe(cover);
    expect(content.creatorImageUrl).toBe(avatar);
  };

  beforeAll(async () => {
    runtime = await runtimeHarness({ bindings: { IMAGE_PROXY_SECRET: SECRET } });
    token = await runtime.token('image-owner');
    cover = await proxiedImageUrl(SECRET, ORIGIN, COVER);
    avatar = await proxiedImageUrl(SECRET, ORIGIN, AVATAR);
    const saved = await call('/saves', 'POST', { url: 'https://example.com/with-images' });
    expect(saved.status).toBe(201);
    itemId = saved.body.item.id;
    for (const [field, value] of [
      ['thumbnail', COVER],
      ['creatorImageUrl', AVATAR],
      ['structuredData', [{ '@type': 'Article', thumbnail: COVER, creatorImageUrl: AVATAR }]],
    ] as const)
      expect(
        (
          await call(`/items/${itemId}/enrichment`, 'POST', {
            field,
            value,
            provenance: { method: 'test-fixture' },
          })
        ).status
      ).toBe(201);
    const collection = await call('/collections', 'POST', { name: 'Pictures' });
    expect(collection.status).toBe(201);
    collectionId = collection.body.id;
    expect((await call(`/collections/${collectionId}/items/${itemId}`, 'PUT', {})).status).toBe(
      200
    );
  });
  afterAll(async () => runtime?.close());

  it('rewrites item detail but returns publisher structured data untouched', async () => {
    const item = await call(`/items/${itemId}?include=structuredData`);
    expect(item.status).toBe(200);
    expectRewritten(item.body.content);
    expect(item.body.content.url).toBe('https://example.com/with-images');
    expect(item.body.content.structuredData).toEqual([
      { '@type': 'Article', thumbnail: COVER, creatorImageUrl: AVATAR },
    ]);
  });

  it('rewrites the item list and search results', async () => {
    const list = await call('/items');
    expect(list.status).toBe(200);
    expectRewritten(list.body.items.find((item: Json) => item.id === itemId).content);
    const search = await call('/items/search', 'POST', { query: 'with-images', match: 'keyword' });
    expect(search.status).toBe(200);
    expect(search.text).not.toContain(`"thumbnail":"${COVER}"`);
    expect(search.text).not.toContain(`"creatorImageUrl":"${AVATAR}"`);
  });

  it('rewrites Home, its preview and Home after publishing an edition', async () => {
    const home = await call('/home');
    expect(home.status).toBe(200);
    const cards = home.body.sections.flatMap((section: Json) => section.cards);
    expectRewritten(cards.find((card: Json) => card.id === itemId).content);
    const draft = { leadBeforeRecent: false, collections: [] };
    // Publishing returns only the edition receipt; the cards are read back through Home.
    expect((await call('/home/edition', 'PUT', { draft, expectedEditionId: null })).status).toBe(
      200
    );
    for (const response of [await call('/home/preview', 'POST', draft), await call('/home')]) {
      expect(response.status).toBe(200);
      const live = response.body.sections.flatMap((section: Json) => section.cards);
      expectRewritten(live.find((card: Json) => card.id === itemId).content);
    }
  });

  it('rewrites collection items', async () => {
    const members = await call(`/collections/${collectionId}/items`);
    expect(members.status).toBe(200);
    expectRewritten(members.body.items[0].item.content);
  });

  it('rewrites item mutations that return the item', async () => {
    const patched = await call(`/items/${itemId}`, 'PATCH', { tags: ['pictured'] });
    expect(patched.status).toBe(200);
    expect(patched.text).not.toContain(`"thumbnail":"${COVER}"`);
    const progress = await call(`/items/${itemId}/progress`, 'PATCH', {
      position: 0.2,
      unit: 'fraction',
    });
    expect(progress.status).toBe(200);
    expect(progress.text).not.toContain(`"thumbnail":"${COVER}"`);
  });

  it('serves the rewritten reference without a bearer token', async () => {
    // The harness has no outbound source, so only the signature gate is asserted here.
    const unsigned = await runtime.mf.dispatchFetch(cover.replace(/&s=.*/, ''));
    expect(unsigned.status).toBe(403);
  });

  it('keeps original URLs in stored state, exports and the idempotency record', async () => {
    const stored = await runtime.db
      .prepare(
        "SELECT value_json FROM contributions WHERE field IN ('thumbnail','creatorImageUrl')"
      )
      .all<{ value_json: string }>();
    expect(stored.results.map((row) => JSON.parse(row.value_json)).sort()).toEqual(
      [AVATAR, COVER].sort()
    );
    const exported = await call('/export/enrichment');
    expect(exported.status).toBe(200);
    expect(exported.text).toContain(COVER);
    expect(exported.text).not.toContain('/v1/img');
    const raw = await call(`/items/${itemId}`, 'GET', undefined, { 'x-zine-raw-images': '1' });
    expect(raw.body.content.thumbnail).toBe(COVER);
    expect(raw.body.content.creatorImageUrl).toBe(AVATAR);

    const key = { 'idempotency-key': 'image-save' };
    const input = { url: 'https://example.com/idempotent-images' };
    const first = await call('/saves', 'POST', input, key);
    const replay = await call('/saves', 'POST', input, key);
    expect(first.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    const record = await runtime.db
      .prepare('SELECT response_json FROM idempotency WHERE key=?')
      .bind('image-save')
      .first<{ response_json: string }>();
    expect(JSON.parse(record!.response_json)).toEqual(first.body);
    expect(record!.response_json).not.toContain('/v1/img');
  });

  it('gives MCP agents the original source URLs', async () => {
    const client = new Client({ name: 'zine-image-verifier', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const response = await runtime.mf.dispatchFetch(request.url, {
            method: request.method,
            headers: Object.fromEntries(request.headers),
            body: request.body ? await request.arrayBuffer() : undefined,
          });
          return new Response(await response.arrayBuffer(), {
            status: response.status,
            headers: Object.fromEntries(response.headers),
          });
        },
      })
    );
    try {
      const read = await client.callTool({ name: 'zine_get_item', arguments: { itemId } });
      const result = (read.structuredContent as { result: Json }).result;
      expect(result.content.thumbnail).toBe(COVER);
      expect(result.content.creatorImageUrl).toBe(AVATAR);
    } finally {
      await client.close();
    }
  });
});
