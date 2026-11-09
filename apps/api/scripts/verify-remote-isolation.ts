import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';
const session = await realSession();
const owner = `verification_${randomUUID().replaceAll('-', '')}`;
const token = `zine2_${randomBytes(32).toString('hex')}`;
const tokenId = `tok_${randomUUID().replaceAll('-', '')}`;
const origin = 'https://api-next.myzine.app';
const observations: {
  operation: string;
  status: number;
  requestId: string | null;
  responseSha256: string;
}[] = [];
let primaryId: string | undefined,
  secondaryId: string | undefined,
  collectionId: string | undefined;
async function query(sql: string, params: (string | number)[] = []) {
  const response = await fetch(
    'https://api.cloudflare.com/client/v4/accounts/887513bb1f71a8ef2029e2f9bd3086b2/d1/database/0e55836b-07de-426b-9977-b783b0ea6652/query',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(30000),
    }
  );
  const result = (await response.json()) as { success: boolean };
  if (!response.ok || !result.success)
    throw new Error('Isolated verification credential setup failed; details suppressed');
}
async function call(
  operation: string,
  path: string,
  method = 'GET',
  body?: unknown,
  secondary = false
) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${secondary ? token : await session.getToken()}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const value = response.status === 204 ? null : JSON.parse(await response.text());
  observations.push({
    operation,
    status: response.status,
    requestId: response.headers.get('x-request-id'),
    responseSha256: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  });
  return { status: response.status, body: value };
}
try {
  // A synthetic fixture owner uses the actual deployed PAT authentication path.
  // The primary owner uses real Clerk. This is not a second real Clerk account.
  await query(
    'INSERT INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',
    [
      tokenId,
      owner,
      'temporary isolation verifier',
      createHash('sha256').update(token).digest('hex'),
      new Date(Date.now() + 3600000).toISOString(),
      new Date().toISOString(),
    ]
  );
  const identity = await call('secondary-pat-authenticated', '/v1/me', 'GET', undefined, true);
  assert.equal(identity.status, 200);
  assert.equal(identity.body.id, owner);
  const marker = `Private isolation marker ${randomUUID()}`;
  const url = `https://www.rssboard.org/rss-specification?isolation=${randomUUID()}`;
  const saved = await call('primary-durable-save', '/v1/saves', 'POST', {
    url,
    context: { text: marker },
    tags: ['api-verification'],
  });
  assert.equal(saved.status, 201);
  primaryId = saved.body.item.id;
  const contribution = await call(
    'primary-private-summary',
    `/v1/items/${primaryId}/enrichment`,
    'POST',
    {
      field: 'summary',
      value: marker,
      category: 'derived',
      provenance: { method: 'isolation-verification' },
    }
  );
  assert.equal(contribution.status, 201);
  assert.equal(
    (
      await call(
        'secondary-cannot-read-primary-item',
        `/v1/items/${primaryId}`,
        'GET',
        undefined,
        true
      )
    ).status,
    404
  );
  const other = await call(
    'secondary-same-reference-distinct-item',
    '/v1/saves',
    'POST',
    { url },
    true
  );
  assert.equal(other.status, 201);
  secondaryId = other.body.item.id;
  assert.notEqual(secondaryId, primaryId);
  const own = await call(
    'secondary-cannot-inherit-private-content',
    `/v1/items/${secondaryId}`,
    'GET',
    undefined,
    true
  );
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.context, []);
  assert.notEqual(own.body.content.summary, marker);
  const search = await call(
    'secondary-keyword-search-isolated',
    '/v1/items/search',
    'POST',
    { query: marker, match: 'keyword' },
    true
  );
  assert.equal(search.status, 200);
  assert.deepEqual(search.body.items, []);
  const visible = await call('primary-private-content-searchable', '/v1/items/search', 'POST', {
    query: marker,
    match: 'keyword',
  });
  assert.equal(visible.status, 200);
  assert.ok(visible.body.items.some((item: { id: string }) => item.id === primaryId));
  assert.equal(
    (
      await call(
        'secondary-cannot-use-primary-provenance',
        `/v1/items/${secondaryId}/enrichment`,
        'POST',
        {
          field: 'summary',
          value: 'Unauthorized derivation',
          category: 'derived',
          provenance: {
            method: 'isolation-verification',
            inputContributionIds: [contribution.body.id],
          },
        },
        true
      )
    ).status,
    404
  );
  for (const suffix of ['identity', 'reconciliations', 'relationships']) {
    assert.equal(
      (
        await call(
          `secondary-cannot-read-primary-${suffix}`,
          `/v1/items/${primaryId}/${suffix}`,
          'GET',
          undefined,
          true
        )
      ).status,
      404
    );
  }
  assert.equal(
    (
      await call(
        'secondary-cannot-link-primary-item',
        `/v1/items/${secondaryId}/relationships`,
        'POST',
        {
          kind: 'related',
          targetItemId: primaryId,
          provenance: { method: 'isolation-verification' },
        },
        true
      )
    ).status,
    404
  );
  assert.equal(
    (
      await call(
        'secondary-cannot-use-primary-relationship-provenance',
        `/v1/items/${secondaryId}/relationships`,
        'POST',
        {
          kind: 'references',
          targetUrl: 'https://www.w3.org/TR/',
          provenance: {
            method: 'isolation-verification',
            inputContributionIds: [contribution.body.id],
          },
        },
        true
      )
    ).status,
    404
  );
  const collection = await call(
    'secondary-own-collection',
    '/v1/collections',
    'POST',
    { name: 'Temporary isolation collection' },
    true
  );
  assert.equal(collection.status, 201);
  collectionId = collection.body.id;
  assert.equal(
    (
      await call(
        'secondary-cannot-collect-primary-item',
        `/v1/collections/${collectionId}/items/${primaryId}`,
        'PUT',
        { position: 0 },
        true
      )
    ).status,
    404
  );
  assert.equal(
    (
      await call(
        'agent-cannot-create-persistent-credentials',
        '/v1/tokens',
        'POST',
        { name: 'Forbidden child credential' },
        true
      )
    ).status,
    403
  );
  assert.equal(
    (await call('agent-cannot-erase-account', '/v1/account/data', 'DELETE', undefined, true))
      .status,
    403
  );
  await query('DELETE FROM api_tokens WHERE id=? AND owner_id=?', [tokenId, owner]);
  assert.equal(
    (await call('revoked-pat-immediately-rejected', '/v1/me', 'GET', undefined, true)).status,
    401
  );
  const report = {
    at: new Date().toISOString(),
    origin,
    authentication: {
      primary: 'real Clerk session',
      secondary:
        'temporary synthetic owner using the deployed PAT auth path; token hash seeded only in the new database',
    },
    observations,
    allAssertionsPassed: true,
    credentialValuesPersisted: false,
  };
  await writeFile('evidence/remote-isolation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: observations.length, allAssertionsPassed: true }));
} finally {
  // Reenable only this temporary test token to clean its records through normal APIs.
  await query(
    'INSERT OR IGNORE INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',
    [
      tokenId,
      owner,
      'temporary cleanup',
      createHash('sha256').update(token).digest('hex'),
      new Date(Date.now() + 60000).toISOString(),
      new Date().toISOString(),
    ]
  );
  if (collectionId)
    await call(
      'cleanup-secondary-collection',
      `/v1/collections/${collectionId}`,
      'DELETE',
      undefined,
      true
    );
  if (secondaryId)
    await call('cleanup-secondary-item', `/v1/items/${secondaryId}`, 'DELETE', undefined, true);
  if (primaryId) await call('cleanup-primary-item', `/v1/items/${primaryId}`, 'DELETE');
  await query('DELETE FROM jobs WHERE owner_id=?', [owner]);
  await query('DELETE FROM idempotency WHERE owner_id=?', [owner]);
  await query('DELETE FROM search_sessions WHERE owner_id=?', [owner]);
  await query('DELETE FROM personal_items WHERE owner_id=?', [owner]);
  await query('DELETE FROM api_tokens WHERE owner_id=?', [owner]);
  await session.close();
}
