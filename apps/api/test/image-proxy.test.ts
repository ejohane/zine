import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import {
  proxiedImageUrl,
  rewriteImages,
  signImageUrl,
  verifyImageSignature,
} from '../src/image-proxy';

const SECRET = 'synthetic-image-proxy-secret';
const ORIGIN = 'http://localhost';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe('image reference signing and rewriting', () => {
  it('signs the exact URL and rejects any other URL, secret or malformed signature', async () => {
    const url = 'https://images.example/cover.png?w=1200';
    const signature = await signImageUrl(SECRET, url);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await verifyImageSignature(SECRET, url, signature)).toBe(true);
    expect(await verifyImageSignature(SECRET, `${url}0`, signature)).toBe(false);
    expect(await verifyImageSignature('another-secret', url, signature)).toBe(false);
    expect(await verifyImageSignature(SECRET, url, `${signature.slice(0, -1)}!`)).toBe(false);
    expect(await verifyImageSignature(SECRET, url, '')).toBe(false);
  });

  it('rewrites only cover and avatar fields, skips publisher blobs and never double-wraps', async () => {
    const cover = 'https://images.example/cover.png';
    const avatar = 'https://images.example/avatar.png';
    const body = {
      items: [
        {
          content: {
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
      ],
      odd: { thumbnail: 'not a url', creatorImageUrl: 'data:image/png;base64,AAAA' },
    };
    const once = await rewriteImages(body, SECRET, ORIGIN);
    const expectedCover = await proxiedImageUrl(SECRET, ORIGIN, cover);
    const content = once.items[0].content;
    expect(content.thumbnail).toBe(expectedCover);
    expect(expectedCover).toBe(
      `${ORIGIN}/v1/img?u=${encodeURIComponent(cover)}&s=${await signImageUrl(SECRET, cover)}`
    );
    expect(content.creatorImageUrl).toBe(await proxiedImageUrl(SECRET, ORIGIN, avatar));
    expect(content.url).toBe('https://publisher.example/article');
    expect(content.members[0]).toEqual({ thumbnail: expectedCover, creatorImageUrl: null });
    for (const field of ['structuredData', 'raw', 'article', 'thread', 'transcript'] as const)
      expect(content[field]).toEqual(body.items[0].content[field]);
    expect(once.odd).toEqual(body.odd);
    // The input is not mutated, and a second pass leaves proxy references alone.
    expect(body.items[0].content.thumbnail).toBe(cover);
    expect(await rewriteImages(once, SECRET, ORIGIN)).toEqual(once);
  });
});

describe('signed image proxy route', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
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
    runtime = await runtimeHarness({ outbound, bindings: { IMAGE_PROXY_SECRET: SECRET } });
  });
  afterAll(async () => runtime?.close());

  const proxy = async (source: string, signature?: string) =>
    runtime.mf.dispatchFetch(
      signature === undefined
        ? await proxiedImageUrl(SECRET, ORIGIN, source)
        : `${ORIGIN}/v1/img?u=${encodeURIComponent(source)}&s=${signature}`
    );
  const failed = async (source: string) => {
    const response = await proxy(source);
    const body = (await response.json()) as { error: { code: string } };
    return {
      status: response.status,
      code: body.error.code,
      cacheControl: response.headers.get('cache-control'),
    };
  };

  it('refuses unsigned, tampered and wrongly signed requests without fetching anything', async () => {
    const source = 'https://images.example/cover.png';
    const valid = await signImageUrl(SECRET, source);
    const unsigned = await runtime.mf.dispatchFetch(
      `${ORIGIN}/v1/img?u=${encodeURIComponent(source)}`
    );
    expect(unsigned.status).toBe(403);
    expect(((await unsigned.json()) as { error: { code: string } }).error.code).toBe(
      'invalid_image_signature'
    );
    expect((await runtime.mf.dispatchFetch(`${ORIGIN}/v1/img`)).status).toBe(403);
    expect((await proxy('https://images.example/other.png', valid)).status).toBe(403);
    expect((await proxy(source, valid.replace(/.$/, valid.endsWith('A') ? 'B' : 'A'))).status).toBe(
      403
    );
    expect((await proxy(source, await signImageUrl('wrong-secret', source))).status).toBe(403);
    expect(upstream).toEqual([]);
  });

  it('serves a signed image without a bearer token, with cross-origin and caching headers', async () => {
    const response = await proxy('https://images.example/cover.png');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it('serves repeat requests from the Cache API without contacting the source again', async () => {
    const source = 'https://images.example/cached.png';
    const first = await proxy(source);
    expect(first.headers.get('x-zine-image-cache')).toBe('MISS');
    await first.arrayBuffer();
    const fetches = () => upstream.filter((url) => url === source).length;
    expect(fetches()).toBe(1);
    let second = await proxy(source);
    // The cache write completes in waitUntil, after the first response was sent.
    for (
      let attempt = 0;
      attempt < 50 && second.headers.get('x-zine-image-cache') !== 'HIT';
      attempt++
    ) {
      await second.arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, 100));
      second = await proxy(source);
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
    await (await proxy(source)).arrayBuffer();
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

  it('rejects private, literal-address and non-HTTP sources even when correctly signed', async () => {
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
    expect(await failed('https://images.example/missing.png')).toEqual({
      status: 404,
      code: 'image_not_found',
      cacheControl: 'public, max-age=60',
    });
    const source = 'https://images.example/broken.png';
    expect(await failed(source)).toMatchObject({ status: 502, code: 'image_source_unreachable' });
    // Failures are never stored: the source is asked again.
    await failed(source);
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

describe('deployment without IMAGE_PROXY_SECRET', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  beforeAll(async () => {
    runtime = await runtimeHarness();
  });
  afterAll(async () => runtime?.close());

  it('turns the route off and leaves image references exactly as stored', async () => {
    const source = 'https://images.example/cover.png';
    const response = await runtime.mf.dispatchFetch(await proxiedImageUrl(SECRET, ORIGIN, source));
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'image_proxy_unavailable'
    );

    const token = await runtime.token('no-proxy-owner');
    const call = async (path: string, method = 'GET', body?: unknown) => {
      const result = await runtime.mf.dispatchFetch(`${ORIGIN}/v1${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: result.status, text: await result.text() };
    };
    const saved = await call('/saves', 'POST', { url: 'https://example.com/no-proxy' });
    expect(saved.status).toBe(201);
    const itemId = (JSON.parse(saved.text) as { item: { id: string } }).item.id;
    for (const [field, value] of [
      ['thumbnail', source],
      ['creatorImageUrl', 'https://images.example/avatar.png'],
    ])
      expect(
        (
          await call(`/items/${itemId}/enrichment`, 'POST', {
            field,
            value,
            provenance: { method: 'test-fixture' },
          })
        ).status
      ).toBe(201);
    for (const path of [`/items/${itemId}`, '/items', '/home']) {
      const read = await call(path);
      expect(read.status).toBe(200);
      expect(read.text).toContain(`"thumbnail":"${source}"`);
      expect(read.text).toContain('"creatorImageUrl":"https://images.example/avatar.png"');
      expect(read.text).not.toContain('/v1/img');
    }
  });
});
