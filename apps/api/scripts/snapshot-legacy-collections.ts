/** Preserve each legacy smart collection's effective order alongside its rule definition. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [directory, ...extra] = process.argv.slice(2);
assert.ok(directory && !extra.length);
const token = process.env.ZINE_ACCESS_TOKEN;
assert.ok(token, 'The existing legacy owner token is required');
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.owner, 'user_31ejjz59G6mTX1SIyErOi0fwu4A');
const file = await readFile(resolve(directory, 'collections.json'));
assert.equal(createHash('sha256').update(file).digest('hex'), manifest.sections.collections.sha256);
const collections = JSON.parse(file.toString()) as { id: string }[];
assert.equal(collections.length, manifest.sections.collections.count);
const memberships = [];
for (const collection of collections) {
  const itemIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const url = new URL(
      '/api/v1/collections/' + encodeURIComponent(collection.id) + '/items',
      'https://api.myzine.app'
    );
    url.searchParams.set('limit', '50');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response: Response = await fetch(url, {
      headers: { authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    assert.equal(response.status, 200);
    const page = (await response.json()) as { items: { id: string }[]; nextCursor: string | null };
    for (const row of page.items) {
      assert.ok(!itemIds.has(row.id), 'Collection membership changed during capture');
      itemIds.add(row.id);
    }
    cursor = page.nextCursor;
    if (cursor) {
      assert.ok(!cursors.has(cursor));
      cursors.add(cursor);
    }
  } while (cursor);
  memberships.push({ id: collection.id, orderedLegacyIds: [...itemIds] });
}
await writeFile(
  resolve(directory, 'collection-membership.json'),
  JSON.stringify({ capturedAt: new Date().toISOString(), owner: manifest.owner, memberships }),
  { mode: 0o600, flag: 'wx' }
);
console.log(
  JSON.stringify({
    collections: memberships.length,
    members: memberships.map((row) => row.orderedLegacyIds.length),
  })
);
