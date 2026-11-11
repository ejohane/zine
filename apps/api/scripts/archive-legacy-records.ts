/** Retain source history and provider definitions as private, portable records. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflare, environments } from './cloudflare-control';

const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const [directory, mode, ...extra] = process.argv.slice(2);
assert.ok(directory && (!mode || mode === '--apply') && !extra.length);
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')) as {
  owner: string;
  database: string;
  sections: Record<string, { count: number; sha256: string }>;
};
assert.equal(manifest.owner, owner);
assert.equal(manifest.database, '82911dea-5a6b-411b-ab4b-4145cb0c191d');
const sections = [
  'articleVersions',
  'consumption',
  'itemUnderstanding',
  'personalUnderstanding',
  'subscriptions',
  'subscriptionItems',
  'rssFeeds',
  'rssItems',
  'newsletterFeeds',
  'newsletterItems',
] as const;
const path = `d1/database/${environments.production.databaseId}/query`;
const counts: Record<string, number> = {};
type SourceRow = { id: string; user_item_id?: string; item_id?: string };
const itemBytes = await readFile(resolve(directory, 'items.json'));
assert.equal(createHash('sha256').update(itemBytes).digest('hex'), manifest.sections.items.sha256);
const items = JSON.parse(itemBytes.toString()) as { id: string; item_id: string }[];
assert.equal(items.length, manifest.sections.items.count);
const legacyIdByContent = new Map(items.map((item) => [item.item_id, item.id]));
const findLinked = `SELECT r.item_id FROM legacy_import_records r
  WHERE r.owner_id=?1 AND r.section='items' AND r.legacy_id=json_extract(j.value,'$.sourceItem')`;
for (const section of sections) {
  const bytes = await readFile(resolve(directory, section + '.json'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sections[section].sha256);
  const rows = JSON.parse(bytes.toString()) as SourceRow[];
  assert.equal(rows.length, manifest.sections[section].count);
  assert.equal(new Set(rows.map(({ id }) => id)).size, rows.length);
  counts[section] = rows.length;
  if (!mode) continue;
  for (let offset = 0; offset < rows.length; offset += 40) {
    const batch = rows.slice(offset, offset + 40).map((row) => ({
      row,
      sourceItem:
        row.user_item_id ?? (row.item_id ? (legacyIdByContent.get(row.item_id) ?? null) : null),
    }));
    const [result] = await cloudflare<{ success: boolean }[]>(path, 'POST', {
      sql: `WITH source AS (
        SELECT json_extract(j.value,'$.row.id') AS id, json_extract(j.value,'$.row') AS payload,
               json_extract(j.value,'$.sourceItem') AS source_item, (${findLinked}) AS item_id
        FROM json_each(?3) j
      )
      INSERT INTO legacy_import_records(owner_id,section,legacy_id,item_id,payload_json)
      SELECT ?1,?2,s.id,s.item_id,CASE WHEN p.status IS NOT 'deleted' THEN s.payload END
      FROM source s LEFT JOIN personal_items p ON p.id=s.item_id AND p.owner_id=?1
      WHERE COALESCE((SELECT generation FROM owner_generations WHERE owner_id=?1),0)=0
        AND (s.source_item IS NULL OR p.id IS NOT NULL)
      ON CONFLICT(owner_id,section,legacy_id) DO NOTHING`,
      params: [owner, section, JSON.stringify(batch)],
    });
    assert.ok(result?.success);
  }
  const [readback] = await cloudflare<{ success: boolean; results: { count: number }[] }[]>(
    path,
    'POST',
    {
      sql: 'SELECT count(*) AS count FROM legacy_import_records WHERE owner_id=? AND section=?',
      params: [owner, section],
    }
  );
  assert.ok(readback?.success);
  assert.ok(readback.results[0].count >= rows.length, 'Missing archived source records');
}
console.log(JSON.stringify({ mode: mode ? 'apply-and-readback' : 'dry-run', counts }));
