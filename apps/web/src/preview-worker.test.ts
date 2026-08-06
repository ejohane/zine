import { afterEach, describe, expect, test, vi } from 'vitest';

import previewWorker, { isPreviewApiPath } from './preview-worker';

const env = {
  ASSETS: {
    fetch: vi.fn(
      async () => new Response('<html>Zine</html>', { headers: { 'Content-Type': 'text/html' } })
    ),
  },
  PREVIEW_GIT_SHA: 'abcdef1234567890',
  PREVIEW_ID: 'feature-preview-1234abcd',
  UPSTREAM_API_URL: 'https://api.myzine.app',
};

describe('preview Worker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    env.ASSETS.fetch.mockClear();
  });

  test('limits proxying to supported Zine API paths', () => {
    expect(isPreviewApiPath('/trpc/items.list')).toBe(true);
    expect(isPreviewApiPath('/api/v1/items/item-1/content')).toBe(true);
    expect(isPreviewApiPath('/api/auth/webhook')).toBe(false);
    expect(isPreviewApiPath('/admin')).toBe(false);
  });

  test('proxies API requests to the configured upstream without browser cookies or origins', async () => {
    const upstreamFetch = vi.fn(
      async (_request: Request) =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await previewWorker.fetch(
      new Request('https://feature.preview.myzine.app/trpc/items.list?batch=1', {
        headers: {
          Authorization: 'Bearer token-123',
          Cookie: 'private=value',
          Origin: 'https://feature.preview.myzine.app',
          'X-Zine-Trace-Id': 'trace-123',
        },
      }),
      env
    );

    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const upstreamRequest = upstreamFetch.mock.calls[0]![0] as Request;
    expect(upstreamRequest.url).toBe('https://api.myzine.app/trpc/items.list?batch=1');
    expect(upstreamRequest.headers.get('authorization')).toBe('Bearer token-123');
    expect(upstreamRequest.headers.get('x-zine-trace-id')).toBe('trace-123');
    expect(upstreamRequest.headers.has('cookie')).toBe(false);
    expect(upstreamRequest.headers.has('origin')).toBe(false);
    expect(response.headers.get('x-zine-preview')).toBe('feature-preview-1234abcd');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  test('serves SPA assets with preview and indexing headers', async () => {
    const response = await previewWorker.fetch(
      new Request('https://feature.preview.myzine.app/item/item-1'),
      env
    );

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(response.headers.get('x-zine-preview')).toBe('feature-preview-1234abcd');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  test('exposes deployment identity through a dedicated health endpoint', async () => {
    const response = await previewWorker.fetch(
      new Request('https://feature.preview.myzine.app/_preview/health'),
      env
    );

    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'zine-web-preview',
      previewId: 'feature-preview-1234abcd',
      gitSha: 'abcdef1234567890',
    });
  });
});
