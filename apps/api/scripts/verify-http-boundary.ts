import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
const session = await realSession();
const results: unknown[] = [];
try {
  const tests = [
    { name: 'Authentication required', path: '/v1/items', status: 401, auth: false },
    {
      name: 'Unsafe loopback reference rejected',
      path: '/v1/saves',
      method: 'POST',
      body: JSON.stringify({ url: 'http://127.0.0.1/private' }),
      status: 422,
    },
    {
      name: 'Unsupported protocol rejected',
      path: '/v1/saves',
      method: 'POST',
      body: JSON.stringify({ url: 'ftp://example.com/file' }),
      status: 422,
    },
    {
      name: 'Unknown capture field rejected',
      path: '/v1/saves',
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com', unexpected: true }),
      status: 422,
    },
    { name: 'Invalid browse boolean rejected', path: '/v1/items?archived=maybe', status: 422 },
    { name: 'Invalid browse cursor rejected', path: '/v1/items?cursor=forged', status: 422 },
    {
      name: 'Search page size bounded',
      path: '/v1/items/search',
      method: 'POST',
      body: JSON.stringify({ query: 'test', match: 'keyword', limit: 100 }),
      status: 422,
    },
    {
      name: 'Unapproved browser origin rejected',
      path: '/v1/items',
      origin: 'https://unapproved.example',
      status: 403,
    },
    {
      name: 'Large request rejected',
      path: '/v1/saves',
      method: 'POST',
      body: JSON.stringify({ url: 'x'.repeat(1024 * 1024 + 1) }),
      status: 413,
    },
    { name: 'Unknown route is explicit', path: '/v1/no-such-resource', status: 404 },
  ];
  for (const test of tests) {
    const r = await fetch(`https://api-next.myzine.app${test.path}`, {
      method: test.method ?? 'GET',
      headers: {
        ...(test.auth === false ? {} : { authorization: `Bearer ${await session.getToken()}` }),
        ...(test.body ? { 'content-type': 'application/json' } : {}),
        ...(test.origin ? { origin: test.origin } : {}),
        'x-request-id': 'untrusted-client-id',
      },
      body: test.body,
      signal: AbortSignal.timeout(30000),
    });
    const value = await r.text();
    assert.equal(r.status, test.status, test.name);
    assert.ok(r.headers.get('x-request-id')?.startsWith('req_'));
    assert.notEqual(r.headers.get('x-request-id'), 'untrusted-client-id');
    results.push({
      name: test.name,
      status: r.status,
      requestId: r.headers.get('x-request-id'),
      responseSha256: createHash('sha256').update(value).digest('hex'),
    });
  }
  await writeFile(
    'evidence/http-boundary.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        origin: 'https://api-next.myzine.app',
        authentication:
          'Real Clerk session for authenticated cases; deliberately omitted in the negative authentication case',
        results,
      },
      null,
      2
    ) + '\n'
  );
  console.log(JSON.stringify({ checks: results.length, allPassed: true }));
} finally {
  await session.close();
}
