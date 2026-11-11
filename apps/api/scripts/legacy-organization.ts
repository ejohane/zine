/** Preserve original organization as portable records and project Next collections and tags. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stableId } from '../src/lib';
import { cloudflare, environments } from './cloudflare-control';

const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const [directory, planFile, mode, ...extra] = process.argv.slice(2);
assert.ok(directory && planFile && (!mode || mode === '--apply') && !extra.length);
const manifestBytes = await readFile(resolve(directory, 'manifest.json'));
const manifest = JSON.parse(manifestBytes.toString()) as {
  owner: string;
  sections: Record<string, { sha256: string; count: number }>;
};
const plan = JSON.parse(await readFile(planFile, 'utf8')) as {
  owner: string;
  generation: number;
  sourceManifestSha256: string;
  plan: { itemId: string; legacyIds: string[]; action: string }[];
};
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.owner, owner);
assert.equal(plan.owner, owner);
assert.equal(plan.sourceManifestSha256, sha256(manifestBytes));
assert.equal(plan.generation, 0);
async function readSection<T>(section: string): Promise<T[]> {
  const bytes = await readFile(resolve(directory, section + '.json'));
  assert.equal(sha256(bytes), manifest.sections[section].sha256);
  const rows = JSON.parse(bytes.toString()) as T[];
  assert.equal(rows.length, manifest.sections[section].count);
  return rows;
}
const [tags, assignments, collections, overrides, membershipRaw] = await Promise.all([
  readSection<{ id: string; name: string }>('tags'),
  readSection<{ id: string; tag_id: string; user_item_id: string }>('tagAssignments'),
  readSection<{
    id: string;
    name: string;
    description: string | null;
    created_at: number;
    updated_at: number;
  }>('collections'),
  readSection<{ id: string; collection_id: string; user_item_id: string }>('collectionOverrides'),
  readFile(resolve(directory, 'collection-membership.json'), 'utf8'),
]);
const membership = JSON.parse(membershipRaw) as {
  owner: string;
  memberships: { id: string; orderedLegacyIds: string[] }[];
};
assert.equal(membership.owner, owner);
const targetByLegacyId = new Map(
  plan.plan.flatMap((entry) => entry.legacyIds.map((id) => [id, entry] as const))
);
const byTag = new Map(tags.map((tag) => [tag.id, tag]));
const path = `d1/database/${environments.production.databaseId}/query`;
const q = (value: string | null | number) => {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value));
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
};
const ownerSql = q(owner);
const targetPredicate = (id: string) => `p.id=${q(id)} AND p.owner_id=${ownerSql}`;
const ledgerRecord = (section: string, row: { id: string }, itemId?: string) => {
  const payload = q(JSON.stringify(row));
  const leading = `INSERT INTO legacy_import_records(owner_id,section,legacy_id,item_id,payload_json)`;
  return itemId
    ? `${leading} SELECT ${ownerSql},${q(section)},${q(row.id)},p.id,
      CASE WHEN p.status!='deleted' THEN ${payload} END FROM personal_items p
      WHERE ${targetPredicate(itemId)} ON CONFLICT(owner_id,section,legacy_id) DO NOTHING`
    : `${leading} VALUES(${ownerSql},${q(section)},${q(row.id)},NULL,${payload})
       ON CONFLICT(owner_id,section,legacy_id) DO NOTHING`;
};
const tagBatches = tags.map((row) => [ledgerRecord('tags', row)]);
let projectedTags = 0;
let unmatchedTags = 0;
for (const row of assignments) {
  const item = targetByLegacyId.get(row.user_item_id);
  const tag = byTag.get(row.tag_id);
  assert.ok(tag);
  if (!item) {
    unmatchedTags++;
    continue;
  }
  const statements = [ledgerRecord('tagAssignments', row, item.itemId)];
  if (item.action === 'create') {
    projectedTags++;
    // New imports own only their initial tag projection. On rerun the prior
    // receipt suppresses additions after a person removed a tag in Next.
    statements.push(
      `INSERT OR IGNORE INTO item_tags(item_id,tag)
      SELECT p.id,${q(tag.name)} FROM personal_items p WHERE ${targetPredicate(item.itemId)}
      AND p.status!='deleted' AND p.revision=0
      AND EXISTS(SELECT 1 FROM legacy_import_records WHERE owner_id=${ownerSql}
        AND section='tagAssignments' AND legacy_id=${q(row.id)} AND applied_json IS NULL)`,
      `UPDATE legacy_import_records SET applied_json='true'
       WHERE owner_id=${ownerSql} AND section='tagAssignments' AND legacy_id=${q(row.id)} AND payload_json IS NOT NULL`
    );
  }
  tagBatches.push(statements);
}
const collectionBatches: string[][] = [];
let projectedMembership = 0;
for (const row of collections) {
  const source = membership.memberships.find((entry) => entry.id === row.id);
  assert.ok(source);
  const collectionId = await stableId('col', owner, 'legacy-library', row.id);
  const reference = q(collectionId);
  const key = q(row.id);
  const pending = `NOT EXISTS(SELECT 1 FROM legacy_import_records WHERE owner_id=${ownerSql}
    AND section='collections' AND legacy_id=${key})`;
  const statements = [
    `INSERT INTO collections(id,owner_id,name,description,created_at,updated_at)
    SELECT ${reference},${ownerSql},${q(row.name)},${q(row.description)},
      ${q(new Date(row.created_at).toISOString())},${q(new Date(row.updated_at).toISOString())} WHERE ${pending}`,
  ];
  const ids = [
    ...new Set(
      source.orderedLegacyIds.map((id) => {
        const match = targetByLegacyId.get(id);
        assert.ok(
          match && match.action !== 'review-identity',
          'Collection membership requires a resolved identity'
        );
        return match.itemId;
      })
    ),
  ];
  projectedMembership += ids.length;
  const membershipGuard = q('legacy-membership-' + row.id);
  statements.unshift(
    `INSERT INTO write_guards(id,valid) VALUES(${membershipGuard},
      (SELECT count(*) FROM personal_items p WHERE p.owner_id=${ownerSql}
        AND p.id IN(SELECT value FROM json_each(${q(JSON.stringify(ids))})))=${ids.length})`
  );
  statements.push(`DELETE FROM write_guards WHERE id=${membershipGuard}`);
  statements.push(`INSERT INTO collection_members(collection_id,item_id,position)
    SELECT ${reference},p.id,j.key FROM json_each(${q(JSON.stringify(ids))}) j
    JOIN personal_items p ON p.id=j.value AND p.owner_id=${ownerSql}
    WHERE p.status!='deleted' AND ${pending}`);
  statements.push(
    ledgerRecord('collections', { ...row, orderedLegacyIds: source.orderedLegacyIds } as typeof row)
  );
  statements.push(
    ...overrides
      .filter((override) => override.collection_id === row.id)
      .map((override) =>
        ledgerRecord(
          'collectionOverrides',
          override,
          targetByLegacyId.get(override.user_item_id)?.itemId
        )
      )
  );
  collectionBatches.push(statements);
}
if (mode) {
  for (const rows of [
    ...Array.from({ length: Math.ceil(tagBatches.length / 10) }, (_, index) =>
      tagBatches.slice(index * 10, index * 10 + 10).flat()
    ),
    ...collectionBatches,
  ]) {
    const guard = q('legacy-organization-' + randomUUID());
    const sql = [
      `INSERT INTO write_guards(id,valid) VALUES(${guard},
        COALESCE((SELECT generation FROM owner_generations WHERE owner_id=${ownerSql}),0)=0)`,
      ...rows,
      `DELETE FROM write_guards WHERE id=${guard}`,
    ].join(';\n');
    const result = await cloudflare<{ success: boolean }[]>(path, 'POST', { sql });
    assert.ok(result.every((entry) => entry.success));
  }
}
console.log(
  JSON.stringify({
    mode: mode ? 'apply' : 'dry-run',
    tags: tags.length,
    assignments: assignments.length,
    projectedTags,
    unmatchedTags,
    collections: collections.length,
    projectedMembership,
  })
);
