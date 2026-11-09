import assert from 'node:assert/strict';
const origin = 'https://api-next.myzine.app',
  token = process.env.ZINE_API_NEXT_OPS_TOKEN;
assert.ok(token, 'Configure the scoped scheduled-monitor token before enabling this job');
const healthResponse = await fetch(origin + '/health', {
  redirect: 'error',
  signal: AbortSignal.timeout(15000),
});
assert.equal(healthResponse.status, 200, 'Public API health failed');
const health = (await healthResponse.json()) as { deploymentId: string; releaseSha: string };
const statusResponse = await fetch(origin + '/v1/ops/status', {
  redirect: 'error',
  signal: AbortSignal.timeout(20000),
  headers: { authorization: 'Bearer ' + token },
});
assert.equal(
  statusResponse.status,
  200,
  'Authenticated operations check failed; inspect token expiry and service health'
);
const status = (await statusResponse.json()) as {
  conditions: Record<string, boolean>;
  deploymentId: string;
  observedAt: string;
};
assert.equal(
  status.deploymentId,
  health.deploymentId,
  'Release changed during monitor check; rerun'
);
const critical = ['queue_stalled', 'cron_stale', 'cron_failed'].filter(
  (code) => status.conditions[code]
);
// Normal unavailable source material remains visible in ops; it is not an infrastructure outage.
console.log(
  JSON.stringify({
    at: status.observedAt,
    origin,
    deploymentId: health.deploymentId,
    releaseSha: health.releaseSha,
    criticalConditions: critical,
  })
);
const expires = Date.parse(process.env.ZINE_API_NEXT_OPS_TOKEN_EXPIRES_AT ?? '');
if (!Number.isFinite(expires) || expires < Date.now() + 14 * 86400000)
  console.log(
    '::warning::Scheduled monitor token expires soon or its expiry metadata is missing; run the documented rotation command.'
  );
assert.equal(critical.length, 0, 'Critical operational conditions are open: ' + critical.join(','));
