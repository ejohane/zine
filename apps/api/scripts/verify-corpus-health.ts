import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const mapping = JSON.parse(await readFile('.local-data/remote-library-mapping.json', 'utf8')) as {
  itemId: string;
  provider: string;
}[];
const token = process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token);
async function sql(query: string, params: unknown[] = []) {
  const response = await fetch(
    'https://api.cloudflare.com/client/v4/accounts/887513bb1f71a8ef2029e2f9bd3086b2/d1/database/0e55836b-07de-426b-9977-b783b0ea6652/query',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql: query, params }),
    }
  );
  assert.ok(response.ok, `Corpus inspection ${response.status}`);
  const result = (await response.json()) as {
    success: boolean;
    result: { results: Record<string, string | number | null>[] }[];
  };
  assert.ok(result.success);
  return result.result[0].results;
}
const providers = [];
for (const provider of [...new Set(mapping.map((i) => i.provider))]) {
  const ids = mapping.filter((i) => i.provider === provider).map((i) => i.itemId);
  const rows = await sql(
    `SELECT count(*) AS retained, sum(EXISTS(SELECT 1 FROM contributions e WHERE e.content_id=p.content_id AND e.owner_id=p.owner_id AND e.category='source' AND e.field='title' AND json_extract(e.provenance_json,'$.method') NOT IN ('library-import','existing-library-import','original-library-import'))) AS freshlyEnriched FROM json_each(?) original JOIN personal_items original_item ON original_item.id=original.value LEFT JOIN item_aliases alias ON alias.alias_item_id=original_item.id AND alias.owner_id=original_item.owner_id JOIN personal_items p ON p.id=COALESCE(alias.canonical_item_id,original_item.id) AND p.owner_id=original_item.owner_id WHERE p.status!='deleted'`,
    [JSON.stringify(ids)]
  );
  assert.equal(rows[0].retained, ids.length);
  providers.push({ provider, originalItems: ids.length, ...rows[0] });
}
const jobs = await sql(
  `SELECT kind,json_extract(payload_json,'$.stage') AS stage,status,last_error_code AS errorCode,count(*) AS count FROM jobs GROUP BY kind,stage,status,last_error_code ORDER BY kind,stage,status`
);
const components = await sql(
  `SELECT component,status,reason_code AS reasonCode,count(*) AS count FROM enrichment_components GROUP BY component,status,reason_code ORDER BY component,status`
);
await writeFile(
  'evidence/corpus-health.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      scope:
        'Read-only inspection of fresh rewrite D1; original corpus membership checked against private import mapping; source extraction separate from imported metadata',
      providers,
      jobs,
      components,
    },
    null,
    2
  ) + '\n'
);
console.log(JSON.stringify({ providers, jobs }));
