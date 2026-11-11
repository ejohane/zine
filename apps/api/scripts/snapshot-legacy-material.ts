/** Read only the legacy R2 objects referenced by the verified owner snapshot. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyArticleBodyArtifactIntegrity } from '../../worker/src/article-body/artifact';
import type { ArticleBodyArtifact } from '../../worker/src/article-body/types';
import { cloudflareR2Object } from './cloudflare-control';

const [directory, ...extra] = process.argv.slice(2);
assert.ok(directory && !extra.length, 'Provide a completed private source snapshot directory');
const expectedOwner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')) as {
  owner: string;
  database: string;
  sections: Record<string, { count: number; sha256: string }>;
};
assert.equal(manifest.owner, expectedOwner);
assert.equal(manifest.database, '82911dea-5a6b-411b-ab4b-4145cb0c191d');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function readSection<T>(name: string) {
  const bytes = await readFile(resolve(directory, name + '.json'));
  assert.equal(sha256(bytes), manifest.sections[name].sha256);
  const records = JSON.parse(bytes.toString()) as T[];
  assert.equal(records.length, manifest.sections[name].count);
  return records;
}
const items = await readSection<{
  id: string;
  item_id: string;
  article_content_key: string | null;
  current_article_version_id: string | null;
}>('items');
const versions = await readSection<{
  id: string;
  item_id: string;
  r2_key: string;
  content_hash: string;
}>('articleVersions');
const ownedItems = new Map(items.map((item) => [item.item_id, item]));
const references = [
  ...versions.map((version) => {
    const item = ownedItems.get(version.item_id);
    assert.ok(item);
    return {
      id: version.id,
      itemId: version.item_id,
      key: version.r2_key,
      contentHash: version.content_hash,
      current: version.id === item.current_article_version_id,
    };
  }),
  ...items.flatMap((item) =>
    item.article_content_key
      ? [
          {
            id: item.id,
            itemId: item.item_id,
            key: item.article_content_key,
            contentHash: null,
            current: false,
          },
        ]
      : []
  ),
];
const output = resolve(directory, 'material');
await mkdir(output, { mode: 0o700 });
const results = [];
for (let offset = 0; offset < references.length; offset += 8) {
  results.push(
    ...(await Promise.all(
      references.slice(offset, offset + 8).map(async (reference) => {
        assert.match(reference.id, /^[0-9A-HJKMNP-TV-Z]{26}$/i);
        const response = await cloudflareR2Object('zine-article-content-prod', reference.key);
        const metadata = {
          id: reference.id,
          itemId: reference.itemId,
          sourceHash: reference.contentHash,
          current: reference.current,
        };
        if (response.status === 404) return { ...metadata, status: 'missing' as const };
        assert.equal(response.status, 200);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (reference.contentHash) {
          const artifact = JSON.parse(new TextDecoder().decode(bytes)) as ArticleBodyArtifact;
          assert.ok(
            artifact.itemId === reference.itemId && artifact.contentHash === reference.contentHash
          );
          assert.ok(
            await verifyArticleBodyArtifactIntegrity(artifact),
            'Legacy artifact integrity check failed'
          );
        }
        const file = (reference.contentHash ? 'version-' : 'legacy-') + reference.id;
        await writeFile(resolve(output, file), bytes, { mode: 0o600, flag: 'wx' });
        return {
          ...metadata,
          status: 'verified' as const,
          file,
          bytes: bytes.length,
          sha256: sha256(bytes),
        };
      })
    ))
  );
}
await writeFile(
  resolve(output, 'manifest.json'),
  JSON.stringify({ owner: expectedOwner, results }),
  {
    mode: 0o600,
    flag: 'wx',
  }
);
console.log(
  JSON.stringify({
    references: results.length,
    verified: results.filter((result) => result.status === 'verified').length,
    missing: results.filter((result) => result.status === 'missing').length,
    currentVersioned: results.filter((result) => result.status === 'verified' && result.current)
      .length,
  })
);
