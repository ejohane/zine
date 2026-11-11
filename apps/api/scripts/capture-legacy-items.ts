/**
 * Capture new identities from a reviewed private plan. A batch is atomic and
 * replay skips groups with verified durable receipts. Existing items are never
 * updated by this command.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflare, environments } from './cloudflare-control';
import {
  attachLegacyItemsSql,
  chooseLegacyLifecycle,
  createLegacyItemsSql,
  legacyIdentity,
  reconcileLegacyStateSql,
} from './legacy-item-capture';
import type { LegacyItem } from './legacy-item-capture';

const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const [snapshotDirectory, planFile, mode, limitInput, ...extra] = process.argv.slice(2);
const limit = limitInput ? Number(limitInput) : 0;
assert.ok(snapshotDirectory && planFile && !extra.length);
assert.ok(
  (!mode && !limitInput) || (mode === '--apply' && Number.isSafeInteger(limit) && limit > 0),
  'Default is read-only. Use --apply with the maximum number of new groups to capture.'
);
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const [manifestBytes, itemsBytes, planBytes] = await Promise.all([
  readFile(resolve(snapshotDirectory, 'manifest.json')),
  readFile(resolve(snapshotDirectory, 'items.json')),
  readFile(planFile),
]);
const manifest = JSON.parse(manifestBytes.toString()) as {
  owner: string;
  sections: { items: { count: number; sha256: string } };
};
const plan = JSON.parse(planBytes.toString()) as {
  owner: string;
  generation: number;
  sourceManifestSha256: string;
  plan: {
    itemId: string;
    legacyIds: string[];
    selectedLegacyId: string;
    action: string;
    historical?: { legacyId: string; importedAt: string };
  }[];
};
assert.equal(manifest.owner, owner);
assert.equal(plan.owner, owner);
assert.equal(plan.generation, 0);
assert.equal(sha256(manifestBytes), plan.sourceManifestSha256);
assert.equal(sha256(itemsBytes), manifest.sections.items.sha256);
const items = JSON.parse(itemsBytes.toString()) as LegacyItem[];
assert.equal(items.length, manifest.sections.items.count);
const source = new Map(items.map((row) => [row.id, row]));
assert.equal(source.size, items.length);

const path = `d1/database/${environments.production.databaseId}/query`;
async function query<T>(sql: string, params: string[]) {
  const [result] = await cloudflare<{ success: boolean; results: T[] }[]>(path, 'POST', {
    sql,
    params,
  });
  assert.ok(result?.success);
  return result.results;
}
type Receipt = {
  legacy_id: string;
  item_id: string;
  payload_json: string | null;
  applied_json: string | null;
};
async function readLedger() {
  const receipts: Receipt[] = [];
  let after = '';
  for (;;) {
    const page = await query<Receipt>(
      `SELECT legacy_id,item_id,payload_json,applied_json FROM legacy_import_records
       WHERE owner_id=? AND section='items' AND legacy_id>? ORDER BY legacy_id LIMIT 250`,
      [owner, after]
    );
    receipts.push(...page);
    if (page.length < 250) return receipts;
    after = page.at(-1)!.legacy_id;
  }
}
const [generation, ledger, membership] = await Promise.all([
  query<{ generation: number }>('SELECT generation FROM owner_generations WHERE owner_id=?', [
    owner,
  ]),
  readLedger(),
  query<{
    id: string;
    status: string;
    created_at: string;
    ingested_at: string;
    saved_at: string | null;
  }>('SELECT id,status,created_at,ingested_at,saved_at FROM personal_items WHERE owner_id=?', [
    owner,
  ]),
]);
assert.equal(generation[0]?.generation ?? 0, plan.generation);
const receipts = new Map(ledger.map((row) => [row.legacy_id, row]));
const destination = new Map(membership.map((row) => [row.id, row]));
const actionable = plan.plan.filter((row) =>
  [
    'create',
    'attach-historical-records',
    'attach-preserving-next',
    'preserve-next-deletion',
  ].includes(row.action)
);
assert.equal(new Set(actionable.map((row) => row.itemId)).size, actionable.length);
const pending: { group: LegacyItem[]; decision: (typeof actionable)[number] }[] = [];
let existingReceipts = 0;
let conflicts = 0;
for (const decision of actionable) {
  const originals = decision.legacyIds.map((id) => source.get(id)!);
  assert.ok(originals.length && originals.every(Boolean));
  const winner = chooseLegacyLifecycle(originals);
  assert.equal(winner.id, decision.selectedLegacyId);
  const known = decision.legacyIds.filter((id) => receipts.has(id));
  if (known.some((id) => receipts.get(id)?.item_id !== decision.itemId)) {
    conflicts++;
    continue;
  }
  const missing = originals.filter((row) => !receipts.has(row.id));
  if (!missing.length) {
    existingReceipts++;
    continue;
  }
  const next = destination.get(decision.itemId);
  if (decision.action === 'create') {
    assert.equal((await legacyIdentity(owner, winner)).itemId, decision.itemId);
    if (next || known.length) {
      conflicts++;
      continue;
    }
  } else if (!next || (decision.action === 'preserve-next-deletion' && next.status !== 'deleted')) {
    conflicts++;
    continue;
  }
  pending.push({ group: missing, decision });
}
const reconciliation = [];
for (const entry of plan.plan.filter((row) => row.action === 'compare-migrated-state')) {
  const records = entry.legacyIds.map((legacyId) => {
    const original = source.get(legacyId);
    const receipt = receipts.get(legacyId);
    assert.ok(original && receipt?.item_id === entry.itemId);
    return {
      original,
      previousPayload: receipt.payload_json,
      previousApplied: receipt.applied_json,
    };
  });
  if (records.some((row) => row.previousPayload === null)) continue;
  const changed = records.some(
    ({ original, previousPayload }) => JSON.stringify(original) !== previousPayload
  );
  if (!changed) continue;
  reconciliation.push({
    itemId: entry.itemId,
    records: records.map((row) => ({ ...row, previousPayload: row.previousPayload! })),
  });
}
if (!mode) {
  console.log(
    JSON.stringify({
      mode: 'dry-run',
      eligible: pending.length,
      reconciliationEligible: reconciliation.length,
      existingReceipts,
      conflicts,
      planSha256: sha256(planBytes),
    })
  );
} else {
  const selection = pending.slice(0, limit);
  let applied = 0;
  for (let offset = 0; offset < selection.length; offset += 15) {
    const batch = selection.slice(offset, offset + 15);
    const creations = batch
      .filter(({ decision }) => decision.action === 'create')
      .map(({ group }) => group);
    const attachments = batch.filter(({ decision }) => decision.action !== 'create');
    const statements: string[] = creations.length
      ? await createLegacyItemsSql(
          owner,
          plan.generation,
          creations,
          'legacy-import-' + randomUUID()
        )
      : [];
    for (const { group, decision } of attachments) {
      const historical = group.some((row) => row.id === decision.historical?.legacyId)
        ? decision.historical
        : undefined;
      statements.push(
        ...(await attachLegacyItemsSql(
          owner,
          plan.generation,
          decision.itemId,
          group,
          historical,
          'legacy-import-' + randomUUID()
        ))
      );
    }
    const result = await cloudflare<{ success: boolean }[]>(path, 'POST', {
      sql: statements.join(';\n'),
    });
    assert.equal(result.length, statements.length);
    assert.ok(result.every((row) => row.success));
    const byId = new Map(batch.flatMap(({ group }) => group).map((row) => [row.id, row]));
    const readback = await query<{
      legacy_id: string;
      payload_json: string | null;
      status: string;
    }>(
      `SELECT r.legacy_id,r.payload_json,p.status FROM legacy_import_records r
       JOIN personal_items p ON p.id=r.item_id AND p.owner_id=r.owner_id
       WHERE r.owner_id=? AND r.section='items'
       AND legacy_id IN (SELECT value FROM json_each(?))`,
      [owner, JSON.stringify([...byId.keys()])]
    );
    assert.equal(readback.length, byId.size);
    for (const row of readback)
      assert.equal(
        row.payload_json ===
          (row.status === 'deleted' ? null : JSON.stringify(byId.get(row.legacy_id))),
        true
      );
    applied += batch.length;
  }
  let reconciled = 0;
  for (const { itemId, records } of reconciliation.slice(0, Math.max(0, limit - applied))) {
    const statements = reconcileLegacyStateSql(
      owner,
      plan.generation,
      itemId,
      records,
      'legacy-import-' + randomUUID()
    );
    const result = await cloudflare<{ success: boolean }[]>(path, 'POST', {
      sql: statements.join(';\n'),
    });
    assert.ok(result.every((row) => row.success));
    reconciled++;
  }
  console.log(
    JSON.stringify({
      mode: 'apply-and-readback',
      applied,
      reconciled,
      previousReceipts: existingReceipts,
      conflicts,
      stillEligibleInPlan: pending.length - applied,
      planSha256: sha256(planBytes),
    })
  );
}
