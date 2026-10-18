import { describe, expect, test, vi } from 'vitest';
import worker, { type PublicWorkerEnv } from './public-worker';

function environment(): PublicWorkerEnv {
  return {
    ASSETS: { fetch: vi.fn(async () => new Response('app shell')) },
    API: { fetch: vi.fn(async () => Response.json({ ok: true })) },
    UPSTREAM_API_URL: 'https://api.example.test',
  };
}

describe('web host', () => {
  test.each(['/p/id', '/i/id'])(
    'retires %s without loading publication data or the app shell',
    async (path) => {
      const env = environment();
      const response = await worker.fetch(new Request(`https://myzine.app${path}`), env);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(env.API!.fetch).not.toHaveBeenCalled();
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    }
  );

  test.each(['/.well-known/apple-app-site-association', '/apple-app-site-association'])(
    'serves native bookmark association at %s without auth or redirects',
    async (path) => {
      const env = environment();
      const response = await worker.fetch(new Request(`https://myzine.app${path}`), env);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({
        applinks: {
          details: [
            {
              appIDs: ['TRA7965NM5.app.zine.native'],
              components: [{ '/': '/item/*' }],
            },
          ],
        },
      });
      expect(env.API!.fetch).not.toHaveBeenCalled();
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    }
  );

  test('serves the authenticated web app shell for bookmark fallback links', async () => {
    const env = environment();
    const response = await worker.fetch(new Request('https://myzine.app/item/a-public'), env);
    expect(await response.text()).toBe('app shell');
    expect(env.API!.fetch).not.toHaveBeenCalled();
  });

  test('serves the app for ordinary routes', async () => {
    const env = environment();
    const response = await worker.fetch(new Request('https://myzine.app/home'), env);
    expect(await response.text()).toBe('app shell');
    expect(env.API!.fetch).not.toHaveBeenCalled();
  });

  test('preserves API auth and idempotency without forwarding cookies', async () => {
    const env = environment();
    const response = await worker.fetch(
      new Request('https://myzine.app/api/v1/bookmarks', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'idempotency-key': 'same-key',
          'content-type': 'application/json',
          cookie: 'private',
        },
        body: JSON.stringify({ url: 'https://example.com' }),
      }),
      env
    );
    expect(response.status).toBe(200);
    const forwarded = vi.mocked(env.API!.fetch).mock.calls[0][0];
    expect(forwarded.url).toBe('https://api.example.test/api/v1/bookmarks');
    expect(forwarded.headers.get('idempotency-key')).toBe('same-key');
    expect(forwarded.headers.get('authorization')).toBe('Bearer token');
    expect(forwarded.headers.has('cookie')).toBe(false);
    expect(await forwarded.json()).toEqual({ url: 'https://example.com' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('read-only preview blocks mutations and still permits reads', async () => {
    const env = environment();
    env.PREVIEW_READ_ONLY = 'true';
    expect(
      (
        await worker.fetch(
          new Request('https://preview.test/api/v1/bookmarks', { method: 'POST' }),
          env
        )
      ).status
    ).toBe(403);
    expect(env.API!.fetch).not.toHaveBeenCalled();
    expect(
      (await worker.fetch(new Request('https://preview.test/api/v1/bookmarks'), env)).status
    ).toBe(200);
  });

  test('reports an unavailable API binding', async () => {
    const env = environment();
    delete env.API;
    expect(
      (await worker.fetch(new Request('https://myzine.app/api/v1/bookmarks'), env)).status
    ).toBe(503);
  });
});
