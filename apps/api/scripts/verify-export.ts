import assert from 'node:assert/strict';
import { open, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
const session = await realSession();
const path = `.local-data/account-export-${Date.now()}.ndjson`;
const file = await open(path, 'wx', 0o600);
const hash = createHash('sha256');
let bytes = 0;
const counts: Record<string, number> = {};
const pages: Record<string, number> = {};
try {
  const call = async (path: string) => {
    const response = await fetch(`https://api-next.myzine.app${path}`, {
      headers: { authorization: `Bearer ${await session.getToken()}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Export HTTP ${response.status}`);
    return JSON.parse(await response.text());
  };
  const manifest = await call('/v1/export');
  assert.equal(manifest.credentialsIncluded, false);
  for (const section of manifest.sections as string[]) {
    counts[section] = 0;
    pages[section] = 0;
    let cursor: string | null = null;
    const cursors = new Set<string>();
    do {
      const page = await call(
        `/v1/export/${section}?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      );
      assert.equal(page.section, section);
      assert.equal(page.schemaVersion, 1);
      assert.equal(page.consistency, 'live');
      assert.ok(page.records.length <= 10);
      for (const record of page.records) {
        if (section === 'connections')
          assert.deepEqual(Object.keys(record).sort(), [
            'created_at',
            'provider',
            'status',
            'updated_at',
          ]);
        if (section === 'enrichment') assert.ok(Object.hasOwn(record, 'value'));
        const line = JSON.stringify({ section, record }) + '\n';
        await file.write(line);
        hash.update(line);
        bytes += Buffer.byteLength(line);
        counts[section]++;
      }
      cursor = page.nextCursor;
      if (cursor) {
        assert.equal(cursors.has(cursor), false);
        cursors.add(cursor);
      }
      pages[section]++;
    } while (cursor);
  }
  assert.ok(counts.items >= 444);
  assert.ok(counts.enrichment > 0);
  const report = {
    at: new Date().toISOString(),
    origin: 'https://api-next.myzine.app',
    authentication: 'real Clerk session',
    consistency: 'live',
    allSectionsRetrieved: true,
    counts,
    pages,
    exportSha256: hash.digest('hex'),
    bytes,
    privateArtifactPermissions: '0600',
    credentialValuesExported: false,
  };
  await writeFile('evidence/account-export.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await file.close();
  await session.close();
}
