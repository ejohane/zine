import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { AddressInfo } from 'node:net';

// Tokens are signed by an isolated local issuer and verified through real JWKS
// HTTP requests. This proves the auth contract, not production Clerk login.
describe('independent Worker + D1 + R2 foundation', () => {
  let mf: Miniflare;
  let db: D1Database;
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let server: ReturnType<typeof createServer>;
  let issuer: string;
  let owner: string;
  let token: string;
  async function issue(sub: string, audience = 'zine-api', expiry = '5m') {
    return new SignJWT({ azp: 'test-client' })
      .setProtectedHeader({ alg: 'RS256', kid: 'isolated-test' })
      .setSubject(sub)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiry)
      .sign(keys.privateKey);
  }
  async function request(
    path: string,
    options: { method?: string; body?: unknown; token?: string | null; key?: string } = {}
  ) {
    const headers: Record<string, string> = {};
    if (options.token !== null) headers.authorization = `Bearer ${options.token ?? token}`;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.key) headers['idempotency-key'] = options.key;
    const response = await mf.dispatchFetch(`http://localhost${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = response.status === 204 ? null : JSON.parse(await response.text());
    return { status: response.status, body, headers: response.headers };
  }
  const save = (
    url = `https://example.com/${crypto.randomUUID()}`,
    extra: Record<string, unknown> = {},
    key?: string
  ) => request('/v1/saves', { method: 'POST', body: { url, ...extra }, key });
  beforeAll(async () => {
    keys = await generateKeyPair('RS256', { extractable: true });
    const jwk = {
      ...(await exportJWK(keys.publicKey)),
      kid: 'isolated-test',
      alg: 'RS256',
      use: 'sig',
    };
    server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const bundle = await build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      external: ['node:*'],
    });
    mf = new Miniflare({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-07-30',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'isolated-api-tests' },
      r2Buckets: ['ARTIFACTS'],
      queueProducers: { JOBS: 'isolated-api-jobs' },
      bindings: {
        ENVIRONMENT: 'test',
        AUTH_ISSUER: issuer,
        AUTH_JWKS_URL: `${issuer}/jwks`,
        AUTH_AUDIENCE: 'zine-api',
        ALLOWED_ORIGINS: 'http://localhost',
        EMBEDDING_MODEL: 'test',
      },
    });
    db = (await mf.getD1Database('DB')) as unknown as D1Database;
    for (const file of (await readdir('migrations'))
      .filter((file) => file.endsWith('.sql'))
      .sort()) {
      const [tables, ...triggers] = (await readFile(`migrations/${file}`, 'utf8')).split(
        /(?=CREATE TRIGGER)/
      );
      await db.batch(
        [
          ...tables
            .replace(/^\s*--.*$/gm, '')
            .split(';')
            .map((sql) => sql.trim())
            .filter(Boolean),
          ...triggers,
        ].map((sql) => db.prepare(sql))
      );
    }
  });
  beforeEach(async () => {
    owner = `user_${crypto.randomUUID()}`;
    token = await issue(owner);
  });
  afterAll(async () => {
    await mf?.dispose();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it('requires authentic, unexpired tokens with the API audience', async () => {
    expect((await request('/v1/me', { token: null })).status).toBe(401);
    expect((await request('/v1/me', { token: 'garbage' })).status).toBe(401);
    expect((await request('/v1/me', { token: await issue(owner, 'another-service') })).status).toBe(
      401
    );
    expect((await request('/v1/me', { token: await issue(owner, 'zine-api', '-1s') })).status).toBe(
      401
    );
    const me = await request('/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(owner);
  });

  it('durably saves context and an outbox job without any provider or queue call', async () => {
    const result = await save(
      undefined,
      { context: { text: 'For the automation project' }, tags: ['home', 'home'] },
      'first-save'
    );
    expect(result.status).toBe(201);
    const item = await request(`/v1/items/${result.body.item.id}`);
    expect(item.status).toBe(200);
    expect(item.body.context[0].text).toBe('For the automation project');
    expect(item.body.tags).toEqual(['home']);
    const jobs = await request(`/v1/items/${item.body.id}/jobs`);
    expect(jobs.body.jobs).toHaveLength(1);
    expect(jobs.body.jobs[0].status).toBe('pending');
  });

  it('issues independent API tokens, hides stored secrets, and honors revocation', async () => {
    const created = await request('/v1/tokens', {
      method: 'POST',
      body: { name: 'Integration test', expiresInDays: 1 },
    });
    expect(created.status).toBe(201);
    expect(created.body.token.startsWith('zine2_')).toBe(true);
    const me = await request('/v1/me', { token: created.body.token });
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(owner);
    const listed = await request('/v1/tokens');
    expect(listed.body.tokens[0]).not.toHaveProperty('token');
    expect(listed.body.tokens[0]).not.toHaveProperty('token_hash');
    const stored = await db
      .prepare('SELECT token_hash FROM api_tokens WHERE id=?')
      .bind(created.body.id)
      .first<{ token_hash: string }>();
    expect(stored!.token_hash).not.toBe(created.body.token);
    expect(
      (
        await request(`/v1/tokens/${created.body.id}`, {
          method: 'DELETE',
          token: await issue('another-user'),
        })
      ).status
    ).toBe(404);
    expect((await request(`/v1/tokens/${created.body.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await request('/v1/me', { token: created.body.token })).status).toBe(401);
  });

  it('deduplicates URL variants and accumulates context on intentional saves', async () => {
    const video = 'https://youtu.be/dQw4w9WgXcQ?t=30';
    const a = await save(video, { context: { text: 'First reason' } });
    const b = await save('https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=test', {
      context: { text: 'Second reason' },
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(a.body.item.id).toBe(b.body.item.id);
    const item = await request(`/v1/items/${a.body.item.id}`);
    expect(item.body.context.map((x: { text: string }) => x.text)).toEqual([
      'First reason',
      'Second reason',
    ]);
  });

  it('makes concurrent retries exactly one personal effect and rejects payload conflicts', async () => {
    const url = `https://example.com/${crypto.randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => save(url, { context: { text: 'Only once' } }, 'concurrent'))
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.save.id)).size).toBe(1);
    const item = await request(`/v1/items/${results[0].body.item.id}`);
    expect(item.body.context).toHaveLength(1);
    expect((await request(`/v1/items/${item.body.id}/jobs`)).body.jobs).toHaveLength(1);
    expect((await save(url, { context: { text: 'Different' } }, 'concurrent')).status).toBe(409);
  });

  it('preserves distinct concurrent saves without losing context', async () => {
    const url = `https://example.com/${crypto.randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        save(url, { context: { text: `Reason ${i}` } }, `intentional-${i}`)
      )
    );
    expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
    const item = await request(`/v1/items/${results[0].body.item.id}`);
    expect(item.body.context).toHaveLength(4);
  });

  it('keeps archive, position and completion independent', async () => {
    const saved = await save();
    const itemId = saved.body.item.id;
    expect(
      (
        await request(`/v1/items/${itemId}/progress`, {
          method: 'PATCH',
          body: { position: 120, unit: 'seconds', completed: true },
        })
      ).status
    ).toBe(200);
    await request(`/v1/items/${itemId}`, { method: 'PATCH', body: { archived: true } });
    await request(`/v1/items/${itemId}/progress`, { method: 'PATCH', body: { position: 10 } });
    const item = await request(`/v1/items/${itemId}`);
    expect(item.body.archived).toBe(true);
    expect(item.body.progress.position).toBe(10);
    expect(item.body.progress.completedAt).toBeTruthy();
    const resaved = await save(saved.body.item.url);
    expect(resaved.body.save.outcome).toBe('reactivated');
    const active = await request(`/v1/items/${itemId}`);
    expect(active.body.archived).toBe(false);
    expect(active.body.progress.completedAt).toBeTruthy();
    expect(
      (
        await request(`/v1/items/${itemId}/progress`, {
          method: 'PATCH',
          body: { position: 2, unit: 'fraction' },
        })
      ).status
    ).toBe(422);
    expect(
      (await request(`/v1/items/${itemId}`, { method: 'PATCH', body: { status: 'dismissed' } }))
        .status
    ).toBe(409);
  });

  it('keeps contributions private even when users share content identity', async () => {
    const url = `https://example.com/${crypto.randomUUID()}`;
    const a = await save(url);
    const transcript = {
      language: 'en',
      segments: [{ text: 'The private lunar kitchen hypothesis', startSeconds: 42 }],
    };
    const contribution = await request(`/v1/items/${a.body.item.id}/enrichment`, {
      method: 'POST',
      body: { field: 'transcript', value: transcript, provenance: { method: 'agent' } },
    });
    expect(contribution.status).toBe(201);
    const creatorImageUrl = 'https://example.com/publisher.jpg';
    const thumbnail = 'https://example.com/article.jpg';
    for (const [field, value] of [
      ['creatorImageUrl', creatorImageUrl],
      ['thumbnail', thumbnail],
    ]) {
      expect(
        (
          await request(`/v1/items/${a.body.item.id}/enrichment`, {
            method: 'POST',
            body: { field, value, provenance: { method: 'agent' } },
          })
        ).status
      ).toBe(201);
    }
    const ownItem = await request(`/v1/items/${a.body.item.id}`);
    expect(ownItem.body.content).toMatchObject({ creatorImageUrl, thumbnail });
    const own = await request(`/v1/items/${a.body.item.id}/transcript`);
    expect(own.status).toBe(200);
    expect(own.body.value).toEqual(transcript);
    const otherToken = await issue('other_' + crypto.randomUUID());
    const b = await request('/v1/saves', { method: 'POST', token: otherToken, body: { url } });
    expect(b.body.item.contentId).toBe(a.body.item.contentId);
    expect(b.body.item.id).not.toBe(a.body.item.id);
    const otherItem = await request(`/v1/items/${b.body.item.id}`, { token: otherToken });
    expect(otherItem.body.content).not.toHaveProperty('creatorImageUrl');
    expect((await request(`/v1/items/${a.body.item.id}`, { token: otherToken })).status).toBe(404);
    expect(
      (await request(`/v1/items/${b.body.item.id}/transcript`, { token: otherToken })).status
    ).toBe(404);
    const search = await request('/v1/items/search', {
      method: 'POST',
      token: otherToken,
      body: { query: 'lunar kitchen', match: 'keyword' },
    });
    expect(search.status).toBe(200);
    expect(search.body.items).toHaveLength(0);
    const ownSearch = await request('/v1/items/search', {
      method: 'POST',
      body: { query: 'lunar kitchen', match: 'keyword' },
    });
    expect(ownSearch.status).toBe(200);
    expect(ownSearch.body.items[0].matches[0].startSeconds).toBe(42);
  });

  it('preserves conflicting enrichment and gives explicit corrections precedence', async () => {
    const saved = await save();
    const itemId = saved.body.item.id;
    for (const [value, category] of [
      ['Source title', 'source'],
      ['Another title', 'source'],
      ['My corrected title', 'correction'],
    ]) {
      const result = await request(`/v1/items/${itemId}/enrichment`, {
        method: 'POST',
        body: { field: 'title', value, category, provenance: { method: 'agent' } },
      });
      expect(result.status).toBe(201);
    }
    const item = await request(`/v1/items/${itemId}`);
    expect(item.body.content.title).toBe('My corrected title');
    const enrichment = await request(`/v1/items/${itemId}/enrichment`);
    expect(enrichment.body.contributions).toHaveLength(3);
  });

  it('keeps learned classification private and applies the preferred value consistently to filters', async () => {
    const url = `https://example.com/${crypto.randomUUID()}`;
    const saved = await save(url);
    const itemId = saved.body.item.id;
    expect(
      (
        await request(`/v1/items/${itemId}/enrichment`, {
          method: 'POST',
          body: { field: 'type', value: 'video', provenance: { method: 'private-feed' } },
        })
      ).status
    ).toBe(201);
    expect((await request(`/v1/items/${itemId}`)).body.content.type).toBe('video');
    expect(
      (await request('/v1/items?type=video')).body.items.map((item: { id: string }) => item.id)
    ).toContain(itemId);
    const otherToken = await issue(`classification-other-${crypto.randomUUID()}`);
    const other = await request('/v1/saves', { method: 'POST', token: otherToken, body: { url } });
    expect(
      (await request(`/v1/items/${other.body.item.id}`, { token: otherToken })).body.content.type
    ).toBe('article');
    expect((await request('/v1/items?type=video', { token: otherToken })).body.items).toHaveLength(
      0
    );
    await request(`/v1/items/${itemId}/enrichment`, {
      method: 'POST',
      body: {
        field: 'type',
        value: 'article',
        category: 'correction',
        provenance: { method: 'explicit-correction' },
      },
    });
    expect((await request(`/v1/items/${itemId}`)).body.content.type).toBe('article');
    expect((await request('/v1/items?type=video')).body.items).toHaveLength(0);
  });

  it('deletes personal information and starts fresh on explicit re-save', async () => {
    const saved = await save(
      undefined,
      { context: { text: 'Secret reason' }, tags: ['old'] },
      'delete-me'
    );
    const itemId = saved.body.item.id;
    await request(`/v1/items/${itemId}/progress`, { method: 'PATCH', body: { completed: true } });
    await request(`/v1/items/${itemId}/enrichment`, {
      method: 'POST',
      body: { field: 'title', value: 'Private title', provenance: { method: 'agent' } },
    });
    expect((await request(`/v1/items/${itemId}`, { method: 'DELETE' })).status).toBe(204);
    expect((await request(`/v1/items/${itemId}`)).status).toBe(404);
    expect(
      (
        await save(
          saved.body.item.url,
          { context: { text: 'Secret reason' }, tags: ['old'] },
          'delete-me'
        )
      ).status
    ).toBe(410);
    const tombstone = await db
      .prepare('SELECT status FROM personal_items WHERE id=?')
      .bind(itemId)
      .first();
    expect(tombstone?.status).toBe('deleted');
    const resaved = await save(saved.body.item.url);
    expect(resaved.body.save.outcome).toBe('created');
    const item = await request(`/v1/items/${resaved.body.item.id}`);
    expect(item.body.context).toEqual([]);
    expect(item.body.tags).toEqual([]);
    expect(item.body.progress.completedAt).toBeNull();
    expect(item.body.content.title).toBeUndefined();
  });

  it('keeps collection ordering and references without deleting library items', async () => {
    const c = await request('/v1/collections', { method: 'POST', body: { name: 'Project' } });
    expect(c.status).toBe(201);
    const a = await save(undefined, { collectionIds: [c.body.id] });
    const b = await save();
    expect(
      (
        await request(`/v1/collections/${c.body.id}/items/${b.body.item.id}`, {
          method: 'PUT',
          body: { position: -1 },
        })
      ).status
    ).toBe(200);
    const note = await request(`/v1/collections/${c.body.id}/notes`, {
      method: 'POST',
      body: { text: 'Synthesis', itemIds: [a.body.item.id, b.body.item.id] },
    });
    expect(note.status).toBe(201);
    const read = await request(`/v1/collections/${c.body.id}`);
    expect(read.body.notes[0].itemIds.sort()).toEqual([a.body.item.id, b.body.item.id].sort());
    await request(`/v1/items/${a.body.item.id}`, { method: 'PATCH', body: { archived: true } });
    const members = await request(`/v1/items?collectionId=${c.body.id}`);
    expect(members.body.items).toHaveLength(2);
    const ordered = await request(`/v1/collections/${c.body.id}/items?limit=1`);
    expect(ordered.status).toBe(200);
    expect(ordered.body.items[0].item.id).toBe(b.body.item.id);
    const next = await request(
      `/v1/collections/${c.body.id}/items?limit=1&cursor=${encodeURIComponent(ordered.body.nextCursor)}`
    );
    expect(next.body.items[0].item.id).toBe(a.body.item.id);
    expect((await request(`/v1/collections/${c.body.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await request(`/v1/items/${a.body.item.id}`)).status).toBe(200);
  });

  it('supports stable browse cursors bound to the query', async () => {
    for (let i = 0; i < 3; i++) await save();
    const first = await request('/v1/items?limit=2');
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await request(
      `/v1/items?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`
    );
    expect(second.body.items).toHaveLength(1);
    expect(first.body.items.map((i: { id: string }) => i.id)).not.toContain(
      second.body.items[0].id
    );
    expect(
      (
        await request(
          `/v1/items?archived=false&cursor=${encodeURIComponent(first.body.nextCursor)}`
        )
      ).status
    ).toBe(422);
  });

  it('validates references and rejects SSRF targets and unknown request fields', async () => {
    for (const url of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://2130706433/',
      'http://[::1]/',
      'file:///tmp/file',
      'https://user:pass@example.com/',
      'https://example.com:8000/',
    ])
      expect((await save(url)).status).toBe(422);
    expect((await save(undefined, { userId: 'somebody-else' })).status).toBe(422);
    expect((await request('/v1/items?archived=perhaps')).status).toBe(422);
  });
  it('filters one-off saves by their preferred publisher metadata while keeping sources owner-scoped', async () => {
    const saved = await save('https://example.com/publisher-article');
    const itemId = saved.body.item.id;
    const ids = [`src_${crypto.randomUUID()}`, `src_${crypto.randomUUID()}`];
    const urls = ['https://publisher.example/', 'https://corrected-publisher.example/'];
    for (let i = 0; i < 2; i++)
      await db
        .prepare(
          'INSERT INTO sources(id,owner_id,identity_key,platform,url,name,created_at) VALUES(?,?,?,?,?,?,?)'
        )
        .bind(ids[i], owner, urls[i], 'rss', urls[i], 'Publisher', new Date().toISOString())
        .run();
    await request(`/v1/items/${itemId}/enrichment`, {
      method: 'POST',
      body: {
        field: 'source',
        value: { name: 'Publisher', url: urls[0], kind: 'publication' },
        provenance: { method: 'fixture' },
      },
    });
    const first = await request(`/v1/items?sourceId=${ids[0]}`);
    expect(first.status).toBe(200);
    expect(first.body.items.map((item: { id: string }) => item.id)).toEqual([itemId]);
    const other = await issue('different-publisher-owner');
    expect((await request(`/v1/items?sourceId=${ids[0]}`, { token: other })).body.items).toEqual(
      []
    );
    await request(`/v1/items/${itemId}/enrichment`, {
      method: 'POST',
      body: {
        field: 'source',
        value: { name: 'Corrected publisher', url: urls[1], kind: 'publication' },
        category: 'correction',
        provenance: { method: 'fixture-correction' },
      },
    });
    expect((await request(`/v1/items?sourceId=${ids[0]}`)).body.items).toEqual([]);
    expect(
      (await request(`/v1/items?sourceId=${ids[1]}`)).body.items.map(
        (item: { id: string }) => item.id
      )
    ).toEqual([itemId]);
  });
});
