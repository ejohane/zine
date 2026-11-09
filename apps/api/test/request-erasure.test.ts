import { afterEach, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { save, saveSchema } from '../src/items';
import { sealCredentials, openCredentials } from '../src/connections';
import { atomicOwnerWrite, stmt } from '../src/lib';
import type { Env } from '../src/types';
let runtime: Awaited<ReturnType<typeof runtimeHarness>> | undefined;
afterEach(async () => runtime?.close());
function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
async function client(owner: string) {
  const token = await runtime!.token(owner);
  return async (path: string, method = 'GET', body?: unknown) => {
    const response = await runtime!.mf.dispatchFetch(`http://localhost/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : JSON.parse(await response.text()),
    };
  };
}
describe('authentication-time account erasure fences across foreground awaits', () => {
  it('rejects a completed Google exchange begun before erasure while another owner and a fresh request still work', async () => {
    const entered = latch(),
      release = latch();
    runtime = await runtimeHarness({
      bindings: { CREDENTIAL_KEY: btoa('a'.repeat(32)) },
      outbound: async (request) => {
        expect(new URL(request.url).hostname).toBe('oauth2.googleapis.com');
        const body = await request.text();
        if (new URLSearchParams(body).get('client_id') === 'paused-client') {
          entered.resolve();
          await release.promise;
        }
        return Response.json({ access_token: 'synthetic-access', expires_in: 3600 });
      },
    });
    const a = await client('connect-erased'),
      b = await client('connect-unrelated');
    const pending = a('/connections/google', 'PUT', {
      clientId: 'paused-client',
      refreshToken: 'synthetic-refresh',
    });
    await entered.promise;
    expect((await a('/account/data', 'DELETE')).status).toBe(200);
    expect(
      (
        await b('/connections/google', 'PUT', {
          clientId: 'other-client',
          refreshToken: 'synthetic-refresh',
        })
      ).status
    ).toBe(200);
    release.resolve();
    expect(await pending).toMatchObject({
      status: 409,
      body: { error: { code: 'account_data_erased' } },
    });
    expect((await a('/connections')).body.connections).toEqual([]);
    expect((await b('/connections')).body.connections).toHaveLength(1);
    expect(
      (
        await a('/connections/google', 'PUT', {
          clientId: 'fresh-client',
          refreshToken: 'synthetic-refresh',
        })
      ).status
    ).toBe(200);
    expect((await a('/connections')).body.connections).toHaveLength(1);
  });
  it.each([false, true])(
    'preserves a reconnected grant when a stale refresh finishes with failure=%s',
    async (failed) => {
      const entered = latch(),
        release = latch();
      const key = btoa('r'.repeat(32));
      const authorizations: string[] = [];
      runtime = await runtimeHarness({
        bindings: { CREDENTIAL_KEY: key },
        outbound: async (request) => {
          const url = new URL(request.url);
          if (url.hostname === 'oauth2.googleapis.com') {
            const body = new URLSearchParams(await request.text());
            if (body.get('client_id') === 'old-client') {
              entered.resolve();
              await release.promise;
              return failed
                ? Response.json({ error: 'invalid_grant' }, { status: 400 })
                : Response.json({ access_token: 'stale-access', expires_in: 3600 });
            }
            return Response.json({ access_token: 'fresh-access', expires_in: 3600 });
          }
          expect(url.hostname).toBe('www.googleapis.com');
          authorizations.push(request.headers.get('authorization') ?? '');
          return Response.json({
            items: [
              {
                snippet: { title: 'Member', resourceId: { videoId: 'abcdef12345' } },
                contentDetails: { videoId: 'abcdef12345' },
              },
            ],
          });
        },
      });
      const owner = 'reconnected-refresh',
        a = await client(owner);
      const saved = await a('/saves', 'POST', {
        url: 'https://www.youtube.com/playlist?list=PLsynthetic',
      });
      const env = { DB: runtime.db, CREDENTIAL_KEY: key } as unknown as Env;
      const old = await sealCredentials(env, owner, {
        clientId: 'old-client',
        refreshToken: 'old-refresh',
      });
      await stmt(
        env.DB,
        "INSERT INTO connections(owner_id,provider,credentials,status,created_at,updated_at) VALUES(?,'google',?,'active','2026-01-01','2026-01-01')",
        owner,
        old
      ).run();
      const pending = a(`/items/${saved.body.item.id}/members`);
      await entered.promise;
      expect((await a('/connections/google', 'DELETE')).status).toBe(204);
      expect(
        (
          await a('/connections/google', 'PUT', {
            clientId: 'fresh-client',
            refreshToken: 'fresh-refresh',
          })
        ).status
      ).toBe(200);
      release.resolve();
      expect((await pending).status).toBe(200);
      expect(authorizations).toEqual(['Bearer fresh-access']);
      const stored = await stmt(
        env.DB,
        'SELECT credentials,status,revision FROM connections WHERE owner_id=?',
        owner
      ).first<{ credentials: string; status: string; revision: number }>();
      expect(stored!.status).toBe('active');
      expect(stored!.revision).toBe(0);
      expect((await openCredentials(env, owner, stored!.credentials)).refreshToken).toBe(
        'fresh-refresh'
      );
    }
  );

  it('does not recreate a source or routes when feed discovery completes after erasure', async () => {
    const entered = latch(),
      release = latch();
    runtime = await runtimeHarness({
      outbound: async (request) => {
        const url = new URL(request.url);
        if (url.hostname === 'cloudflare-dns.com')
          return Response.json({
            Status: 0,
            Answer:
              url.searchParams.get('type') === 'AAAA' ? [] : [{ type: 1, data: '93.184.216.34' }],
          });
        entered.resolve();
        await release.promise;
        return new Response(
          '<rss version="2.0"><channel><title>Delayed feed</title><link>https://example.com/</link></channel></rss>',
          { headers: { 'content-type': 'application/rss+xml' } }
        );
      },
    });
    const a = await client('resolve-erased');
    const pending = a('/sources/resolve', 'POST', { url: 'https://example.com/feed' });
    await entered.promise;
    expect((await a('/account/data', 'DELETE')).status).toBe(200);
    release.resolve();
    expect(await pending).toMatchObject({
      status: 409,
      body: { error: { code: 'account_data_erased' } },
    });
    expect((await a('/sources')).body.sources).toEqual([]);
    expect(
      (await runtime.db.prepare('SELECT COUNT(*) AS n FROM source_routes').first<{ n: number }>())!
        .n
    ).toBe(0);
  });
  it('rejects stale request scopes for atomic item and owner writes without contaminating fresh scopes', async () => {
    runtime = await runtimeHarness();
    const owner = 'stale-operation-scope';
    const env = {
      DB: runtime.db,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
      OPERATION_EPOCH: { owner, generation: 0 },
    } as unknown as Env;
    const a = await client(owner);
    expect((await a('/account/data', 'DELETE')).status).toBe(200);
    await expect(
      save(
        env,
        { userId: owner, contributor: 'test' },
        saveSchema.parse({ url: 'https://example.com/stale-save' })
      )
    ).rejects.toMatchObject({ code: 'account_data_erased' });
    await expect(
      atomicOwnerWrite(env, owner, [
        stmt(
          env.DB,
          "INSERT INTO collections(id,owner_id,name,created_at,updated_at) VALUES('stale-col',?,'stale','2026-01-01','2026-01-01')",
          owner
        ),
      ])
    ).rejects.toMatchObject({ code: 'account_data_erased' });
    expect((await a('/items')).body.items).toEqual([]);
    expect((await a('/collections')).body.collections).toEqual([]);
    expect((await a('/collections', 'POST', { name: 'fresh collection' })).status).toBe(201);
    expect((await a('/saves', 'POST', { url: 'https://example.com/fresh-save' })).status).toBe(201);
  });
});
