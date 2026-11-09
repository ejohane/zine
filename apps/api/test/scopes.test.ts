import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { runtimeHarness } from '../scripts/runtime-harness';
import { digest, now, stmt } from '../src/lib';

describe('personal API capabilities without OAuth', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  beforeAll(async () => {
    runtime = await runtimeHarness();
  });
  afterAll(async () => runtime?.close());
  async function call(token: string, path: string, method = 'GET', body?: unknown) {
    const response = await runtime.mf.dispatchFetch('http://localhost/v1' + path, {
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
  }
  async function issue(owner: string, scopes?: string[]) {
    const session = await runtime.token(owner);
    const response = await call(session, '/tokens', 'POST', {
      name: 'Scoped fixture',
      ...(scopes ? { scopes } : {}),
    });
    expect(response.status).toBe(201);
    return { session, ...response.body } as {
      session: string;
      id: string;
      token: string;
      scopes: string[];
    };
  }
  it('defaults new credentials to read-only while keeping search, metadata and no credential escalation', async () => {
    const key = await issue('scope-read');
    expect(key.scopes).toEqual(['library:read']);
    const saved = await call(key.session, '/saves', 'POST', {
      url: 'https://example.com/scoped-read',
      context: { text: 'Read scope fixture' },
    });
    expect((await call(key.token, `/items/${saved.body.item.id}`)).status).toBe(200);
    expect(
      (await call(key.token, '/items/search', 'POST', { query: 'Read scope', match: 'keyword' }))
        .body.items
    ).toHaveLength(1);
    for (const [path, method, body] of [
      ['/saves', 'POST', { url: 'https://example.com/must-not-save' }],
      [`/items/${saved.body.item.id}`, 'PATCH', { archived: true }],
      ['/collections', 'POST', { name: 'Must not create' }],
      ['/sources/resolve', 'POST', { url: 'https://example.com/feed' }],
    ] as const) {
      expect(await call(key.token, path, method, body)).toMatchObject({
        status: 403,
        body: { error: { code: 'insufficient_scope' } },
      });
    }
    expect(
      (await call(key.token, '/tokens', 'POST', { name: 'Escalation', scopes: ['library:write'] }))
        .status
    ).toBe(403);
    expect(
      (
        await call(key.token, '/connections/google', 'PUT', {
          clientId: 'fake',
          refreshToken: 'fake',
        })
      ).status
    ).toBe(403);
    expect((await call(key.token, '/account/data', 'DELETE')).status).toBe(403);
    const metadata = await call(key.session, '/tokens');
    expect(metadata.body.tokens[0].scopes).toEqual(['library:read']);
    expect(metadata.body.tokens[0]).not.toHaveProperty('scopes_json');
    expect(metadata.body.tokens[0]).not.toHaveProperty('token_hash');
    expect((await call(key.token, '/me')).body.scopes).toEqual(['library:read']);
  });
  it('enforces independent write/subscription capabilities, rejects unknown scopes, and revokes immediately', async () => {
    const key = await issue('scope-write', ['library:write']);
    const save = await call(key.token, '/saves', 'POST', { url: 'https://example.com/write-only' });
    expect(save.status).toBe(201);
    expect((await call(key.token, '/items')).status).toBe(403);
    expect((await call(key.token, '/subscriptions')).status).toBe(403);
    expect(
      (await call(key.session, '/tokens', 'POST', { name: 'Unknown', scopes: ['*'] })).status
    ).toBe(422);
    expect((await call(key.session, '/tokens', 'POST', { name: 'Empty', scopes: [] })).status).toBe(
      422
    );
    expect((await call(key.session, `/tokens/${key.id}`, 'DELETE')).status).toBe(204);
    expect((await call(key.token, '/me')).status).toBe(401);
    const subscriber = await issue('scope-subscriber', ['subscriptions:read']);
    expect((await call(subscriber.token, '/subscriptions')).status).toBe(200);
    expect((await call(subscriber.token, '/sources')).status).toBe(200);
    expect((await call(subscriber.token, '/items')).status).toBe(403);
  });
  it('preserves owner isolation and expiry, including legacy credentials migrated with prior capabilities', async () => {
    const a = await issue('scope-owner-a'),
      b = await issue('scope-owner-b');
    const saved = await call(a.session, '/saves', 'POST', {
      url: 'https://example.com/private-scope',
    });
    expect((await call(b.token, `/items/${saved.body.item.id}`)).status).toBe(404);
    await runtime.db
      .prepare('UPDATE api_tokens SET expires_at=? WHERE id=?')
      .bind('2020-01-01T00:00:00.000Z', a.id)
      .run();
    expect((await call(a.token, '/me')).status).toBe(401);
    const raw = 'zine2_' + crypto.randomUUID().replaceAll('-', '');
    await stmt(
      runtime.db as unknown as D1Database,
      'INSERT INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',
      'tok_legacy',
      'legacy-owner',
      'Legacy fixture',
      await digest(raw),
      new Date(Date.now() + 3600000).toISOString(),
      now()
    ).run();
    expect(
      (await call(raw, '/saves', 'POST', { url: 'https://example.com/legacy-scopes' })).status
    ).toBe(201);
    expect((await call(raw, '/me')).body.scopes).toEqual([
      'library:read',
      'library:write',
      'subscriptions:read',
      'subscriptions:write',
    ]);
  });
  it('cannot bypass the same capability checks through the MCP adapter', async () => {
    const key = await issue('scope-mcp');
    const saved = await call(key.session, '/saves', 'POST', {
      url: 'https://example.com/mcp-scoped',
    });
    const client = new Client({ name: 'scoped-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      requestInit: { headers: { authorization: `Bearer ${key.token}` } },
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
    });
    try {
      await client.connect(transport);
      const read = await client.callTool({
        name: 'zine_get_item',
        arguments: { itemId: saved.body.item.id },
      });
      expect(read.isError).toBe(false);
      const write = await client.callTool({
        name: 'zine_save',
        arguments: { url: 'https://example.com/forbidden-mcp' },
      });
      expect(write.isError).toBe(true);
      expect(write.structuredContent).toMatchObject({
        status: 403,
        result: { error: { code: 'insufficient_scope' } },
      });
    } finally {
      await client.close();
    }
  });
  it('preserves narrow capabilities through portability endpoints', async () => {
    const owner = 'scope-export',
      reader = await issue(owner);
    const manifest = await call(reader.token, '/export');
    expect(manifest.body.sections).toContain('items');
    for (const section of [
      'events',
      'webhooks',
      'sources',
      'routes',
      'subscriptions',
      'subscriptionSeen',
    ]) {
      expect(manifest.body.sections).not.toContain(section);
      expect((await call(reader.token, '/export/' + section)).status).toBe(403);
    }
    const events = await issue(owner, ['events:read']);
    expect((await call(events.token, '/export/events')).status).toBe(200);
    expect((await call(events.token, '/export/items')).status).toBe(403);
    const subscriptions = await issue(owner, ['subscriptions:read']);
    expect((await call(subscriptions.token, '/export/subscriptions')).status).toBe(200);
    const webhooks = await issue(owner, ['webhooks:manage']);
    expect((await call(webhooks.token, '/export/webhooks')).status).toBe(200);
  });
});
