/** Copy original progress for the historical import, retaining all Next progress rows. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { z } from 'zod4';
import { cloudflare, environments } from './cloudflare-control';
import {
  insertLegacyProgressSql,
  legacyProgressEligibilitySql,
} from './legacy-progress-correction';
import { projectLegacyProgress } from './legacy-lifecycle-plan';
import type { LegacyProgress } from './legacy-lifecycle-plan';

const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const legacyDatabase = '82911dea-5a6b-411b-ab4b-4145cb0c191d';
const nextDatabase = environments.production.databaseId;
const [mappingFile, mode, ...extra] = process.argv.slice(2);
assert.ok(mappingFile && (!mode || mode === '--apply') && !extra.length, 'Invalid arguments');
const mapping = z
  .array(
    z.object({
      legacyId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i),
      itemId: z.string().regex(/^itm_[a-f0-9]{40}$/),
    })
  )
  .length(444)
  .parse(JSON.parse(await readFile(mappingFile, 'utf8')));
assert.equal(new Set(mapping.map((r) => r.legacyId)).size, mapping.length);
assert.equal(new Set(mapping.map((r) => r.itemId)).size, mapping.length);

async function query<T>(databaseId: string, sql: string, params: string[]) {
  const [result] = await cloudflare<{ success: boolean; results: T[] }[]>(
    `d1/database/${databaseId}/query`,
    'POST',
    { sql, params }
  );
  assert.ok(result?.success);
  return result.results;
}
const importedIds = JSON.stringify(mapping.map((r) => r.legacyId));
const source = await query<LegacyProgress & { id: string }>(
  legacyDatabase,
  `SELECT id, progress_position, progress_duration, progress_updated_at, is_finished, finished_at
  FROM user_items WHERE user_id=? AND id IN (SELECT value FROM json_each(?))`,
  [owner, importedIds]
);
assert.equal(source.length, mapping.length);
const byId = new Map(source.map((row) => [row.id, row]));
const candidates = mapping.flatMap(({ legacyId, itemId }) => {
  const row = byId.get(legacyId);
  assert.ok(row);
  const progress = projectLegacyProgress(row);
  return progress ? [{ legacyId, itemId, ...progress }] : [];
});
const parameters = [JSON.stringify(candidates), owner];
type Target = {
  item_id: string;
  position: number | null;
  unit: string | null;
  completed_at: string | null;
  updated_at: string;
  contributor: string;
};
const read = () =>
  query<Target>(
    nextDatabase,
    `${legacyProgressEligibilitySql} SELECT p.* FROM verified v JOIN progress p ON p.item_id=v.item_id ORDER BY p.item_id`,
    parameters
  );
const valid = await query<{ item_id: string }>(
  nextDatabase,
  `${legacyProgressEligibilitySql} SELECT item_id FROM verified`,
  parameters
);
assert.equal(valid.length, candidates.length, 'Target mapping changed');
const before = await read();
const initialIds = new Set(before.map((row) => row.item_id));
const byItem = new Map(candidates.map((row) => [row.itemId, row]));
const matches = (row: Target) => {
  const expected = byItem.get(row.item_id);
  return (
    expected &&
    row.position === expected.position &&
    row.unit === expected.unit &&
    row.completed_at === expected.completedAt &&
    row.updated_at === expected.updatedAt
  );
};
if (mode) {
  const written = await query<{ item_id: string }>(
    nextDatabase,
    insertLegacyProgressSql,
    parameters
  );
  const after = await read();
  assert.equal(after.length, candidates.length);
  assert.deepEqual(
    after.filter((row) => initialIds.has(row.item_id)),
    before
  );
  assert.ok(after.filter((row) => !initialIds.has(row.item_id)).every(matches));
  console.log(
    JSON.stringify({
      mode: 'apply-and-readback',
      candidates: candidates.length,
      written: written.length,
      exactMatches: after.filter(matches).length,
      preexistingRowsPreserved: before.length,
      repeatEligible: candidates.length - after.length,
    })
  );
} else {
  console.log(
    JSON.stringify({
      mode: 'dry-run',
      candidates: candidates.length,
      eligible: candidates.length - before.length,
      exactMatches: before.filter(matches).length,
      preexistingDifferent: before.filter((row) => !matches(row)).length,
    })
  );
}
