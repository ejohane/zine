import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { realSession } from './clerk-session';
import { ZineClient, ZineError } from '../client';
const expectedSha = process.argv[2];
assert.match(expectedSha ?? '', /^[a-f0-9]{40}$/, 'Supply the exact released source SHA');
const origin = 'https://api-next.myzine.app';
const health = (await fetch(origin + '/health').then((r) => r.json())) as {
  deploymentId: string;
  releaseSha: string;
};
assert.equal(
  health.releaseSha,
  expectedSha,
  'The expected source is not serving; no probe writes performed'
);
const session = await realSession(),
  admin = new ZineClient({ baseUrl: origin, token: session.getToken, retries: 0 });
const keys: string[] = [],
  items = new Set<string>();
let reader: ZineClient | undefined,
  mcp: Client | undefined,
  report: Record<string, unknown> | undefined;
const startedAt = new Date().toISOString(),
  run = crypto.randomUUID();
try {
  async function issue(scopes: string[]) {
    const key = await admin.request<{ id: string; token: string }>('POST', '/v1/tokens', {
      name: 'Controlled production acceptance ' + run,
      expiresInDays: 1,
      scopes,
    });
    keys.push(key.id);
    return { ...key, client: new ZineClient({ baseUrl: origin, token: key.token, retries: 2 }) };
  }
  const write = await issue(['library:write']),
    read = await issue(['library:read', 'events:read']);
  reader = read.client;
  const shared = 'https://example.com/zine-acceptance-' + run,
    tag = 'verification:productionization:' + run;
  const captures = Array.from({ length: 5 }, (_, index) => ({
    url: shared,
    context: { text: 'Zine acceptance ' + run + ' shared capture ' + index },
    tags: [tag],
  }));
  const unique = Array.from({ length: 5 }, (_, index) => ({
    url: shared + '-' + index,
    context: { text: 'Zine acceptance ' + run + ' distinct capture ' + index },
    tags: [tag],
  }));
  const attempts = [
    ...captures.flatMap((input, index) =>
      [0, 1].map(() => ({ input, key: run + '-shared-' + index }))
    ),
    ...unique.map((input, index) => ({ input, key: run + '-unique-' + index })),
  ];
  const results = await Promise.allSettled(
    attempts.map(async ({ input, key }) => {
      const receipt = await write.client.save(input, key);
      items.add(receipt.item.id);
      return receipt;
    })
  );
  assert.ok(
    results.every((result) => result.status === 'fulfilled'),
    'At least one controlled save failed'
  );
  assert.equal(items.size, 6);
  const sharedId = (results[0] as PromiseFulfilledResult<{ item: { id: string } }>).value.item.id;
  const item = await reader.item(sharedId);
  assert.equal(item.context.length, 5);
  assert.equal(item.occurrences.length, 5);
  for (const id of items) {
    const saved = await reader.item(id);
    assert.equal(saved.status, 'saved');
    if (id !== sharedId) {
      assert.equal(saved.context.length, 1);
      assert.equal(saved.occurrences.length, 1);
    }
  }
  const pagedIds: string[] = [];
  for await (const saved of reader.items({ tags: [tag] }, 2)) pagedIds.push(saved.id);
  assert.equal(new Set(pagedIds).size, 6);
  assert.equal(pagedIds.length, 6);
  assert.equal(
    (await reader.search({ query: run, match: 'keyword', filters: { tags: [tag] } })).items.length,
    6
  );
  await assert.rejects(
    write.client.item(sharedId),
    (error: unknown) => error instanceof ZineError && error.status === 403
  );
  await assert.rejects(
    reader.save({ url: shared + '-denied' }),
    (error: unknown) => error instanceof ZineError && error.status === 403
  );
  await write.client.request('PATCH', `/v1/items/${sharedId}/progress`, { completed: true });
  await write.client.request('PATCH', `/v1/items/${sharedId}`, { archived: true });
  const archived = await reader.item(sharedId);
  assert.equal(archived.archived, true);
  assert.ok(archived.progress.completedAt);
  assert.equal(archived.status, 'saved');
  let cursor = '0',
    replayed = 0;
  const created = new Set<string>();
  for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
    const events = await reader.request<{
      events: { subjectId: string; type: string }[];
      nextCursor: string;
      hasMore: boolean;
    }>('GET', '/v1/events?limit=100&cursor=' + cursor);
    replayed += events.events.length;
    for (const event of events.events)
      if (event.type === 'item.created' && items.has(event.subjectId)) created.add(event.subjectId);
    cursor = events.nextCursor;
    if (!events.hasMore) break;
  }
  assert.equal(created.size, 6, 'Every accepted new reference needs its transactional event');
  mcp = new Client({ name: 'zine-production-acceptance', version: '1.0.0' });
  await mcp.connect(
    new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
      requestInit: { headers: { authorization: 'Bearer ' + read.token } },
    })
  );
  const tools = await mcp.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'zine_get_item'));
  const mcpRead = await mcp.callTool({ name: 'zine_get_item', arguments: { itemId: sharedId } });
  assert.equal(mcpRead.isError, false);
  assert.equal(
    (mcpRead.structuredContent as { result: { context: unknown[] } }).result.context.length,
    5
  );
  const denied = await mcp.callTool({
    name: 'zine_save',
    arguments: { url: shared + '-mcp-denied' },
  });
  const deniedBody = denied.structuredContent as {
    status: number;
    result?: { item?: { id: string } };
  };
  if (deniedBody.result?.item?.id) items.add(deniedBody.result.item.id);
  assert.equal(denied.isError, true);
  assert.equal(deniedBody.status, 403);
  report = {
    startedAt,
    completedAt: new Date().toISOString(),
    origin,
    deploymentId: health.deploymentId,
    sourceSha: health.releaseSha,
    checks: {
      concurrentRequests: attempts.length,
      durableReferences: 6,
      sharedContexts: 5,
      sharedOccurrences: 5,
      uniqueReferences: 5,
      noLostAcceptedSave: true,
      noDuplicateRetryOccurrence: true,
      keywordRetrieval: true,
      libraryPagination: true,
      writeTokenCannotRead: true,
      readTokenCannotWrite: true,
      archiveAndCompletionIndependent: true,
      createdEventsReplayed: created.size,
      replayedEvents: replayed,
      realMcpRead: true,
      mcpDeniedWrite: true,
    },
    contextDigest: createHash('sha256').update(JSON.stringify(item.context)).digest('hex'),
    scope:
      'Actual released Cloudflare production service, real Clerk and ephemeral scoped PATs, official MCP client over HTTP. Only unique controlled verification references are written and removed. No auth bypass or fixture issuer.',
    limits:
      'Bounded concurrency and contract cases. Source extraction for example.com references is not asserted; accepted context remains independently durable. Upstream provider health and long-running operation are separate receipts.',
  };
} finally {
  await mcp?.close();
  const removed = await Promise.allSettled(
    [...items].map((id) => admin.request('DELETE', '/v1/items/' + id))
  );
  let absent = true;
  if (reader)
    for (const id of items)
      try {
        await reader.item(id);
        absent = false;
      } catch (error) {
        if (!(error instanceof ZineError && error.status === 404)) absent = false;
      }
  const revoked = await Promise.allSettled(
    keys.map((id) => admin.request('DELETE', '/v1/tokens/' + id))
  );
  await session.close();
  assert.ok(
    removed.every((r) => r.status === 'fulfilled') &&
      revoked.every((r) => r.status === 'fulfilled') &&
      absent,
    'Controlled acceptance cleanup failed'
  );
}
assert.ok(report);
report.cleanupConfirmed = true;
await writeFile('evidence/production-live.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
