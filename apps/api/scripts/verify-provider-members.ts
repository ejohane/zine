import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
const session = await realSession();
const report: {
  operation: string;
  status: number;
  requestId: string | null;
  count?: number;
  hasNext?: boolean;
  responseSha256: string;
}[] = [];
async function call(operation: string, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`https://api-next.myzine.app${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await session.getToken()}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const value = JSON.parse(await response.text());
  report.push({
    operation,
    status: response.status,
    requestId: response.headers.get('x-request-id'),
    ...(value.items ? { count: value.items.length, hasNext: !!value.nextCursor } : {}),
    responseSha256: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  });
  return { status: response.status, body: value };
}
try {
  const playlist = await call(
    'public-playlist-members',
    '/v1/items/itm_4850a94a26c0452f5776de16738ec96665016aac/members'
  );
  assert.equal(playlist.status, 200);
  assert.ok(playlist.body.items.length);
  const saved = await call('existing-library-podcast-show-capture', '/v1/saves', 'POST', {
    url: 'https://open.spotify.com/show/7Fj0XEuUQLUqoMZQdsLXqp',
    tags: ['api-verification'],
  });
  assert.ok([200, 201].includes(saved.status));
  const itemId = saved.body.item.id;
  const first = await call('show-members-first-page', `/v1/items/${itemId}/members`);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 50);
  assert.ok(first.body.nextCursor);
  const second = await call(
    'show-members-second-page',
    `/v1/items/${itemId}/members?cursor=${encodeURIComponent(first.body.nextCursor)}`
  );
  assert.equal(second.status, 200);
  assert.ok(second.body.items.length);
  const firstIds = new Set(first.body.items.map((item: { id: string }) => item.id));
  assert.ok(second.body.items.every((item: { id: string }) => !firstIds.has(item.id)));
  const album = await call(
    'album-members',
    '/v1/items/itm_80a5c6450568f0e0693ad60c5743ea2fa5ee114c/members'
  );
  assert.equal(album.status, 200);
  assert.ok(album.body.items.length);
  assert.equal(album.body.complete, true);
  const artifact = {
    at: new Date().toISOString(),
    origin: 'https://api-next.myzine.app',
    authentication: 'real Clerk session',
    actualProviderResponses: true,
    paginationNoDuplicates: true,
    observations: report,
  };
  await writeFile('evidence/spotify-members.json', JSON.stringify(artifact, null, 2) + '\n');
  console.log(
    JSON.stringify({
      observations: report.length,
      paginationVerified: true,
      allAssertionsPassed: true,
    })
  );
} finally {
  await session.close();
}
