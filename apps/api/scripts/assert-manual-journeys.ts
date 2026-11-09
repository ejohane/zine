import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const readLines = async (path: string) =>
  (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
const privateRows = await readLines('.local-data/manual-http.jsonl');
const publicRows = await readLines('evidence/manual-http.jsonl');
const assertions: { assertion: string; requestIds: string[] }[] = [];
function observation(label: string) {
  const entry = publicRows.filter((row) => row.label === label).at(-1);
  assert.ok(entry, `Missing manual observation: ${label}`);
  const full = privateRows.find((row) => row.requestId === entry.requestId);
  assert.ok(full);
  assert.equal(
    createHash('sha256').update(JSON.stringify(full.body)).digest('hex'),
    entry.responseSha256
  );
  return full;
}
function check(
  name: string,
  labels: string[],
  predicate: (rows: ReturnType<typeof observation>[]) => void
) {
  const rows = labels.map(observation);
  predicate(rows);
  assertions.push({ assertion: name, requestIds: rows.map((row) => row.requestId) });
}
check(
  'Manual collection creation, membership and synthesis retain a supporting saved reference',
  ['collection-create', 'collection-membership', 'collection-synthesis', 'collection-readback'],
  (rows) => {
    assert.deepEqual(
      rows.map((row) => row.status),
      [201, 200, 201, 200]
    );
    assert.equal(rows[3].body.notes[0].itemIds[0], rows[1].body.itemId);
  }
);
check('Text annotation edits succeed', ['annotation-create', 'annotation-update'], (rows) => {
  assert.equal(rows[0].status, 201);
  assert.equal(rows[1].status, 200);
  assert.equal(rows[0].body.id, rows[1].body.id);
  assert.notEqual(rows[0].body.text, rows[1].body.text);
});
check(
  'Personal correction wins while position, completion and archive remain independent',
  ['personal-correction', 'personal-state-readback'],
  (rows) => {
    assert.equal(rows[0].body.visibility, 'private');
    const item = rows[1].body;
    assert.equal(item.content.title, 'Atom specification — personal verification correction');
    assert.equal(item.archived, true);
    assert.equal(item.progress.position, 0.25);
    assert.ok(item.progress.completedAt);
  }
);
check(
  'Deleting a collection retains its saved item',
  ['collection-delete-preserves-item', 'collection-deletion-item-survives'],
  (rows) => {
    assert.equal(rows[0].status, 204);
    assert.equal(rows[1].status, 200);
    assert.deepEqual(rows[1].body.collectionIds, []);
  }
);
check(
  'Deleted items are unavailable and an old retry cannot resurrect them',
  ['personal-delete', 'deleted-item-not-found', 'stale-retry-does-not-resurrect'],
  (rows) => {
    assert.deepEqual(
      rows.map((row) => row.status),
      [204, 404, 410]
    );
  }
);
check(
  'Intentional resave begins with fresh personal state and no old annotations',
  [
    'intentional-resave-fresh-state',
    'fresh-generation-readback',
    'fresh-generation-no-old-annotations',
  ],
  (rows) => {
    assert.equal(rows[0].status, 201);
    const item = rows[1].body;
    assert.equal(item.archived, false);
    assert.equal(item.progress.position, null);
    assert.equal(item.progress.completedAt, null);
    assert.deepEqual(item.context, []);
    assert.deepEqual(item.collectionIds, []);
    assert.deepEqual(rows[2].body.annotations, []);
  }
);
check(
  'A real Spotify subscription delivers review-first intake without changing it to saved',
  ['review-first-intake-readback'],
  (rows) => {
    const items = rows[0].body.items;
    assert.ok(items.length);
    assert.ok(
      items.every(
        (item: { status: string; content: { platform: string } }) =>
          item.status === 'received' && item.content.platform === 'spotify'
      )
    );
  }
);
check('The export manifest excludes credentials', ['export-manifest'], (rows) => {
  assert.equal(rows[0].status, 200);
  assert.equal(rows[0].body.credentialsIncluded, false);
  assert.ok(rows[0].body.sections.includes('enrichment'));
});
const report = {
  at: new Date().toISOString(),
  origin: 'https://api-next.myzine.app',
  scope:
    'Assertions over actual interactive HTTP observations recorded by api-console.ts; no simulated upstreams',
  assertions,
};
await writeFile('evidence/manual-journeys.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ manualJourneys: assertions.length, allAssertionsPassed: true }));
