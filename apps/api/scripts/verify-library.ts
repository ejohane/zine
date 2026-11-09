import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { extractWeb } from '../src/providers/web';
import { runtimeHarness } from './runtime-harness';

interface LegacyItem {
  id: string;
  canonicalUrl: string;
  title?: string;
  provider: string;
  contentType?: string;
  summary?: string;
  duration?: number;
  publishedAt?: string;
  tags?: (string | { name: string })[];
  isFinished?: boolean;
}
const raw = await readFile('.local-data/library-snapshot.json', 'utf8');
const snapshot = JSON.parse(raw) as {
  items: LegacyItem[];
  complete: boolean;
  pages: number;
  capturedAt: string;
};
assert.equal(snapshot.complete, true);
const runtime = await runtimeHarness();
const token = await runtime.token('isolated-real-library-owner');
const otherToken = await runtime.token('isolated-other-user');
const mapping: { legacyId: string; itemId: string; provider: string }[] = [];
const failures: { legacyId: string; provider: string; status: number; code: string }[] = [];
const transcript: { operation: string; status: number; assertions: string[] }[] = [];
let requests = 0;
async function request(path: string, method = 'GET', body?: unknown, auth = token, key?: string) {
  requests++;
  const response = await runtime.mf.dispatchFetch(`http://localhost${path}`, {
    method,
    headers: {
      authorization: `Bearer ${auth}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : JSON.parse(await response.text()),
  };
}
try {
  for (const item of snapshot.items) {
    const tags = (item.tags ?? []).map((tag) => (typeof tag === 'string' ? tag : tag.name));
    const result = await request(
      '/v1/saves',
      'POST',
      { url: item.canonicalUrl, tags },
      token,
      `legacy-${item.id}`
    );
    if (![200, 201].includes(result.status)) {
      failures.push({
        legacyId: item.id,
        provider: item.provider,
        status: result.status,
        code: result.body.error.code,
      });
      continue;
    }
    const itemId = result.body.item.id;
    mapping.push({ legacyId: item.id, itemId, provider: item.provider });
    for (const [field, value] of [
      ['title', item.title],
      ['summary', item.summary],
    ] as const)
      if (value) {
        const contribution = await request(`/v1/items/${itemId}/enrichment`, 'POST', {
          field,
          value,
          category: field === 'summary' ? 'derived' : 'source',
          provenance: {
            method: 'isolated-legacy-library-import',
            description:
              'Existing library metadata imported for verification; not live provider extraction',
          },
        });
        assert.equal(
          contribution.status,
          201,
          `Metadata import failed: ${contribution.body.error?.code}`
        );
      }
    if (item.isFinished)
      assert.equal(
        (await request(`/v1/items/${itemId}/progress`, 'PATCH', { completed: true })).status,
        200
      );
    const read = await request(`/v1/items/${itemId}`);
    assert.equal(read.status, 200);
    if (item.title) assert.equal(read.body.content.title, item.title);
    assert.equal(!!read.body.progress.completedAt, !!item.isFinished);
  }
  const providers = Object.fromEntries(
    [...new Set(mapping.map((m) => m.provider))]
      .sort()
      .map((provider) => [provider, mapping.filter((m) => m.provider === provider).length])
  );
  let cursor: string | null = null;
  const retrieved = new Set<string>();
  let pages = 0;
  do {
    const response = await request(
      `/v1/items?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    );
    assert.equal(response.status, 200);
    for (const item of response.body.items) {
      assert.equal(retrieved.has(item.id), false, 'Pagination returned a duplicate');
      retrieved.add(item.id);
    }
    cursor = response.body.nextCursor;
    pages++;
  } while (cursor);
  assert.equal(retrieved.size, new Set(mapping.map((m) => m.itemId)).size);
  transcript.push({
    operation: 'browse imported library across cursors',
    status: 200,
    assertions: [
      `${retrieved.size} unique personal items`,
      `${pages} pages`,
      'no pagination duplicates',
    ],
  });
  const other = await request('/v1/items', 'GET', undefined, otherToken);
  assert.equal(other.status, 200);
  assert.equal(other.body.items.length, 0);
  transcript.push({
    operation: 'other-user library isolation',
    status: 200,
    assertions: ['empty library for unrelated authenticated user'],
  });
  for (const provider of Object.keys(providers)) {
    const representative = mapping.find((m) => m.provider === provider)!;
    const read = await request(`/v1/items/${representative.itemId}`);
    assert.equal(read.status, 200);
    const forbidden = await request(
      `/v1/items/${representative.itemId}`,
      'GET',
      undefined,
      otherToken
    );
    assert.equal(forbidden.status, 404);
    transcript.push({
      operation: `${provider} representative read and isolation`,
      status: 200,
      assertions: ['imported metadata retrieved', 'other user receives 404'],
    });
  }
  const search = await request('/v1/items/search', 'POST', { query: 'AI', match: 'keyword' });
  assert.equal(search.status, 200);
  for (const item of search.body.items) assert.ok(item.matches.length);
  transcript.push({
    operation: 'keyword search over imported retained information',
    status: search.status,
    assertions: [`${search.body.items.length} first-page results`, 'match evidence included'],
  });
  // Exercise portability and erasure against this isolated real-corpus copy.
  const articleSource = snapshot.items.find(
    (item) => item.canonicalUrl === 'https://andymatuschak.org/books/'
  );
  assert.ok(articleSource);
  const articleItem = mapping.find((item) => item.legacyId === articleSource.id)!;
  const extraction = await extractWeb(articleSource.canonicalUrl);
  const article = extraction.contributions.find((value) => value.field === 'article');
  assert.ok(article);
  const retained = await request(`/v1/items/${articleItem.itemId}/enrichment`, 'POST', article);
  assert.equal(retained.status, 201);
  const key = await request('/v1/tokens', 'POST', {
    name: 'isolated export and erasure verification',
  });
  assert.equal(key.status, 201);
  const pat: string = key.body.token;
  assert.equal((await request('/v1/me', 'GET', undefined, pat)).status, 200);
  const manifest = await request('/v1/export');
  assert.equal(manifest.status, 200);
  assert.equal(manifest.body.credentialsIncluded, false);
  const exportedCounts: Record<string, number> = {};
  let artifactSeen = false;
  for (const section of manifest.body.sections as string[]) {
    let cursor: string | null = null;
    exportedCounts[section] = 0;
    do {
      const page = await request(
        `/v1/export/${section}?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      );
      assert.equal(page.status, 200);
      exportedCounts[section] += page.body.records.length;
      if (section === 'enrichment')
        artifactSeen ||= page.body.records.some(
          (entry: { id: string; value: unknown }) =>
            entry.id === retained.body.id &&
            JSON.stringify(entry.value) === JSON.stringify(article.value)
        );
      cursor = page.body.nextCursor;
    } while (cursor);
  }
  assert.equal(exportedCounts.items, retrieved.size);
  assert.equal(artifactSeen, true);
  const erased = await request('/v1/account/data', 'DELETE');
  assert.equal(erased.status, 200);
  assert.equal(erased.body.authoritativeDataDeleted, true);
  assert.equal((await request('/v1/me', 'GET', undefined, pat)).status, 401);
  assert.deepEqual((await request('/v1/items')).body.items, []);
  assert.equal((await request(`/v1/items/${articleItem.itemId}`)).status, 404);
  assert.deepEqual((await request('/v1/export/enrichment')).body.records, []);
  const oldArtifacts = await runtime.db
    .prepare('SELECT COUNT(*) AS n FROM artifact_garbage')
    .first<{ n: number }>();
  assert.ok(oldArtifacts!.n > 0);
  const resurrected = await request('/v1/saves', 'POST', { url: articleSource.canonicalUrl });
  assert.equal(resurrected.status, 201);
  const fresh = await request(`/v1/items/${resurrected.body.item.id}`);
  assert.deepEqual(fresh.body.context, []);
  assert.deepEqual(fresh.body.tags, []);
  assert.deepEqual(fresh.body.enrichment.fields, {});
  assert.equal(fresh.body.progress.completedAt, null);
  await mkdir('evidence', { recursive: true });
  await writeFile(
    'evidence/isolated-corpus-erasure.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope:
          'HTTP checks on an isolated local workerd/D1/R2 copy of the real library; synthetic signed issuer, not production account erasure',
        expected: snapshot.items.length,
        exportedCounts,
        realRetainedArticleRoundTripped: true,
        allAuthoritativeDataErased: true,
        credentialRevoked: true,
        artifactCleanupQueued: true,
        freshGenerationVerified: true,
      },
      null,
      2
    ) + '\n'
  );
  const report = {
    at: new Date().toISOString(),
    scope: {
      runtime: 'local workerd / D1 / R2',
      authentication: 'synthetic signed issuer; not production Clerk proof',
      data: 'real read-only existing library snapshot',
      providerExtraction: 'not exercised by this import',
    },
    snapshot: {
      sha256: createHash('sha256').update(raw).digest('hex'),
      capturedAt: snapshot.capturedAt,
      pages: snapshot.pages,
      itemCount: snapshot.items.length,
    },
    results: {
      imported: mapping.length,
      uniqueItems: retrieved.size,
      providers,
      requests,
      failures,
    },
    transcript,
  };
  await mkdir('evidence', { recursive: true });
  await writeFile('evidence/library-import.json', JSON.stringify(report, null, 2));
  await writeFile('.local-data/library-mapping.json', JSON.stringify(mapping, null, 2), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      report: 'evidence/library-import.json',
      imported: mapping.length,
      uniqueItems: retrieved.size,
      providers,
      failures: failures.length,
      requests,
    })
  );
  assert.equal(
    failures.length,
    0,
    'Some real-library items failed capture; inspect the local report'
  );
} finally {
  await runtime.close();
}
