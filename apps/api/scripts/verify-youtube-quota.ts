import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const token = process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token);
const response = await fetch(
  'https://api.cloudflare.com/client/v4/accounts/887513bb1f71a8ef2029e2f9bd3086b2/d1/database/0e55836b-07de-426b-9977-b783b0ea6652/query',
  {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      sql: "SELECT scope,not_before,consecutive_limits FROM provider_budgets WHERE scope IN('provider:youtube','provider:youtube:watch','provider:youtube:feed') ORDER BY scope",
    }),
  }
);
assert.ok(response.ok);
const value = (await response.json()) as {
  success: boolean;
  result: { results: { scope: string; not_before: string; consecutive_limits: number }[] }[];
};
assert.equal(value.success, true);
const budgets = value.result[0].results;
const watch = budgets.find((row) => row.scope === 'provider:youtube:watch');
const original = budgets.find((row) => row.scope === 'provider:youtube');
assert.ok(watch && original);
assert.ok(watch.not_before >= original.not_before);
assert.ok(watch.not_before > '2026-11-08T20:27:35.865Z');
await writeFile(
  'evidence/youtube-quota-snapshot.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      scope:
        'Read-only fresh rewrite D1 inspection; compare retained original cooldown to independent watch/feed scopes after successful original channel job',
      originalWatchCooldownRetained: true,
      budgets,
    },
    null,
    2
  ) + '\n'
);
console.log(JSON.stringify({ originalWatchCooldownRetained: true, budgets }));
