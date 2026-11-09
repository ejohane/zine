import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
const expectedSha = process.argv[2];
if (expectedSha) assert.match(expectedSha, /^[a-f0-9]{40}$/);
const health = (await fetch('https://api-next.myzine.app/health').then((r) => r.json())) as {
  deploymentId: string;
  releaseSha?: string;
};
if (expectedSha) assert.equal(health.releaseSha, expectedSha, 'Expected release is not serving');
const snapshot = JSON.parse(await readFile('.local-data/library-snapshot.json', 'utf8')) as {
  items: { id: string; canonicalUrl: string; title: string }[];
};
const mapping = JSON.parse(await readFile('.local-data/remote-library-mapping.json', 'utf8')) as {
  legacyId: string;
  itemId: string;
}[];
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
const session = await realSession();
const observations: unknown[] = [];
let failures = 0;
try {
  for (const testCase of cases) {
    const legacy = snapshot.items.find((item) => item.canonicalUrl === testCase.url);
    assert.ok(legacy);
    const itemId = mapping.find((item) => item.legacyId === legacy.id)?.itemId;
    assert.ok(itemId);
    for (const mode of ['keyword', 'semantic', 'hybrid']) {
      const query: string = mode === 'keyword' ? legacy.title : testCase.query;
      const response: Response = await fetch('https://api-next.myzine.app/v1/items/search', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await session.getToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query,
          match: mode,
          filters: { tags: ['verification:original-library'] },
          limit: 20,
        }),
        signal: AbortSignal.timeout(60000),
      });
      const body = JSON.parse(await response.text());
      if (response.status !== 200) {
        console.log(
          JSON.stringify({
            case: testCase.name,
            mode,
            status: response.status,
            body,
            requestId: response.headers.get('x-request-id'),
          })
        );
        throw new Error('Search request failed');
      }
      assert.ok(
        body.items.every(
          (item: { tags: string[]; matches: unknown[] }) =>
            item.tags.includes('verification:original-library') && item.matches.length > 0
        )
      );
      const rank = body.items.findIndex((item: { id: string }) => item.id === itemId) + 1;
      if (!rank) failures++;
      observations.push({
        case: testCase.name,
        mode,
        query: mode === 'keyword' ? 'exact saved title' : testCase.query,
        expectedItemSha256: createHash('sha256').update(itemId).digest('hex'),
        rank: rank || null,
        resultCount: body.items.length,
        pendingIndexItems: body.index?.pendingItems ?? null,
        requestId: response.headers.get('x-request-id'),
        responseSha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      });
    }
  }
  const artifact = {
    at: new Date().toISOString(),
    origin: 'https://api-next.myzine.app',
    deploymentId: health.deploymentId,
    sourceSha: health.releaseSha ?? null,
    authentication: 'real Clerk session',
    corpus: '444 original-library references in fresh backend',
    expectedMatchWithinTop20: failures === 0,
    failures,
    observations,
  };
  await writeFile(
    expectedSha ? 'evidence/production-search-live.json' : 'evidence/search-quality.json',
    JSON.stringify(artifact, null, 2) + '\n'
  );
  console.log(JSON.stringify(artifact));
  if (failures) process.exitCode = 1;
} finally {
  await session.close();
}
