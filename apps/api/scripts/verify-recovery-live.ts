import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
import { ZineClient, ZineError } from '../client';
import { cloudflare } from './cloudflare-control';
const baseUrl = 'https://zine-api-next-recovery.yw9bvbwb9f.workers.dev',
  databaseId = '29df9a64-93a0-4ada-929e-43c057b2ead8';
const restore = JSON.parse(await readFile('evidence/recovery-restore.json', 'utf8')) as {
  targetDatabase: string;
  sourceSnapshotSha256: string;
};
assert.equal(restore.targetDatabase, databaseId);
const session = await realSession(),
  client = new ZineClient({ baseUrl, token: session.getToken, retries: 0, timeoutMs: 60000 });
let probeTokenId: string | undefined, probeOwner: string | undefined;
const startedAt = new Date().toISOString(),
  hash = (text: string) => createHash('sha256').update(text).digest('hex');
async function query<T>(sql: string, params: unknown[] = []) {
  const result = await cloudflare<{ success: boolean; results: T[] }[]>(
    'd1/database/' + databaseId + '/query',
    'POST',
    { sql, params }
  );
  assert.ok(result.every((r) => r.success));
  return result[0].results;
}
try {
  const identity = await client.request<{ id: string }>('GET', '/v1/me');
  const expected = (
    await query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM personal_items WHERE owner_id=? AND status='saved'",
      [identity.id]
    )
  )[0].n;
  let count = 0,
    firstItemId: string | undefined;
  for await (const item of client.items({}, 100)) {
    assert.equal(item.status, 'saved');
    firstItemId ??= item.id;
    count++;
  }
  assert.equal(count, expected);
  assert.ok(firstItemId);
  probeOwner = 'verification:recovery:' + crypto.randomUUID();
  probeTokenId = 'tok_' + crypto.randomUUID().replaceAll('-', '');
  const raw =
    'zine2_' +
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0')
    ).join('');
  await query(
    'INSERT INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at,scopes_json) VALUES(?,?,?,?,?,?,?)',
    [
      probeTokenId,
      probeOwner,
      'Isolated recovery owner probe',
      hash(raw),
      new Date(Date.now() + 3600000).toISOString(),
      new Date().toISOString(),
      JSON.stringify(['library:read']),
    ]
  );
  const otherClient = new ZineClient({ baseUrl, token: raw, retries: 0 });
  await assert.rejects(
    otherClient.item(firstItemId),
    (error: unknown) => error instanceof ZineError && error.status === 404
  );
  assert.equal((await otherClient.list()).items.length, 0);
  const queued = process.argv.includes('--resume')
    ? {
        queued: true,
        items: (await client.request<{ indexing: { total: number } }>('GET', '/v1/ops/status'))
          .indexing.total,
      }
    : await client.request<{ queued: boolean; items: number }>('POST', '/v1/ops/index/rebuild');
  assert.equal(queued.queued, true);
  const deadline = Date.now() + 60 * 60000;
  let remaining = queued.items;
  while (Date.now() < deadline) {
    const status = await client.request<{
      indexing: { total: number; dirty: number };
      jobs: { ready: number; failed: number };
    }>('GET', '/v1/ops/status');
    remaining = status.indexing.dirty;
    await writeFile(
      '.local-data/recovery-index-progress.json',
      JSON.stringify({
        at: new Date().toISOString(),
        remaining,
        total: status.indexing.total,
        readyJobs: status.jobs.ready,
        failedJobs: status.jobs.failed,
      }) + '\n',
      { mode: 0o600 }
    );
    if (remaining === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  assert.equal(remaining, 0, 'Index rebuild did not finish within the deadline');
  const cases = [
    {
      name: 'agent-memory',
      query: 'Memory systems for AI agents and managing their context',
      url: 'https://www.anthropic.com/research/components-of-agent-memory',
    },
    {
      name: 'books-and-learning',
      query: 'Why reading a book does not reliably produce understanding or long term memory',
      url: 'https://andymatuschak.org/books/',
    },
    {
      name: 'running-and-writing',
      query: 'How writing novels relates to a daily running practice',
      url: 'https://www.newyorker.com/magazine/2008/06/09/haruki-murakami-the-running-novelist',
    },
    {
      name: 'code-review',
      query: 'Code review workflow on the team building Claude Code',
      url: 'https://claude.dev/blog/solving-code-review-at-anthropic/',
    },
  ];
  const checks: unknown[] = [];
  for (const test of cases) {
    const expectedItem = (await client.list({ url: test.url })).items[0];
    assert.ok(expectedItem, 'Expected retained reference is missing');
    for (const mode of ['keyword', 'semantic', 'hybrid'] as const) {
      const result = await client.search({
        query: mode === 'keyword' ? String(expectedItem.content.title) : test.query,
        match: mode,
        filters: { tags: ['verification:original-library'] },
        limit: 20,
      });
      const rank = result.items.findIndex((item) => item.id === expectedItem.id) + 1;
      assert.ok(rank > 0, 'Expected restored reference is absent from ' + test.name + ' ' + mode);
      assert.equal((await otherClient.search({ query: test.query, match: mode })).items.length, 0);
      checks.push({
        case: test.name,
        mode,
        rank,
        resultCount: result.items.length,
        expectedItemSha256: hash(expectedItem.id),
      });
    }
  }
  // Read retained R2 material through the actual owner-authorized API, not just the control plane.
  const retained = await query<{
    id: string;
    field: string;
    value_json: string | null;
    artifact_key: string;
  }>(
    `SELECT p.id,d.field,d.value_json,d.artifact_key FROM contributions d JOIN personal_items p ON p.content_id=d.content_id AND p.owner_id=d.owner_id
    WHERE p.owner_id=? AND p.status!='deleted' AND d.artifact_key IS NOT NULL AND d.field IN ('article','transcript','thread') ORDER BY d.created_at LIMIT 3`,
    [identity.id]
  );
  assert.ok(retained.length > 0, 'Retained material must be present for readback proof');
  for (const item of retained) {
    const material = await client.request<{ field: string; value: unknown }>(
      'GET',
      `/v1/items/${encodeURIComponent(item.id)}/${encodeURIComponent(item.field)}`
    );
    assert.equal(material.field, item.field);
    assert.ok(material.value);
  }
  const health = (await fetch(baseUrl + '/health').then((r) => r.json())) as {
    deploymentId: string;
  };
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    origin: baseUrl,
    deploymentId: health.deploymentId,
    sourceSnapshotSha256: restore.sourceSnapshotSha256,
    restoredSavedItemsRead: count,
    anotherOwnerDenied: true,
    rebuiltOwnerItems: queued.items,
    pendingIndexItems: remaining,
    searchChecks: checks,
    retainedMaterialApiReadbacks: retained.length,
    scope:
      'Actual isolated recovery Worker/D1/R2, fresh Vectorize index and Workers AI, authenticated with real Clerk. No original vectors were copied; authoritative retained text drove indexing. A controlled second-owner read-only PAT is bootstrapped in the isolated recovery database through the Cloudflare control plane and denied access through the normal API; it is not a second real Clerk login.',
    limits:
      'Four known real-library retrieval cases across three modes and bounded material readbacks; these are not a universal search-quality guarantee. No production data or provider subscriptions were changed.',
  };
  await writeFile('evidence/recovery-search-live.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  if (probeTokenId && probeOwner)
    await query('DELETE FROM api_tokens WHERE id=? AND owner_id=?', [probeTokenId, probeOwner]);
  await session.close();
}
