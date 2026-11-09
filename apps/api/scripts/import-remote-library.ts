import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';

interface LegacyItem {
  id: string;
  canonicalUrl: string;
  provider: string;
  title?: string;
  summary?: string;
  tags?: (string | { name: string })[];
  isFinished?: boolean;
}
const raw = await readFile('.local-data/library-snapshot.json', 'utf8');
const snapshot = JSON.parse(raw) as { complete: boolean; items: LegacyItem[] };
if (!snapshot.complete) throw new Error('A complete read-only source snapshot is required');
const origin = 'https://api-next.myzine.app';
const importTag = 'verification:original-library';
const session = await realSession();
const mapping: { legacyId: string; itemId: string; provider: string }[] = [];
const failures: { legacyId: string; provider: string; status: number; code: string }[] = [];
async function call(path: string, method = 'GET', body?: unknown, key?: string) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await session.getToken()}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : JSON.parse(await response.text()),
  };
}
try {
  for (let offset = 0; offset < snapshot.items.length; offset += 4) {
    await Promise.all(
      snapshot.items.slice(offset, offset + 4).map(async (item) => {
        const tags = [
          ...new Set([
            ...(item.tags ?? []).map((tag) => (typeof tag === 'string' ? tag : tag.name)),
            importTag,
          ]),
        ];
        const result = await call(
          '/v1/saves',
          'POST',
          { url: item.canonicalUrl, tags },
          `real-library-${item.id}`
        );
        if (![200, 201].includes(result.status)) {
          failures.push({
            legacyId: item.id,
            provider: item.provider,
            status: result.status,
            code: result.body.error?.code ?? 'unknown',
          });
          return;
        }
        const itemId = result.body.item.id;
        mapping.push({ legacyId: item.id, itemId, provider: item.provider });
        // Existing title is explicitly contributed as imported metadata, so a failed
        // new extraction cannot erase information the user's library already held.
        // This contribution is never counted as live extraction evidence.
        if (item.title) {
          const retained = await call(`/v1/items/${itemId}/enrichment`);
          const prior =
            retained.status === 200
              ? retained.body.contributions.find(
                  (entry: { field: string; value: unknown; provenance: { method: string } }) =>
                    entry.field === 'title' &&
                    entry.provenance.method === 'existing-library-import' &&
                    entry.value === item.title
                )
              : null;
          if (!prior) {
            const enriched = await call(`/v1/items/${itemId}/enrichment`, 'POST', {
              field: 'title',
              value: item.title,
              provenance: { method: 'existing-library-import', sourceUrl: item.canonicalUrl },
            });
            if (enriched.status !== 201)
              failures.push({
                legacyId: item.id,
                provider: item.provider,
                status: enriched.status,
                code: enriched.body.error?.code ?? 'metadata_import_failed',
              });
          }
        }
        if (item.isFinished)
          await call(`/v1/items/${itemId}/progress`, 'PATCH', { completed: true });
      })
    );
    console.log(
      JSON.stringify({
        stage: 'remote-library-import',
        processed: Math.min(offset + 4, snapshot.items.length),
        total: snapshot.items.length,
        failures: failures.length,
      })
    );
  }
  const retrieved = new Set<string>();
  let cursor: string | null = null;
  do {
    const response = await call(
      `/v1/items?tag=${encodeURIComponent(importTag)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    );
    if (response.status !== 200)
      throw new Error(`Remote browse failed with HTTP ${response.status}`);
    for (const item of response.body.items) retrieved.add(item.id);
    cursor = response.body.nextCursor;
  } while (cursor);
  await mkdir('evidence', { recursive: true });
  await writeFile('.local-data/remote-library-mapping.json', JSON.stringify(mapping, null, 2), {
    mode: 0o600,
  });
  await writeFile('.local-data/remote-library-failures.json', JSON.stringify(failures, null, 2), {
    mode: 0o600,
  });
  const report = {
    at: new Date().toISOString(),
    origin,
    scope:
      'real Clerk-authenticated HTTP import and paginated readback against fresh remote resources; extraction acceptance is separate',
    snapshotSha256: createHash('sha256').update(raw).digest('hex'),
    expected: snapshot.items.length,
    imported: mapping.length,
    uniqueRetrieved: retrieved.size,
    failureCount: failures.length,
    providers: Object.fromEntries(
      [...new Set(mapping.map((item) => item.provider))]
        .sort()
        .map((provider) => [provider, mapping.filter((item) => item.provider === provider).length])
    ),
  };
  await writeFile('evidence/remote-library-import.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (failures.length || retrieved.size !== new Set(mapping.map((item) => item.itemId)).size)
    process.exitCode = 1;
} finally {
  await session.close();
}
