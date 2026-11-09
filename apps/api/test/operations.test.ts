import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { checkOperations, listAlerts } from '../src/operations';
import { scheduled } from '../src/jobs';
import { eraseAccountData } from '../src/portability';
import { now, ownerGeneration, stmt } from '../src/lib';
import type { Env } from '../src/types';

describe('owner operations and durable alert lifecycle', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>, env: Env;
  beforeAll(async () => {
    runtime = await runtimeHarness();
    env = {
      DB: runtime.db,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
      JOBS: await runtime.mf.getQueueProducer('JOBS'),
      ENVIRONMENT: 'verification',
    } as Env;
  });
  afterAll(async () => runtime?.close());
  async function call(token: string, path: string, method = 'GET', body?: unknown) {
    const response = await runtime.mf.dispatchFetch('http://localhost/v1' + path, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: JSON.parse(await response.text()) };
  }
  it('detects failures, resolves after recovery, deduplicates repeats and isolates owners', async () => {
    const owner = 'ops-fixture',
      timestamp = now();
    await stmt(
      env.DB,
      `INSERT INTO jobs(id,owner_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES('ops-failed',?,'sync','{}','failed',?,?,?)`,
      owner,
      timestamp,
      timestamp,
      timestamp
    ).run();
    const first = await checkOperations(env, owner);
    expect(first.status.conditions.jobs_failed).toBe(true);
    expect(first.status.conditions.cron_stale).toBe(true);
    await checkOperations(env, owner);
    expect((await listAlerts(env, owner)).every((alert) => alert.occurrences === 1)).toBe(true);
    expect(await listAlerts(env, 'ops-other')).toEqual([]);
    await stmt(env.DB, "UPDATE jobs SET status='cancelled' WHERE id='ops-failed'").run();
    await scheduled({} as ScheduledController, env);
    await checkOperations(env, owner);
    const recovered = await listAlerts(env, owner);
    expect(recovered).toHaveLength(2);
    expect(recovered.every((alert) => alert.status === 'resolved' && alert.resolvedAt)).toBe(true);
    await stmt(env.DB, "UPDATE jobs SET status='failed' WHERE id='ops-failed'").run();
    const reopened = await checkOperations(env, owner);
    expect(reopened.alerts.find((alert) => alert.code === 'jobs_failed')).toMatchObject({
      status: 'open',
      occurrences: 2,
      resolvedAt: null,
    });
  });
  it('excludes intentional future work from a stalled backlog and recognizes expired leases', async () => {
    const owner = 'ops-backlog',
      old = '2020-01-01T00:00:00.000Z',
      future = '2030-01-01T00:00:00.000Z';
    await stmt(
      env.DB,
      `INSERT INTO jobs(id,owner_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES('ops-future',?,'sync','{}','pending',?,?,?)`,
      owner,
      future,
      old,
      old
    ).run();
    expect((await checkOperations(env, owner)).status.conditions.queue_stalled).toBe(false);
    await stmt(
      env.DB,
      "UPDATE jobs SET status='running',lease_until=? WHERE id='ops-future'",
      old
    ).run();
    expect((await checkOperations(env, owner)).status.conditions.queue_stalled).toBe(true);
  });
  it('enforces read/manage scopes and returns only the authenticated owner aggregates', async () => {
    const session = await runtime.token('ops-fixture');
    const read = await call(session, '/tokens', 'POST', {
      name: 'Ops observer',
      scopes: ['ops:read'],
    });
    expect((await call(read.body.token, '/ops/status')).body.jobs.failed).toBe(1);
    expect((await call(read.body.token, '/ops/usage')).status).toBe(200);
    expect((await call(read.body.token, '/ops/check', 'POST')).status).toBe(403);
    const otherSession = await runtime.token('ops-unrelated');
    expect((await call(otherSession, '/ops/status')).body.jobs.total).toBe(0);
    const manager = await call(session, '/tokens', 'POST', {
      name: 'Ops check',
      scopes: ['ops:manage'],
    });
    expect((await call(manager.body.token, '/ops/check', 'POST')).status).toBe(200);
  });
  it('erases alert state and fences a check captured before erasure', async () => {
    const owner = 'ops-erasure';
    await checkOperations(env, owner);
    const epoch = await ownerGeneration(env, owner);
    await eraseAccountData(env, owner);
    await expect(
      checkOperations({ ...env, OPERATION_EPOCH: { owner, generation: epoch } }, owner)
    ).rejects.toMatchObject({ code: 'account_data_erased' });
    expect(await listAlerts(env, owner)).toEqual([]);
  });
});
