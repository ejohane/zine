import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';

const origin = 'https://api-next-staging.myzine.app';
const session = await realSession(origin);
try {
  const token = await session.getToken();
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.equal(claims.azp, origin, 'Clerk must issue the staging authorized party');
  const options = {
    headers: { authorization: 'Bearer ' + token },
    redirect: 'error' as const,
    signal: AbortSignal.timeout(20000),
  };
  const staging = await fetch(origin + '/v1/me', options);
  assert.equal(staging.status, 200, 'Staging rejected its own real Clerk session');
  const production = await fetch('https://api-next.myzine.app/v1/me', options);
  assert.equal(production.status, 401, 'Production must reject staging-origin Clerk sessions');
  const health = (await fetch(origin + '/health').then((r) => r.json())) as {
    deploymentId: string;
    releaseSha: string;
  };
  const report = {
    at: new Date().toISOString(),
    origin,
    deploymentId: health.deploymentId,
    sourceSha: health.releaseSha,
    stagingSessionAccepted: true,
    productionRejectedStagingSession: true,
    scope:
      'Real Clerk FAPI password sign-in using staging origin, actual signed azp claim and deployed HTTP authentication. No fixture issuer or bypass. Browser rendering/interactive login is not claimed.',
  };
  await writeFile('evidence/staging-origin-live.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await session.close();
}
