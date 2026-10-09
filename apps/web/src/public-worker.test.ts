import { describe, expect, test, vi } from 'vitest';
import fixture from '../../../packages/shared/src/fixtures/publications/v1.json';
import worker, { type PublicWorkerEnv } from './public-worker';
const shell =
  '<html><head><title>Zine Web</title><meta name="description" content="generic"><link rel="stylesheet" href="/assets/app-123.css"></head><body><div id="root"></div><script type="module" src="/assets/app-123.js"></script></body></html>';
function environment(): PublicWorkerEnv {
  return {
    ASSETS: { fetch: vi.fn(async () => new Response(shell)) },
    API: {
      fetch: vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname;
        return Response.json(
          path.endsWith('/issues')
            ? { issues: [fixture.publicIssue], nextCursor: null }
            : path.includes('/publications/')
              ? { publication: fixture.publicPublication }
              : { issue: fixture.publicIssue }
        );
      }),
    },
    UPSTREAM_API_URL: 'https://api.example.test',
    APPLE_APPLICATION_IDENTIFIER: 'TRA7965NM5.app.zine.native',
  };
}
describe('dynamic public sharing host', () => {
  test('renders crawler-readable issue and preview without passing user auth', async () => {
    const env = environment();
    const response = await worker.fetch(
      new Request(`https://myzine.app/i/${fixture.publicIssue.id}?continue=secret`, {
        headers: { authorization: 'Bearer private', cookie: 'private' },
      }),
      env
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('Thinking about cities');
    expect(html).toContain('Public essay');
    expect(html).toContain('Worth your time.');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('/publication-fallback.png');
    expect(html).toContain('/assets/app-123.js');
    expect(html).not.toContain('continue=secret');
    expect(html).not.toContain('private');
    const upstream = vi.mocked(env.API!.fetch).mock.calls[0][0];
    expect(upstream.headers.has('authorization')).toBe(false);
    expect(upstream.headers.has('cookie')).toBe(false);
  });
  test('escapes prose, bootstrap script breakers and unsafe source URLs', async () => {
    const env = environment();
    env.API!.fetch = vi.fn(async () =>
      Response.json({
        issue: {
          ...fixture.publicIssue,
          title: '</script><script>alert(1)</script>',
          introduction: '<img onerror=alert(1)>',
          sections: [
            {
              ...fixture.publicIssue.sections[0],
              selections: [
                {
                  ...fixture.publicIssue.sections[0].selections[0],
                  originalUrl: 'javascript:alert(1)',
                  artworkUrl: 'javascript:alert(2)',
                },
              ],
            },
          ],
        },
      })
    );
    const html = await (
      await worker.fetch(new Request(`https://myzine.app/i/${fixture.publicIssue.id}`), env)
    ).text();
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('src="javascript:');
    expect(html).toContain('\\u003c/script');
  });
  test('does not leak unavailable or malformed public resources; transient errors are 503', async () => {
    const env = environment();
    env.API!.fetch = vi.fn(async () => new Response('private title', { status: 404 }));
    let response = await worker.fetch(
      new Request(`https://myzine.app/i/${fixture.publicIssue.id}`),
      env
    );
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('private title');
    env.API!.fetch = vi.fn(async () => new Response('upstream secret', { status: 500 }));
    response = await worker.fetch(
      new Request(`https://myzine.app/i/${fixture.publicIssue.id}`),
      env
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('upstream secret');
    response = await worker.fetch(new Request('https://myzine.app/i/not-an-id'), env);
    expect(response.status).toBe(404);
  });
  test('HEAD matches metadata headers without body and never writes on public page', async () => {
    const env = environment();
    const response = await worker.fetch(
      new Request(`https://myzine.app/i/${fixture.publicIssue.id}`, { method: 'HEAD' }),
      env
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(
      (
        await worker.fetch(
          new Request(`https://myzine.app/i/${fixture.publicIssue.id}`, { method: 'POST' }),
          env
        )
      ).status
    ).toBe(405);
  });
  test('publication archive supports no-JS cursor links and passes safe cursor', async () => {
    const env = environment();
    env.API!.fetch = vi.fn(async (request: Request) =>
      Response.json(
        new URL(request.url).pathname.endsWith('/issues')
          ? { issues: [fixture.publicIssue], nextCursor: fixture.publicIssue.id }
          : { publication: fixture.publicPublication }
      )
    );
    const response = await worker.fetch(
      new Request(
        `https://myzine.app/p/${fixture.publicPublication.id}?cursor=${fixture.publicIssue.id}`
      ),
      env
    );
    const html = await response.text();
    expect(html).toContain('More issues');
    expect(html).toContain('Thinking about cities');
    expect(vi.mocked(env.API!.fetch).mock.calls[1][0].url).toContain(
      `?cursor=${fixture.publicIssue.id}`
    );
  });
  test('association scopes only published routes and refuses missing signed identifier', async () => {
    const env = environment();
    const response = await worker.fetch(
      new Request('https://myzine.app/.well-known/apple-app-site-association'),
      env
    );
    expect(await response.json()).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['TRA7965NM5.app.zine.native'],
            components: [{ '/': '/p/*' }, { '/': '/i/*' }],
          },
        ],
      },
    });
    delete env.APPLE_APPLICATION_IDENTIFIER;
    expect(
      (
        await worker.fetch(
          new Request('https://myzine.app/.well-known/apple-app-site-association'),
          env
        )
      ).status
    ).toBe(503);
  });
  test('API proxy preserves idempotency, drops cookies and read-only preview blocks mutations', async () => {
    const env = environment();
    await worker.fetch(
      new Request('https://myzine.app/api/v1/issues/id/selections/id/save', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'idempotency-key': 'same-key',
          cookie: 'private',
        },
      }),
      env
    );
    const forwarded = vi.mocked(env.API!.fetch).mock.calls[0][0];
    expect(forwarded.headers.get('idempotency-key')).toBe('same-key');
    expect(forwarded.headers.get('authorization')).toBe('Bearer token');
    expect(forwarded.headers.has('cookie')).toBe(false);
    env.PREVIEW_READ_ONLY = 'true';
    expect(
      (
        await worker.fetch(
          new Request('https://preview.test/api/v1/issues/id/selections/id/save', {
            method: 'POST',
          }),
          env
        )
      ).status
    ).toBe(403);
  });
});
