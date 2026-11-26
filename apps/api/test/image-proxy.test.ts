import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { itemImageUrl, rewriteImages } from '../src/image-proxy';
import { digest } from '../src/lib';

const ORIGIN = 'https://api.test';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const ITEM = `itm_${'a1'.repeat(20)}`;

describe('image reference rewriting', () => {
  it('points an item or card at its own proxy route, with a version derived from the URL', async () => {
    const cover = 'https://images.example/cover.png';
    const reference = await itemImageUrl(ORIGIN, ITEM, 'thumbnail', cover);
    expect(reference).toBe(
      `${ORIGIN}/v1/img/items/${ITEM}/thumbnail?v=${(await digest(cover)).slice(0, 8)}`
    );
    expect(reference).toMatch(/\?v=[a-f0-9]{8}$/);
    expect(reference).not.toContain('images.example');
    expect(await itemImageUrl(ORIGIN, ITEM, 'thumbnail', `${cover}?2`)).not.toBe(reference);
    expect(await itemImageUrl(ORIGIN, ITEM, 'creator', cover)).toContain(`/${ITEM}/creator?v=`);
  });

  it('rewrites only fields owned by an identifiable item, skips blobs and never double-wraps', async () => {
    const cover = 'https://images.example/cover.png';
    const avatar = 'https://images.example/avatar.png';
    const body = {
      items: [
        {
          id: ITEM,
          content: {
            id: 'cnt_1',
            url: 'https://publisher.example/article',
            thumbnail: cover,
            creatorImageUrl: avatar,
            structuredData: [{ thumbnail: cover }],
            raw: { thumbnail: cover },
            article: { thumbnail: cover },
            thread: { posts: [{ creatorImageUrl: avatar }] },
            transcript: { thumbnail: cover },
            members: [{ thumbnail: cover, creatorImageUrl: null }],
          },
        },
        {
          id: ITEM,
          content: { thumbnail: 'not a url', creatorImageUrl: 'data:image/png;base64,AA' },
        },
        { id: ITEM, content: { thumbnail: null } },
      ],
      // No item id, a foreign id shape, or no content object: nothing to key a route on.
      loose: { thumbnail: cover, creatorImageUrl: avatar },
      other: { id: 'col_123', content: { thumbnail: cover } },
      malformed: { id: 'itm_../../x', content: { thumbnail: cover } },
    };
    const once = await rewriteImages(body, ORIGIN);
    const content = once.items[0].content;
    expect(content.thumbnail).toBe(await itemImageUrl(ORIGIN, ITEM, 'thumbnail', cover));
    expect(content.creatorImageUrl).toBe(await itemImageUrl(ORIGIN, ITEM, 'creator', avatar));
    expect(content.url).toBe('https://publisher.example/article');
    for (const field of [
      'structuredData',
      'raw',
      'article',
      'thread',
      'transcript',
      'members',
    ] as const)
      expect(content[field]).toEqual(body.items[0].content[field]);
    expect(once.items.slice(1)).toEqual(body.items.slice(1));
    expect(once.loose).toEqual(body.loose);
    expect(once.other).toEqual(body.other);
    expect(once.malformed).toEqual(body.malformed);
    // The input is not mutated, and a second pass leaves proxy references alone.
    expect(body.items[0].content.thumbnail).toBe(cover);
    expect(await rewriteImages(once, ORIGIN)).toEqual(once);
  });
});

