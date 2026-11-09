import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const log = await readFile('.local-data/latest-tests.log', 'utf8');
assert.match(log, /Tests\s+102 passed \(102\)/);
assert.match(log, /Test Files\s+21 passed \(21\)/);
const erasure = JSON.parse(await readFile('evidence/isolated-corpus-erasure.json', 'utf8'));
assert.equal(erasure.expected, 444);
assert.equal(erasure.allAuthoritativeDataErased, true);
assert.equal(erasure.freshGenerationVerified, true);
const files = [
  'src/auth.ts',
  'src/lib.ts',
  'src/connections.ts',
  'src/enrichment.ts',
  'src/subscriptions.ts',
  'src/access.ts',
  'src/personal.ts',
  'src/semantic.ts',
  'src/reconciliation.ts',
  'test/request-erasure.test.ts',
  'test/ingestion.test.ts',
];
const sources = Object.fromEntries(
  await Promise.all(
    files.map(async (path) => [
      path,
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    ])
  )
);
await writeFile(
  'evidence/erasure-concurrency.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      scope:
        'Controlled real workerd/D1/R2 HTTP and helper checks with a synthetic signed issuer and synthetic Google responses; not live Google authorization or deployed account erasure',
      allAssertionsPassed: true,
      fullSuite: { tests: 102, files: 21 },
      scenarios: [
        'Google exchange completing after erasure cannot recreate a connection; another owner and fresh requests remain functional',
        'Successful stale refresh cannot overwrite a disconnected and reconnected grant',
        'Failed stale refresh cannot expire a disconnected and reconnected grant',
        'Feed discovery completing after erasure cannot recreate sources or routes',
        'Authentication-time generation fences reject stale item and owner writes while fresh collection/capture operations succeed',
        'Forty-five initial arrivals resume in bounded jobs without refetching or losing the preceding baseline',
      ],
      realLibraryErasure: {
        items: 444,
        allAuthoritativeDataErased: true,
        freshGenerationVerified: true,
        artifact: 'isolated-corpus-erasure.json',
        at: erasure.at,
      },
      logSha256: createHash('sha256').update(log).digest('hex'),
      sources,
    },
    null,
    2
  ) + '\n'
);
console.log(
  JSON.stringify({
    scenarios: 6,
    fullSuiteTests: 102,
    realLibraryItems: 444,
    allAssertionsPassed: true,
  })
);
