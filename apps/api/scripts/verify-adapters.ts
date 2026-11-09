import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { realSession } from './clerk-session';
const session = await realSession();
const client = new Client({ name: 'zine-real-service-verifier', version: '1.0.0' });
const observations: { operation: string; status: number }[] = [];
try {
  const transport = new StreamableHTTPClientTransport(new URL('https://api-next.myzine.app/mcp'), {
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${await session.getToken()}`);
      return fetch(input, { ...init, headers });
    },
  });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(tools.tools.length >= 8);
  async function call(name: string, args: Record<string, unknown>) {
    const response = await client.callTool({ name, arguments: args });
    const body = response.structuredContent as
      | { status: number; result: Record<string, unknown> }
      | undefined;
    if (!body) throw new Error(`Missing structured response for ${name}`);
    observations.push({ operation: name, status: body.status });
    assert.equal(response.isError, false);
    return body;
  }
  const saved = await call('zine_save', {
    url: 'https://www.rssboard.org/rss-specification',
    context: { text: 'Deployed MCP adapter verification' },
    tags: ['api-verification'],
    idempotencyKey: 'deployed-mcp-proof-1',
  });
  const itemId = (saved.result.item as { id: string }).id;
  const replay = await call('zine_save', {
    url: 'https://www.rssboard.org/rss-specification',
    context: { text: 'Deployed MCP adapter verification' },
    tags: ['api-verification'],
    idempotencyKey: 'deployed-mcp-proof-1',
  });
  assert.deepEqual(replay.result.save, saved.result.save);
  const item = await call('zine_get_item', { itemId });
  assert.ok(
    (item.result.context as { text: string }[]).some(
      (entry) => entry.text === 'Deployed MCP adapter verification'
    )
  );
  const search = await call('zine_search', {
    query: 'Deployed MCP adapter verification',
    match: 'keyword',
  });
  assert.ok((search.result.items as { id: string }[]).some((entry) => entry.id === itemId));
  const denied = await client.callTool({
    name: 'zine_request',
    arguments: { path: '/v1/connections/google', method: 'DELETE' },
  });
  assert.equal(denied.isError, true);
  const restrictedPaths = [
    '/v1/tokens?probe=1',
    '/v1/items/../tokens',
    '/v1/items/%2e%2e/tokens',
    '/v1/%74okens',
    '/v1//tokens',
  ];
  for (const path of restrictedPaths) {
    const denied = await client.callTool({
      name: 'zine_request',
      arguments: { path, method: 'GET' },
    });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent, undefined);
  }
  const cliRaw = await readFile('.local-data/cli-library-proof.json', 'utf8');
  const cli = JSON.parse(cliRaw) as { items: { id: string }[]; nextCursor: string | null };
  assert.equal(cli.items.length, 2);
  assert.ok(cli.nextCursor);
  const report = {
    at: new Date().toISOString(),
    origin: 'https://api-next.myzine.app',
    authentication: 'real Clerk session',
    mcp: {
      officialClient: true,
      toolCount: tools.tools.length,
      observations,
      idempotencyReplay: true,
      credentialManagementDenied: true,
      canonicalPathRestrictionChecks: restrictedPaths.length,
    },
    cli: {
      actualCommand: 'list --limit 2 --output',
      returned: cli.items.length,
      hasCursor: !!cli.nextCursor,
      responseSha256: createHash('sha256').update(cliRaw).digest('hex'),
    },
  };
  await writeFile('evidence/adapters.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await client.close();
  await session.close();
}
