import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';
import { ZineClient } from '../client';
import { cloudflare, environments } from './cloudflare-control';
const target = environments.staging,
  session = await realSession(),
  client = new ZineClient({ baseUrl: target.origin, token: session.getToken, retries: 0 });
const jobId = 'job_opsproof_' + crypto.randomUUID().replaceAll('-', '');
let inserted = false;
async function query(sql: string, params: unknown[] = []) {
  return cloudflare('d1/database/' + target.databaseId + '/query', 'POST', { sql, params });
}
try {
  const owner = (await client.request<{ id: string }>('GET', '/v1/me')).id;
  const baseline = await client.request<{ conditions: { queue_stalled: boolean } }>(
    'GET',
    '/v1/ops/status'
  );
  assert.equal(
    baseline.conditions.queue_stalled,
    false,
    'A genuine staging backlog already exists; resolve it before this isolated probe'
  );
  const timestamp = new Date().toISOString();
  // Controlled staging-only fault. The future dispatch marker prevents real queue execution.
  await query(
    `INSERT INTO jobs(id,owner_id,kind,payload_json,status,available_at,last_dispatched_at,created_at,updated_at) VALUES(?,?,'sync','{}','pending',?,?,?,?)`,
    [
      jobId,
      owner,
      '2020-01-01T00:00:00.000Z',
      new Date(Date.now() + 3600000).toISOString(),
      timestamp,
      timestamp,
    ]
  );
  inserted = true;
  const open = await client.request<{
    status: { conditions: { queue_stalled: boolean } };
    alerts: { code: string; status: string; occurrences: number }[];
  }>('POST', '/v1/ops/check');
  assert.equal(open.status.conditions.queue_stalled, true);
  const alert = open.alerts.find((a) => a.code === 'queue_stalled');
  assert.equal(alert?.status, 'open');
  const repeated = await client.request<typeof open>('POST', '/v1/ops/check');
  assert.equal(
    repeated.alerts.find((a) => a.code === 'queue_stalled')?.occurrences,
    alert.occurrences
  );
  await query('DELETE FROM jobs WHERE id=? AND owner_id=?', [jobId, owner]);
  inserted = false;
  const resolved = await client.request<typeof open>('POST', '/v1/ops/check');
  assert.equal(resolved.status.conditions.queue_stalled, false);
  assert.equal(resolved.alerts.find((a) => a.code === 'queue_stalled')?.status, 'resolved');
  const report = {
    at: new Date().toISOString(),
    origin: target.origin,
    scope:
      'Controlled pending-job fault injected only into staging D1, observed and resolved through the actual API using real Clerk. No production/provider/library mutation.',
    checks: {
      baselineClear: true,
      backlogDetected: true,
      durableAlertOpened: true,
      repeatedCheckDeduplicated: true,
      conditionCleared: true,
      alertResolved: true,
    },
  };
  await writeFile('evidence/operations-live.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  if (inserted) await query('DELETE FROM jobs WHERE id=?', [jobId]);
  await session.close();
}
