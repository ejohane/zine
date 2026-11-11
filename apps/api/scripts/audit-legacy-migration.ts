/**
 * Read-only production inventory. Produces counts and optionally writes the private per-row planning evidence.
 * Usage: bun run scripts/audit-legacy-migration.ts /private/path/remote-library-mapping.json [new-private-plan.json]
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cloudflare, environments } from './cloudflare-control';
import { contentIdentity } from '../src/identity';
import { stableId } from '../src/lib';
import {
  planPriorSave,
  projectLegacyLifecycle,
  projectLegacyProgress,
} from './legacy-lifecycle-plan';
import type {
  ImportReceipt,
  LegacyLifecycle,
  LegacyProgress,
  NextLifecycle,
} from './legacy-lifecycle-plan';

const legacyDatabase = '82911dea-5a6b-411b-ab4b-4145cb0c191d';
const nextDatabase = environments.production.databaseId;
// Explicit migration scope. This is the existing owner in both Clerk-backed services.
const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';

async function query<T>(database: string, sql: string, params: string[] = []): Promise<T[]> {
  assert.match(sql, /^(SELECT |PRAGMA table_info\("[a-z0-9_]+"\)$)/);
  const [result] = await cloudflare<{ success: boolean; results: T[] }[]>(
    `d1/database/${database}/query`,
    'POST',
    { sql, params }
  );
  assert.ok(result?.success);
  return result.results;
}

async function countOwnerTables(database: string, column: 'user_id' | 'owner_id') {
  const tables = await query<{ name: string }>(
    database,
    'SELECT name FROM sqlite_schema WHERE type = ? ORDER BY name',
    ['table']
  );
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    if (name.startsWith('sqlite_') || name === '_cf_KV') continue;
    assert.match(name, /^[a-z0-9_]+$/);
    const columns = await query<{ name: string }>(database, `PRAGMA table_info("${name}")`);
    if (!columns.some((entry) => entry.name === column)) continue;
    const [row] = await query<{ count: number }>(
      database,
      `SELECT count(*) AS count FROM "${name}" WHERE "${column}" = ?`,
      [owner]
    );
    counts[name] = row.count;
  }
  return counts;
}

const [mappingPath, planPath, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0);
assert.ok(mappingPath, 'Provide the private original mapping file');
const mappingInput = await readFile(mappingPath, 'utf8');
const mapping = JSON.parse(mappingInput) as {
  legacyId: string;
  itemId: string;
}[];
assert.equal(new Set(mapping.map(({ legacyId }) => legacyId)).size, mapping.length);
assert.equal(new Set(mapping.map(({ itemId }) => itemId)).size, mapping.length);

const [
  legacyStates,
  nextStates,
  sourceItems,
  destinationItems,
  legacyCounts,
  nextCounts,
  priorSaves,
  itemAliases,
] = await Promise.all([
  query(
    legacyDatabase,
    `SELECT state, count(*) AS count, count(bookmarked_at) AS saved_dates,
      count(progress_updated_at) AS progress_dates, sum(is_finished) AS completed
      FROM user_items WHERE user_id = ? GROUP BY state ORDER BY state`,
    [owner]
  ),
  query(
    nextDatabase,
    `SELECT status, archived, count(*) AS count FROM personal_items
      WHERE owner_id = ? GROUP BY status, archived ORDER BY status, archived`,
    [owner]
  ),
  query<LegacyLifecycle & LegacyProgress & { canonical_url: string }>(
    legacyDatabase,
    `SELECT u.id, u.state, u.bookmarked_at, u.archived_at, u.ingested_at, u.created_at,
      u.updated_at, u.progress_position, u.progress_duration, u.progress_updated_at,
      u.is_finished, u.finished_at, i.canonical_url FROM user_items u
      JOIN items i ON i.id = u.item_id WHERE u.user_id = ? ORDER BY u.id`,
    [owner]
  ),
  query<NextLifecycle>(
    nextDatabase,
    'SELECT id, status, archived, saved_at, decision_at FROM personal_items WHERE owner_id = ? ORDER BY id',
    [owner]
  ),
  countOwnerTables(legacyDatabase, 'user_id'),
  countOwnerTables(nextDatabase, 'owner_id'),
  query<ImportReceipt & { key: string }>(
    nextDatabase,
    `SELECT key, json_extract(response_json, '$.item.id') AS item_id, created_at
      FROM idempotency WHERE owner_id = ? AND operation = 'save' AND key GLOB 'real-library-*'`,
    [owner]
  ),
  query<{ alias_item_id: string; canonical_item_id: string }>(
    nextDatabase,
    'SELECT alias_item_id, canonical_item_id FROM item_aliases WHERE owner_id = ?',
    [owner]
  ),
]);
const source = new Map(sourceItems.map((item) => [item.id, item]));
const destination = new Map(destinationItems.map((item) => [item.id, item]));
const receipts = new Map(priorSaves.map((row) => [row.key, row]));
const corrections: Record<string, number> = {};
const priorSavePlan = [];
const mapped = {
  matchingReceipt: 0,
  unchangedSaveDate: 0,
  unchangedLifecycle: 0,
  missingSource: 0,
  missingDestination: 0,
  unequalSaveDates: 0,
  sourceStates: {} as Record<string, number>,
};
for (const entry of mapping) {
  const original = source.get(entry.legacyId);
  const imported = destination.get(entry.itemId);
  if (!original) mapped.missingSource++;
  if (!imported) mapped.missingDestination++;
  if (!original || !imported) continue;
  const receipt = receipts.get(`real-library-${entry.legacyId}`);
  const action = planPriorSave(original, imported, receipt);
  corrections[action] = (corrections[action] ?? 0) + 1;
  priorSavePlan.push({
    legacyId: original.id,
    destination: imported,
    action,
    originalSavedAt: original.bookmarked_at,
    receipt: receipt ?? null,
  });
  if (receipt?.item_id === entry.itemId) {
    mapped.matchingReceipt++;
    if (receipt.created_at === imported.saved_at) mapped.unchangedSaveDate++;
    if (receipt.created_at === imported.decision_at) mapped.unchangedLifecycle++;
  }
  if (original.bookmarked_at !== imported.saved_at) mapped.unequalSaveDates++;
  mapped.sourceStates[original.state] = (mapped.sourceStates[original.state] ?? 0) + 1;
}
const aliases = new Map(itemAliases.map((row) => [row.alias_item_id, row.canonical_item_id]));
const historical = new Map(mapping.map((row) => [row.legacyId, row.itemId]));
const claims = new Map<string, string[]>();
const identityPlan = [];
const projectedStates: Record<string, number> = {};
const projectedProgress = { rows: 0, positions: 0, completed: 0 };
const identities = {
  unsupported: 0,
  historicalIdentityDifferences: 0,
  matchesNext: 0,
  new: 0,
  sharedDestination: 0,
};
for (const row of sourceItems) {
  const projection = projectLegacyLifecycle(row);
  projectedStates[projection.status] = (projectedStates[projection.status] ?? 0) + 1;
  const progress = projectLegacyProgress(row);
  if (progress) {
    projectedProgress.rows++;
    if (progress.position !== null) projectedProgress.positions++;
    if (progress.completedAt !== null) projectedProgress.completed++;
  }
  let content;
  try {
    content = await contentIdentity(row.canonical_url);
  } catch {
    identities.unsupported++;
    identityPlan.push({ legacyId: row.id, destinationId: null, action: 'review-unsupported-url' });
    continue;
  }
  let itemId = await stableId('itm', owner, content.id);
  const visited = new Set<string>();
  while (aliases.has(itemId)) {
    assert.ok(!visited.has(itemId), 'Unexpected alias cycle');
    visited.add(itemId);
    itemId = aliases.get(itemId)!;
  }
  const historicalId = historical.get(row.id);
  if (historicalId && historicalId !== itemId) identities.historicalIdentityDifferences++;
  if (destination.has(itemId)) identities.matchesNext++;
  else identities.new++;
  const destinationId = historicalId ?? itemId;
  const group = claims.get(destinationId) ?? [];
  group.push(row.id);
  claims.set(destinationId, group);
  identityPlan.push({
    legacyId: row.id,
    destinationId,
    computedId: itemId,
    action: historicalId
      ? 'historical-receipt'
      : destination.has(itemId)
        ? 'review-existing-item'
        : 'new-identity',
  });
}
identities.sharedDestination = [...claims.values()].reduce(
  (count, group) => count + Math.max(0, group.length - 1),
  0
);

const asOf = new Date().toISOString();
if (planPath) {
  await writeFile(
    planPath,
    JSON.stringify({
      asOf,
      owner,
      originalMappingSha256: createHash('sha256').update(mappingInput).digest('hex'),
      priorSavePlan,
      identityPlan,
      collisions: [...claims.entries()].filter(([, group]) => group.length > 1),
    }),
    { mode: 0o600, flag: 'wx' }
  );
}

console.log(
  JSON.stringify(
    {
      at: asOf,
      privatePlanWritten: Boolean(planPath),
      legacyStates,
      nextStates,
      legacyCounts,
      nextCounts,
      historicalMappings: mapping.length,
      mapped,
      identities,
      projectedStates,
      projectedProgress,
      corrections,
    },
    null,
    2
  )
);
