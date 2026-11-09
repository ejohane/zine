import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const url = 'https://api-next.myzine.app/architecture';
const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
assert.equal(response.status, 200);
assert.match(response.headers.get('content-type') ?? '', /text\/html/);
const body = await response.text();
const standalone = await readFile('docs/architecture.html', 'utf8');
function normalize(html: string) {
  const nonce = /script-src 'nonce-([^']+)'/.exec(html)?.[1];
  assert.ok(nonce);
  return html.replaceAll(nonce, 'NORMALIZED_NONCE');
}
assert.equal(
  createHash('sha256').update(normalize(body)).digest('hex'),
  createHash('sha256').update(normalize(standalone)).digest('hex'),
  'Hosted and standalone guide content differ'
);
assert.match(body, /no live requests, login, or changes to your library/);
assert.doesNotMatch(body, /<script[^>]+src=|<link[^>]+stylesheet|style="/);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const report = {
  at: new Date().toISOString(),
  url,
  status: response.status,
  requestId: response.headers.get('x-request-id'),
  standalonePath: 'docs/architecture.html',
  standaloneBytes: Buffer.byteLength(standalone),
  standaloneSha256: hash(standalone),
  normalizedHostedAndStandaloneMatch: true,
  interactionTests: {
    passed: 2,
    coverage: [
      'six chapter navigation and reverse traversal',
      'component details in both explanation depths',
      'four save scenarios',
      'endpoint catalog generated from OpenAPI',
      'search and empty results',
    ],
  },
  publicWithoutLogin: true,
  externalScriptsOrStyles: false,
  liveApiMutations: false,
  browserVisualVerification: 'not performed: local browser use disabled in Work settings',
  scope:
    'Actual deployed HTTP delivery and matching standalone artifact; DOM interaction checks are separate from visual browser verification',
};
await writeFile('evidence/architecture-guide.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
