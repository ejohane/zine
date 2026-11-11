/** Compare the source plan with independent, owner-scoped production readback. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflare, environments } from './cloudflare-control';
import type { LegacyItem } from './legacy-item-capture';
import { projectLegacyLifecycle, projectLegacyProgress } from './legacy-lifecycle-plan';

const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const [directory, planFile, ...extra] = process.argv.slice(2);
assert.ok(directory && planFile && !extra.length);
const [manifestBytes, itemBytes, planBytes] = await Promise.all([
  readFile(resolve(directory, 'manifest.json')),
  readFile(resolve(directory, 'items.json')),
  readFile(planFile),
]);
const manifest = JSON.parse(manifestBytes.toString());
const plan = JSON.parse(planBytes.toString()) as {
  owner: string;
  sourceManifestSha256: string;
  unsupported: string[];
  plan: { itemId: string; selectedLegacyId: string; legacyIds: string[]; action: string }[];
};
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
assert.equal(owner, manifest.owner);
assert.equal(owner, plan.owner);
assert.equal(hash(manifestBytes), plan.sourceManifestSha256);
assert.equal(hash(itemBytes), manifest.sections.items.sha256);
const source = new Map(
  (JSON.parse(itemBytes.toString()) as LegacyItem[]).map((row) => [row.id, row])
);
assert.equal(source.size, manifest.sections.items.count);

async function query<T>(sql: string) {
  const rows: T[] = [];
  let after = '';
  for (;;) {
    const [result] = await cloudflare<{ success: boolean; results: (T & { id: string })[] }[]>(
      `d1/database/${environments.production.databaseId}/query`,
      'POST',
      { sql: `SELECT * FROM (${sql}) WHERE id > ? ORDER BY id LIMIT 300`, params: [owner, after] }
    );
    assert.ok(result?.success);
    rows.push(...result.results);
    if (result.results.length < 300) return rows;
    after = result.results.at(-1)!.id;
  }
}
const [records, items, progress] = await Promise.all([
  query<{ id: string; item_id: string; payload_json: string | null }>(
    "SELECT legacy_id AS id,item_id,payload_json FROM legacy_import_records WHERE owner_id=? AND section='items'"
  ),
  query<{
    id: string;
    status: string;
    archived: number;
    saved_at: string | null;
    decision_at: string;
    created_at: string;
    ingested_at: string | null;
  }>(
    'SELECT id,status,archived,saved_at,decision_at,created_at,ingested_at FROM personal_items WHERE owner_id=?'
  ),
  query<{
    id: string;
    position: number | null;
    unit: string | null;
    completed_at: string | null;
    updated_at: string;
  }>(
    'SELECT p.id,r.position,r.unit,r.completed_at,r.updated_at FROM progress r JOIN personal_items p ON p.id=r.item_id WHERE p.owner_id=?'
  ),
]);
const recordsById = new Map(records.map((row) => [row.id, row]));
const itemsById = new Map(items.map((row) => [row.id, row]));
const progressById = new Map(progress.map((row) => [row.id, row]));
const outcome = {
  exactRecords: 0,
  suppressedRecords: 0,
  missingRecords: 0,
  differentRecords: 0,
  exactNewLifecycles: 0,
  differentNewLifecycles: 0,
  exactNewProgress: 0,
  differentNewProgress: 0,
  historicalDateMatches: 0,
  historicalDecisionDifferences: 0,
  duplicateTargetGroups: 0,
};
const groupTargets = new Set<string>();
for (const group of plan.plan) {
  if (groupTargets.has(group.itemId)) outcome.duplicateTargetGroups++;
  groupTargets.add(group.itemId);
  const item = itemsById.get(group.itemId);
  const legacy = source.get(group.selectedLegacyId);
  assert.ok(legacy);
  for (const legacyId of group.legacyIds) {
    const original = source.get(legacyId);
    assert.ok(original);
    const record = recordsById.get(legacyId);
    if (!record) outcome.missingRecords++;
    else if (record.item_id !== group.itemId) outcome.differentRecords++;
    else if (item?.status === 'deleted' && record.payload_json === null)
      outcome.suppressedRecords++;
    else if (record.payload_json === JSON.stringify(original)) outcome.exactRecords++;
    else outcome.differentRecords++;
  }
  if (group.action === 'attach-historical-records') {
    if (item?.saved_at === legacy.bookmarked_at) outcome.historicalDateMatches++;
    else outcome.historicalDecisionDifferences++;
  }
  if (group.action !== 'create') continue;
  const expected = projectLegacyLifecycle(legacy);
  if (
    item &&
    item.status === expected.status &&
    item.archived === expected.archived &&
    item.saved_at === expected.savedAt &&
    item.decision_at === expected.decisionAt &&
    item.created_at === legacy.created_at &&
    item.ingested_at === legacy.ingested_at
  )
    outcome.exactNewLifecycles++;
  else outcome.differentNewLifecycles++;
  const expectedProgress = projectLegacyProgress(legacy);
  const observed = progressById.get(group.itemId);
  if (expectedProgress === null && !observed) continue;
  if (
    expectedProgress &&
    observed &&
    observed.position === expectedProgress.position &&
    observed.unit === expectedProgress.unit &&
    observed.completed_at === expectedProgress.completedAt &&
    observed.updated_at === expectedProgress.updatedAt
  )
    outcome.exactNewProgress++;
  else outcome.differentNewProgress++;
}
console.log(
  JSON.stringify({ sourceRows: source.size, unsupported: plan.unsupported.length, ...outcome })
);
if (
  plan.unsupported.length ||
  outcome.missingRecords ||
  outcome.differentRecords ||
  outcome.differentNewLifecycles ||
  outcome.differentNewProgress ||
  outcome.duplicateTargetGroups
)
  process.exitCode = 1;