describe('record-scoped image proxy route', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let token: string;
  let saves = 0;
  const upstream: string[] = [];
  const outbound = (request: Request) => {
    const url = new URL(request.url);
    if (url.hostname === 'cloudflare-dns.com') {
      const host = url.searchParams.get('name')!;
      return Response.json({
        Status: 0,
        Answer:
          url.searchParams.get('type') === 'AAAA'
            ? []
            : [{ type: 1, data: host.startsWith('private.') ? '10.0.0.7' : '93.184.216.34' }],
      });
    }
    if (url.hostname === 'example.com') return new Response('unexpected', { status: 500 });
    upstream.push(request.url);
    expect(request.headers.get('authorization')).toBeNull();
    expect(request.headers.get('user-agent')).toBe('Zine/1.0 (+https://myzine.app)');
    expect(request.headers.get('accept')).toBe('image/*');
    const image = (type = 'image/png') => new Response(PNG, { headers: { 'content-type': type } });
    const redirect = (location: string) =>
      new Response(null, { status: 302, headers: { location } });
    switch (url.pathname) {
      case '/cover.png':
        return image();
      case '/cached.png':
        return image('image/png; charset=binary');
      case '/icon.svg':
        return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
          headers: { 'content-type': 'image/svg+xml' },
        });
      case '/page.html':
        return new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
      case '/declared-large.png':
        return new Response(PNG, {
          headers: { 'content-type': 'image/png', 'content-length': String(5 * 1024 * 1024 + 1) },
        });
      case '/streamed-large.png': {
        let sent = 0;
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (sent++ >= 6) return controller.close();
              controller.enqueue(new Uint8Array(1024 * 1024));
            },
          }),
          { headers: { 'content-type': 'image/png' } }
        );
      }
      case '/missing.png':
        return new Response('gone', { status: 410 });
      case '/broken.png':
        return new Response('down', { status: 500 });
      case '/to-public':
        return redirect('https://cdn.example/cover.png');
      case '/to-private':
        return redirect('https://private.example/cover.png');
      case '/to-literal':
        return redirect('http://169.254.169.254/latest/meta-data');
      case '/loop':
        return redirect(`/loop?n=${Number(url.searchParams.get('n') ?? 0) + 1}`);
    }
    return new Response('unexpected', { status: 500 });
  };
  beforeAll(async () => {
    runtime = await runtimeHarness({ outbound });
    token = await runtime.token('proxy-owner');
  });
  afterAll(async () => runtime?.close());

  const api = (path: string, method = 'GET', body?: unknown) =>
    runtime.mf.dispatchFetch(`${ORIGIN}/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const save = async () => {
    const saved = await api('/saves', 'POST', { url: `https://example.com/proxy-${++saves}` });
    expect(saved.status).toBe(201);
    return ((await saved.json()) as { item: { id: string } }).item.id;
  };
  /** Stores `source` as the item's image. Written directly so unsafe URLs can be stored too. */
  const store = async (itemId: string, field: 'thumbnail' | 'creatorImageUrl', source: string) => {
    const changed = await runtime.db
      .prepare(
        'UPDATE contributions SET value_json=? WHERE field=? AND content_id=(SELECT content_id FROM personal_items WHERE id=?)'
      )
      .bind(JSON.stringify(source), field, itemId)
      .run();
    if (changed.meta.changes) return;
    const added = await api(`/items/${itemId}/enrichment`, 'POST', {
      field,
      value: 'https://images.example/placeholder.png',
      provenance: { method: 'test-fixture' },
    });
    expect(added.status).toBe(201);
    await store(itemId, field, source);
  };
  /** A fresh item whose thumbnail is `source`, read through the public route without a token. */
  const route = (itemId: string, kind = 'thumbnail', query = '') =>
    runtime.mf.dispatchFetch(`${ORIGIN}/v1/img/items/${itemId}/${kind}${query}`);
  const proxy = async (source: string) => {
    const itemId = await save();
    await store(itemId, 'thumbnail', source);
    return route(itemId);
  };
  const outcome = async (response: Awaited<ReturnType<typeof route>>) => ({
    status: response.status,
    code: ((await response.json()) as { error: { code: string } }).error.code,
    cacheControl: response.headers.get('cache-control'),
  });
  const failed = async (source: string) => outcome(await proxy(source));
  const NOT_FOUND = { status: 404, code: 'image_not_found', cacheControl: 'public, max-age=60' };

  it('serves the stored thumbnail and creator image without a bearer token', async () => {
    const itemId = await save();
    await store(itemId, 'thumbnail', 'https://images.example/cover.png');
    await store(itemId, 'creatorImageUrl', 'https://images.example/icon.svg');
    const response = await route(itemId, 'thumbnail', '?v=0123abcd');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    const creator = await route(itemId, 'creator');
    expect(creator.status).toBe(200);
    expect(creator.headers.get('content-type')).toBe('image/svg+xml');
    await creator.arrayBuffer();
    expect(upstream).toEqual([
      'https://images.example/cover.png',
      'https://images.example/icon.svg',
    ]);
  });

  it('answers one 404 for unknown, deleted, image-less and malformed references, fetching nothing', async () => {
    const before = upstream.length;
    const bare = await save();
    expect(await outcome(await route(bare))).toEqual(NOT_FOUND);
    expect(await outcome(await route(bare, 'creator'))).toEqual(NOT_FOUND);
    expect(await outcome(await route(`itm_${'0'.repeat(40)}`))).toEqual(NOT_FOUND);
    const pictured = await save();
    await store(pictured, 'thumbnail', 'https://images.example/cover.png');
    // Only the two image kinds exist; other fields of the record are not reachable.
    for (const kind of ['title', 'creatorImageUrl', 'url', 'THUMBNAIL'])
      expect(await outcome(await route(pictured, kind)), kind).toEqual(NOT_FOUND);
    for (const id of [
      pictured.toUpperCase(),
      pictured.slice(0, -1),
      `${pictured}0`,
      pictured.replace('itm_', 'cnt_'),
      pictured.replace('itm_', ''),
      `${pictured}%27%20OR%201=1`,
      'itm_%25',
    ])
      expect(await outcome(await route(id)), id).toEqual(NOT_FOUND);
    expect((await api(`/items/${pictured}`, 'DELETE')).status).toBe(204);
    expect(await outcome(await route(pictured))).toEqual(NOT_FOUND);
    expect(upstream.length).toBe(before);
    // The old caller-supplied-URL form no longer exists; it falls through to the authenticated API.
    for (const path of ['/v1/img', '/v1/img?u=https%3A%2F%2Fimages.example%2Fcover.png&s=x'])
      expect((await runtime.mf.dispatchFetch(`${ORIGIN}${path}`)).status).toBe(401);
    expect(upstream.length).toBe(before);
  });

  it('never fetches a URL from the request, only the stored one', async () => {
    const itemId = await save();
    await store(itemId, 'thumbnail', 'https://images.example/cover.png');
    const before = upstream.length;
    const response = await route(
      itemId,
      'thumbnail',
      '?u=https%3A%2F%2Fevil.example%2Fx.png&url=https://evil.example/y.png&v=https://evil.example/z.png'
    );
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(upstream.slice(before).every((url) => url === 'https://images.example/cover.png')).toBe(
      true
    );
    expect(upstream.some((url) => url.includes('evil.example'))).toBe(false);
  });

  it('serves the same visible contribution the item JSON shows when several exist', async () => {
    const itemId = await save();
    await store(itemId, 'thumbnail', 'https://images.example/cover.png');
    const row = await runtime.db
      .prepare('SELECT * FROM contributions WHERE field=? AND value_json=? LIMIT 1')
      .bind('thumbnail', JSON.stringify('https://images.example/cover.png'))
      .first<Record<string, unknown>>();
    // A second, lower-ranked contribution must not be the one served.
    await runtime.db
      .prepare(
        `INSERT INTO contributions(${Object.keys(row!).join(',')}) VALUES(${Object.keys(row!)
          .map(() => '?')
          .join(',')})`
      )
      .bind(
        ...Object.entries({
          ...row!,
          id: 'ctr_lower_ranked',
          content_id: (
            await runtime.db
              .prepare('SELECT content_id FROM personal_items WHERE id=?')
              .bind(itemId)
              .first<{ content_id: string }>()
          )?.content_id,
          value_json: JSON.stringify('https://images.example/page.html'),
          priority: -1000,
        }).map(([, value]) => value)
      )
      .run();
    const shown = (await (await api(`/items/${itemId}`)).json()) as {
      content: { thumbnail: string };
    };
    // The item JSON and the route select the same contribution: the cover, not the page.
    expect(shown.content.thumbnail).toBe(
      await itemImageUrl(ORIGIN, itemId, 'thumbnail', 'https://images.example/cover.png')
    );
    const response = await runtime.mf.dispatchFetch(shown.content.thumbnail);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    await response.arrayBuffer();
    expect(upstream).not.toContain('https://images.example/page.html');
  });

  it('caches by upstream URL: repeats hit the cache, a changed stored URL is fetched anew', async () => {
    const source = 'https://images.example/cached.png';
    const itemId = await save();
    await store(itemId, 'thumbnail', source);
    const fetches = (url = source) => upstream.filter((entry) => entry === url).length;
    const first = await route(itemId);
    expect(first.headers.get('x-zine-image-cache')).toBe('MISS');
    await first.arrayBuffer();
    expect(fetches()).toBe(1);
    let second = await route(itemId);
    // The cache write completes in waitUntil, after the first response was sent.
    for (
      let attempt = 0;
      attempt < 50 && second.headers.get('x-zine-image-cache') !== 'HIT';
      attempt++
    ) {
      await second.arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, 100));
      second = await route(itemId);
    }
    expect(second.status).toBe(200);
    expect(second.headers.get('x-zine-image-cache')).toBe('HIT');
    expect(second.headers.get('content-type')).toBe('image/png');
    expect(second.headers.get('cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
    expect(second.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(PNG);
    const before = fetches();
    // The version parameter is not part of the cache key.
    await (await route(itemId, 'thumbnail', '?v=ffffffff')).arrayBuffer();
    expect(fetches()).toBe(before);

    // Another item storing the same image shares the cached copy.
    const sibling = await proxy(source);
    expect(sibling.headers.get('x-zine-image-cache')).toBe('HIT');
    await sibling.arrayBuffer();
    expect(fetches()).toBe(before);

    // The same route URL now serves the newly stored image instead of the cached old one.
    const replacement = 'https://images.example/icon.svg?changed';
    await store(itemId, 'thumbnail', replacement);
    const changed = await route(itemId);
    expect(changed.status).toBe(200);
    expect(changed.headers.get('x-zine-image-cache')).toBe('MISS');
    expect(changed.headers.get('content-type')).toBe('image/svg+xml');
    await changed.arrayBuffer();
    expect(fetches(replacement)).toBe(1);
    expect(fetches()).toBe(before);
  });

  it('serves SVG only as an inert, sandboxed inline image', async () => {
    const response = await proxy('https://images.example/icon.svg');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    );
    expect(response.headers.get('content-disposition')).toBe('inline');
    await response.arrayBuffer();
  });

  it('rejects stored private, literal-address and non-HTTP sources', async () => {
    const before = upstream.length;
    for (const source of [
      'https://private.example/cover.png',
      'http://127.0.0.1/cover.png',
      'https://localhost/cover.png',
      'https://images.example:8443/cover.png',
      'file:///etc/passwd',
    ])
      expect(await failed(source), source).toEqual({
        status: 502,
        code: 'image_source_not_public',
        cacheControl: 'public, max-age=60',
      });
    expect(upstream.length).toBe(before);
  });

  it('rejects non-image content and oversized images, declared or streamed', async () => {
    expect(await failed('https://images.example/page.html')).toMatchObject({
      status: 502,
      code: 'image_type_unsupported',
    });
    expect(await failed('https://images.example/declared-large.png')).toMatchObject({
      status: 502,
      code: 'image_too_large',
    });
    expect(await failed('https://images.example/streamed-large.png')).toEqual({
      status: 502,
      code: 'image_too_large',
      cacheControl: 'public, max-age=60',
    });
  });

  it('maps a missing source to 404 and other failures to an uncached 502', async () => {
    expect(await failed('https://images.example/missing.png')).toEqual(NOT_FOUND);
    const source = 'https://images.example/broken.png';
    expect(await failed(source)).toMatchObject({ status: 502, code: 'image_source_unreachable' });
    // Failures are never stored: the source is asked again.
    expect(await failed(source)).toMatchObject({ status: 502 });
    expect(upstream.filter((url) => url === source).length).toBe(2);
  });

  it('follows public redirects but re-checks every hop and bounds the chain', async () => {
    const followed = await proxy('https://images.example/to-public');
    expect(followed.status).toBe(200);
    await followed.arrayBuffer();
    expect(upstream).toContain('https://cdn.example/cover.png');

    expect(await failed('https://images.example/to-private')).toMatchObject({
      status: 502,
      code: 'image_source_not_public',
    });
    expect(await failed('https://images.example/to-literal')).toMatchObject({
      status: 502,
      code: 'image_source_not_public',
    });
    expect(upstream.some((url) => /private\.example|169\.254/.test(url))).toBe(false);

    expect(await failed('https://images.example/loop')).toMatchObject({ status: 502 });
    // The original request plus at most three redirects.
    expect(upstream.filter((url) => url.includes('/loop')).length).toBe(4);
  });
});
