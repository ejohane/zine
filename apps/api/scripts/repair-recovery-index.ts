import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { quietCommand } from './quiet-command';
import { cloudflare } from './cloudflare-control';
const directory = process.argv[2];
assert.ok(directory?.startsWith('.local-data/backups/') && !directory.includes('..'));
const manifest = JSON.parse(await readFile(directory + '/manifest.json', 'utf8'));
assert.equal(manifest.environment, 'production');
const source = JSON.parse(
  await quietCommand('python3', [
    'scripts/read-snapshot.py',
    directory + '/database.sqlite',
    'index_requests',
  ])
) as { rows: { item_id: string; requested_revision: number }[] };
// Restricted to this isolated recovery database. Never resets counters or bypasses provider cooldowns.
for (let offset = 0; offset < source.rows.length; offset += 50) {
  const rows = source.rows.slice(offset, offset + 50);
  await cloudflare('d1/database/29df9a64-93a0-4ada-929e-43c057b2ead8/query', 'POST', {
    sql: `UPDATE index_requests SET requested_revision=MAX(requested_revision,COALESCE((SELECT json_extract(value,'$.requested_revision')+1 FROM json_each(?) WHERE json_extract(value,'$.item_id')=index_requests.item_id),requested_revision)) WHERE item_id IN (SELECT json_extract(value,'$.item_id') FROM json_each(?))`,
    params: [JSON.stringify(rows), JSON.stringify(rows)],
  });
}
console.log(
  JSON.stringify({ recoveryOnly: true, items: source.rows.length, revisionFloorRestored: true })
);
