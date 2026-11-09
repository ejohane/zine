import { realSession } from './clerk-session';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const session = await realSession();
try {
  const token = await session.getToken();
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const response = await fetch('https://api-next.myzine.app/v1/me', {
    headers: { authorization: `Bearer ${token}` },
  });
  const value = (await response.json()) as { id?: string; error?: { code: string } };
  const report = {
    at: new Date().toISOString(),
    scope: 'real Clerk password login and authenticated deployed HTTP read',
    issuer: claims.iss,
    authorizedParty: claims.azp,
    subjectHash: createHash('sha256').update(claims.sub).digest('hex'),
    httpStatus: response.status,
    identityMatches: value.id === claims.sub,
    errorCode: value.error?.code,
  };
  await mkdir('evidence', { recursive: true });
  await writeFile('evidence/authentication.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  assert.equal(response.status, 200);
  assert.equal(value.id, claims.sub);
} finally {
  await session.close();
}
