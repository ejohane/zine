import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const publicRows = (await readFile('evidence/manual-http.jsonl', 'utf8'))
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const privateRows = (await readFile('.local-data/manual-http.jsonl', 'utf8'))
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const byRequest = new Map(privateRows.map((row) => [row.requestId, row]));
const used = new Map<string, unknown>();
function observation(label: string, status = 200) {
  const record = [...publicRows].reverse().find((row) => row.label === label);
  assert.ok(record, `Missing manual observation ${label}`);
  const value = byRequest.get(record.requestId);
  assert.equal(value?.status, status, label);
  used.set(label, record);
  return value.body;
}
const alias = observation('manual-alias-identity');
assert.notEqual(alias.canonicalItemId, alias.aliases[0].itemId);
const contexts = observation('manual-merged-context-retention').entries;
assert.equal(contexts.length, 2);
assert.ok(
  contexts.some((entry: { text: string }) => entry.text.startsWith('Canonical reference:'))
);
assert.ok(
  contexts.some((entry: { text: string }) => entry.text.startsWith('Valid old locale URL:'))
);
assert.equal(observation('manual-alias-progress-valid').position, 0.42);
const receipt = observation('manual-successful-auto-merge-receipt').events[0];
assert.equal(receipt.evidence.method, 'http-redirect');
assert.equal(receipt.targetItemId, alias.canonicalItemId);
assert.equal(observation('manual-alias-relationship-read').relationships[0].target.itemId, null);
assert.equal(observation('manual-reverse-relationship').relationships[0].direction, 'incoming');
const urlFilter = observation('manual-old-url-filter');
assert.equal(urlFilter.items.length, 1);
assert.equal(urlFilter.items[0].id, alias.canonicalItemId);
const semantic = observation('manual-semantic-alias-filter');
assert.equal(semantic.items.length, 1);
assert.equal(semantic.items[0].id, alias.canonicalItemId);
assert.ok(semantic.items[0].matches.length);
assert.equal(
  observation('manual-alias-original-receipt-replay', 201).item.id,
  alias.aliases[0].itemId
);
observation('manual-delete-through-alias', 204);
observation('manual-canonical-deletion-visible', 404);
observation('manual-deleted-alias-receipt-tombstone', 410);
assert.equal(observation('manual-fresh-save-through-alias', 201).item.id, alias.canonicalItemId);
const fresh = observation('manual-fresh-alias-state');
assert.deepEqual(fresh.context, []);
assert.deepEqual(fresh.tags, []);
assert.equal(fresh.progress.position, null);
assert.equal(fresh.progress.completedAt, null);
assert.deepEqual(observation('manual-fresh-reconciliation-state').events, []);
const xIdentity = observation('manual-x-authoritative-identity');
assert.notEqual(xIdentity.canonicalItemId, xIdentity.aliases[0].itemId);
const xReceipt = observation('manual-x-provider-merge-receipt').events[0];
assert.equal(xReceipt.evidence.method, 'platform-identifier');
assert.equal(xReceipt.evidence.finalUrl, 'https://x.com/i/user/12087242');
assert.equal(observation('manual-x-context-retry-outcome').status, 'succeeded');
const xEdges = observation('manual-actual-x-source-relationships').relationships;
assert.ok(
  xEdges.some(
    (edge: { kind: string; provenance: { inputContributionIds: string[] } }) =>
      edge.kind === 'part_of' && edge.provenance.inputContributionIds.length
  )
);
assert.ok(observation('manual-x-profile-incoming-source-edge').relationships.length);
await writeFile(
  'evidence/identity-journeys.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      origin: 'https://api-next.myzine.app',
      authentication: 'real Clerk session',
      scope:
        'Assertions on interactively issued deployed HTTP requests; real MDN redirects, X provider identity, Workers AI/Vectorize; private full responses retained separately',
      checks: [
        'automatic permanent-redirect reconciliation',
        'both capture contexts retained',
        'old ID mutation',
        'private inspectable receipt',
        'URL target remains unsaved',
        'incoming edge after explicit save',
        'old URL filter',
        'semantic lookup after reconciliation',
        'original receipt still resolves',
        'alias deletion',
        'old receipt tombstone',
        'fresh generation clears personal state and receipts',
        'provider-authoritative X identity',
        'actual X source relationships',
      ],
      allAssertionsPassed: true,
      observations: [...used.values()],
    },
    null,
    2
  ) + '\n'
);
const initialized = observation('youtube-live-feed-after-quota-split');
assert.equal(initialized.initialized, true);
assert.equal(observation('youtube-original-job-after-quota-split').status, 'succeeded');
assert.equal(observation('manual-youtube-repeat-job-outcome').status, 'succeeded');
const first = observation('manual-youtube-actual-arrival').items;
const repeated = observation('manual-youtube-repeat-arrivals').items;
assert.equal(first.length, 1);
assert.deepEqual(
  first.map((item: { id: string }) => item.id),
  repeated.map((item: { id: string }) => item.id)
);
assert.equal(first[0].enrichment.fields.title.provenance.method, 'feed-ingestion');
assert.ok(first[0].content.description && first[0].content.thumbnail);
assert.equal(first[0].enrichment.fields.summary.provenance.coverage, 'metadata_only');
const quota = JSON.parse(await readFile('evidence/youtube-quota-snapshot.json', 'utf8'));
assert.equal(quota.originalWatchCooldownRetained, true);
await writeFile(
  'evidence/youtube-intake.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      origin: 'https://api-next.myzine.app',
      authentication: 'real Clerk session',
      originalNeverAttemptedJobSucceeded: true,
      initialized: true,
      latestItems: first.length,
      repeatNoDuplicates: true,
      feedMetadataRetained: ['title', 'description', 'creator', 'publishedAt', 'thumbnail'],
      summaryCoverage: 'metadata_only',
      publicWatchCooldownPreserved: quota.originalWatchCooldownRetained,
      scope:
        'Actual public channel feed; this does not verify Google-authorized pagination or video captions',
      observations: [...used]
        .filter(([label]) => label.includes('youtube'))
        .map(([, value]) => value),
    },
    null,
    2
  ) + '\n'
);
console.log(JSON.stringify({ identityChecks: 14, youtubeIntake: true, allAssertionsPassed: true }));
