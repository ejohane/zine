/** Compare a private source snapshot with current owner membership, without writing to D1. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflare, environments } from './cloudflare-control';
import { chooseLegacyLifecycle, legacyIdentity } from './legacy-item-capture';
import type { LegacyItem } from './legacy-item-capture';

const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const [snapshotDirectory, historicalMapping, output, ...extra] = process.argv.slice(2);
assert.ok(snapshotDirectory && historicalMapping && output && !extra.length);
const [manifestBytes, itemBytes, mappingBytes] = await Promise.all([
  readFile(resolve(snapshotDirectory, 'manifest.json')),
  readFile(resolve(snapshotDirectory, 'items.json')),
  readFile(historicalMapping),
]);
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(manifestBytes.toString()) as {
  owner: string;
  database: string;
  sections: { items: { count: number; sha256: string } };
};
assert.equal(manifest.owner, owner);
assert.equal(manifest.database, '82911dea-5a6b-411b-ab4b-4145cb0c191d');
assert.equal(sha256(itemBytes), manifest.sections.items.sha256);
const source = JSON.parse(itemBytes.toString()) as LegacyItem[];
assert.equal(source.length, manifest.sections.items.count);
assert.equal(new Set(source.map((row) => row.id)).size, source.length);

async function query<T>(sql: string, params: string[] = [owner]) {
  const [result] = await cloudflare<{ success: boolean; results: T[] }[]>(
    `d1/database/${environments.production.databaseId}/query`,
    'POST',
    { sql, params }
  );
  assert.ok(result?.success);
  return result.results;
}

const [existing, aliases, versions, ledgerTables, generations] = await Promise.all([
  query<{ id: string; content_id: string; status: string; revision: number }>(
    'SELECT id,content_id,status,revision FROM personal_items WHERE owner_id=?'
  ),
  query<{ alias_item_id: string; canonical_item_id: string }>(
    'SELECT alias_item_id,canonical_item_id FROM item_aliases WHERE owner_id=?'
  ),
  query<{ id: string; legacy_id: string; created_at: string }>(
    `SELECT json_extract(response_json,'$.item.id') AS id, substr(key,14) AS legacy_id, created_at
    FROM idempotency WHERE owner_id=? AND operation='save' AND key GLOB 'real-library-*'`
  ),
  query("SELECT name FROM sqlite_schema WHERE type='table' AND name='legacy_import_records'", []),
  query<{ generation: number }>('SELECT generation FROM owner_generations WHERE owner_id=?'),
]);
const generation = generations[0]?.generation ?? 0;
assert.equal(generation, 0, 'The original destination owner generation changed');
const ledger = ledgerTables.length
  ? await query<{ legacy_id: string; item_id: string; scrubbed: number }>(
      `SELECT legacy_id,item_id,payload_json IS NULL AS scrubbed FROM legacy_import_records
      WHERE owner_id=? AND section='items'`
    )
  : [];
const verified = new Map(versions.map((row) => [row.legacy_id, row]));
const historical = JSON.parse(mappingBytes.toString()) as { legacyId: string; itemId: string }[];
assert.equal(historical.length, 444);
const originalIds = new Map(historical.map((row) => [row.legacyId, row.itemId]));
assert.equal(originalIds.size, historical.length);
for (const { legacyId, itemId } of historical) {
  // Deleted entries have scrubbed receipts but still use their original stable ID.
  const row = existing.find((target) => target.id === itemId);
  assert.ok(row && (verified.get(legacyId)?.id === itemId || row.status === 'deleted'));
}
const targets = new Map(existing.map((row) => [row.id, row]));
const aliasTargets = new Map(aliases.map((row) => [row.alias_item_id, row.canonical_item_id]));
const ledgerTargets = new Map(ledger.map((row) => [row.legacy_id, row]));
function canonicalId(id: string) {
  const visited = new Set<string>();
  while (aliasTargets.has(id)) {
    assert.ok(!visited.has(id), 'Unexpected Next alias cycle');
    visited.add(id);
    id = aliasTargets.get(id)!;
  }
  return id;
}
const groups = new Map<string, LegacyItem[]>();
const unsupported = [];
for (const row of source) {
  let identity;
  try {
    identity = await legacyIdentity(owner, row);
  } catch {
    unsupported.push(row.id);
    continue;
  }
  const key = canonicalId(identity.itemId);
  const group = groups.get(key) ?? [];
  group.push(row);
  groups.set(key, group);
}
const plan = [];
for (const [computedId, group] of groups) {
  const pinned = new Set(
    group
      .map(({ id }) => ledgerTargets.get(id)?.item_id ?? originalIds.get(id))
      .filter((id): id is string => Boolean(id))
      .map(canonicalId)
  );
  const itemId = [...pinned][0] ?? computedId;
  const target = targets.get(itemId);
  const identityConflict =
    pinned.size > 1 ||
    group.some(
      (row) => row.canonical_url !== group[0].canonical_url || row.title !== group[0].title
    ) ||
    (itemId !== computedId && targets.has(computedId));
  const selected = chooseLegacyLifecycle(group);
  const action = identityConflict
    ? 'review-identity'
    : target?.status === 'deleted'
      ? 'preserve-next-deletion'
      : group.every(({ id }) => ledgerTargets.has(id))
        ? 'compare-migrated-state'
        : pinned.size
          ? 'attach-historical-records'
          : target
            ? 'attach-preserving-next'
            : 'create';
  const receipt = group.map(({ id }) => verified.get(id)).find((row) => row?.id === itemId);
  plan.push({
    itemId,
    legacyIds: group.map(({ id }) => id),
    selectedLegacyId: selected.id,
    action,
    historical: receipt
      ? { legacyId: receipt.legacy_id, importedAt: receipt.created_at }
      : undefined,
  });
}
const actions: Record<string, number> = {};
for (const row of plan) actions[row.action] = (actions[row.action] ?? 0) + 1;
await writeFile(
  output,
  JSON.stringify({
    owner,
    generation,
    sourceManifestSha256: sha256(manifestBytes),
    historicalMappingSha256: sha256(mappingBytes),
    plan,
    unsupported,
  }),
  { mode: 0o600, flag: 'wx' }
);
console.log(
  JSON.stringify({
    sourceRows: source.length,
    workGroups: groups.size,
    unsupported: unsupported.length,
    repeatedWorkReferences: source.length - unsupported.length - groups.size,
    actions,
  })
);
