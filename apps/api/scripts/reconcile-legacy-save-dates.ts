/**
 * One-time correction of the historical partial import. Defaults to production read-only.
 * Usage: bun run scripts/reconcile-legacy-save-dates.ts <private-plan> [--apply <backup-receipt>]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod4';
import { cloudflare, environments } from './cloudflare-control';
import {
  correctLegacySaveDatesSql,
  eligibleLegacySaveDatesSql,
} from './legacy-save-date-correction';

const legacyDatabase = '82911dea-5a6b-411b-ab4b-4145cb0c191d';
const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const [file, mode, backupFile, ...extra] = process.argv.slice(2);
assert.ok(
  file && (!mode || (mode === '--apply' && backupFile)) && !extra.length,
  'Invalid arguments'
);

const sourceId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i);
const nextId = z.string().regex(/^itm_[a-f0-9]{40}$/);
const date = z.iso.datetime({ precision: 3 });
const planSchema = z.object({
  owner: z.literal(owner),
  asOf: date,
  priorSavePlan: z
    .array(
      z.object({
        legacyId: sourceId,
        destination: z.object({ id: nextId }),
        action: z.enum(['correct-import-date', 'preserve-next-decision', 'already-reconciled']),
        originalSavedAt: date,
        receipt: z.object({ item_id: nextId, created_at: date }),
      })
    )
    .length(444),
});
const planBytes = await readFile(file);
const plan = planSchema.parse(JSON.parse(planBytes.toString()));
const planSha256 = createHash('sha256').update(planBytes).digest('hex');
assert.equal(new Set(plan.priorSavePlan.map((entry) => entry.legacyId)).size, 444);
assert.equal(new Set(plan.priorSavePlan.map((entry) => entry.destination.id)).size, 444);
const planned = plan.priorSavePlan.filter((row) => row.action === 'correct-import-date');
const corrections = planned.map((row) => {
  assert.equal(row.destination.id, row.receipt.item_id);
  return {
    legacyId: row.legacyId,
    itemId: row.destination.id,
    importedAt: row.receipt.created_at,
    sourceSavedAt: row.originalSavedAt,
  };
});

async function query<T>(databaseId: string, sql: string, params: string[]) {
  const [result] = await cloudflare<{ success: boolean; results: T[] }[]>(
    `d1/database/${databaseId}/query`,
    'POST',
    { sql, params }
  );
  assert.ok(result?.success);
  return result.results;
}

if (mode) {
  const receipt = z
    .object({
      environment: z.literal('production'),
      remoteArchiveHashVerified: z.literal(true),
      at: date,
      archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .parse(JSON.parse(await readFile(backupFile, 'utf8')));
  assert.ok(
    Date.parse(receipt.at) >= Date.parse(plan.asOf),
    'A verified backup after the plan is required'
  );
}

const database = environments.production.databaseId;
const targetIds = JSON.stringify(corrections.map((entry) => entry.itemId));
const sourceIds = JSON.stringify(corrections.map((entry) => entry.legacyId));
type Source = { id: string; bookmarked_at: string };
type Target = {
  id: string;
  status: string;
  archived: number;
  saved_at: string;
  decision_at: string;
};
const readSource = () =>
  query<Source>(
    legacyDatabase,
    `SELECT id, bookmarked_at FROM user_items WHERE user_id=? AND state='BOOKMARKED'
      AND id IN (SELECT value FROM json_each(?)) ORDER BY bookmarked_at DESC, id`,
    [owner, sourceIds]
  );
const readTarget = () =>
  query<Target>(
    database,
    `SELECT id, status, archived, saved_at, decision_at FROM personal_items WHERE owner_id=?
      AND id IN (SELECT value FROM json_each(?)) ORDER BY saved_at DESC, id`,
    [owner, targetIds]
  );
const preservedIds = plan.priorSavePlan
  .filter((row) => row.action === 'preserve-next-decision')
  .map((row) => row.destination.id);
const readPreserved = () =>
  query<Target>(
    database,
    `SELECT id,status,archived,saved_at,decision_at FROM personal_items WHERE owner_id=?
      AND id IN (SELECT value FROM json_each(?)) ORDER BY id`,
    [owner, JSON.stringify(preservedIds)]
  );
const bindings = [owner, JSON.stringify(corrections)];
const [source, before, eligible, preservedBefore] = await Promise.all([
  readSource(),
  readTarget(),
  query<{ id: string }>(database, eligibleLegacySaveDatesSql, bindings),
  readPreserved(),
]);
const bySourceId = new Map(source.map((row) => [row.id, row.bookmarked_at]));
const byTargetId = new Map(corrections.map((row) => [row.itemId, row]));
assert.equal(source.length, corrections.length);
assert.equal(before.length, corrections.length);
assert.ok(
  corrections.every((row) => bySourceId.get(row.legacyId) === row.sourceSavedAt),
  'Legacy changed after planning'
);
const correct = (row: Target) => {
  const entry = byTargetId.get(row.id);
  return (
    entry &&
    row.status === 'saved' &&
    row.archived === 0 &&
    row.saved_at === entry.sourceSavedAt &&
    row.decision_at === entry.sourceSavedAt
  );
};
const alreadyCorrect = before.filter(correct).length;
assert.equal(
  eligible.length + alreadyCorrect,
  corrections.length,
  'Next decisions changed after planning'
);
if (!mode) {
  console.log(
    JSON.stringify({ mode: 'dry-run', planSha256, eligible: eligible.length, alreadyCorrect })
  );
} else {
  const updated = await query<Target>(database, correctLegacySaveDatesSql, bindings);
  const [after, remaining, preservedAfter] = await Promise.all([
    readTarget(),
    query<{ id: string }>(database, eligibleLegacySaveDatesSql, bindings),
    readPreserved(),
  ]);
  assert.equal(after.length, source.length);
  assert.ok(after.every(correct), 'Next dates differ after correction');
  assert.deepEqual(
    after.map((row) => row.saved_at),
    source.map((row) => row.bookmarked_at)
  );
  assert.equal(remaining.length, 0, 'Correction is not converged');
  assert.equal(preservedAfter.length, preservedIds.length);
  assert.deepEqual(preservedAfter, preservedBefore);
  console.log(
    JSON.stringify({
      mode: 'apply-and-readback',
      planSha256,
      updated: updated.length,
      verifiedTimestamps: after.length,
      orderMatches: true,
      repeatEligible: remaining.length,
      preservedNextDecisions: plan.priorSavePlan.filter(
        (row) => row.action === 'preserve-next-decision'
      ).length,
    })
  );
}
