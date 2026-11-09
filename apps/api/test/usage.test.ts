import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { reserveUsage, usageSummary, usageOwnerKey, UsageLimitError } from '../src/usage';
import { save, saveSchema, getItem } from '../src/items';
import { contribute } from '../src/enrichment';
import { eraseAccountData } from '../src/portability';
import { runJob, scheduled } from '../src/jobs';
import { embedding } from '../src/semantic';
import { digest, stmt } from '../src/lib';
import type { Env } from '../src/types';

describe('atomic per-owner and per-caller usage ceilings', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>, env: Env;
  beforeAll(async () => {
    runtime = await runtimeHarness({
      bindings: {
        USAGE_LIMITS_JSON: JSON.stringify({ requestsPerMinute: 5, callerRequestsPerMinute: 2 }),
      },
    });
    env = {
      DB: runtime.db,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
      JOBS: await runtime.mf.getQueueProducer('JOBS'),
    } as unknown as Env;
  });
  afterAll(async () => runtime?.close());
  it('admits exactly the concurrent ceiling, rolls rejected charges back, and resets by window', async () => {
    const owner = 'parallel-usage',
      at = Date.parse('2030-01-01T12:00:01.000Z');
    const charge = { metric: 'fixture', amount: 1, limit: 10, periodSeconds: 60 };
    const attempts = await Promise.allSettled(
      Array.from({ length: 25 }, () => reserveUsage(env, owner, [charge], at))
    );
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(10);
    for (const rejected of attempts.filter((result) => result.status === 'rejected'))
      expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(UsageLimitError);
    const rows = await runtime.db
      .prepare('SELECT used FROM usage_windows WHERE owner_key=?')
      .bind(await usageOwnerKey(owner))
      .all<{ used: number }>();
    expect(rows.results.map((row) => row.used)).toEqual([10]);
    expect(
      (await runtime.db.prepare('SELECT COUNT(*) AS n FROM usage_guards').first<{ n: number }>())!.n
    ).toBe(0);
    await expect(reserveUsage(env, owner, [charge], at + 60000)).resolves.toBeUndefined();
  });
  it('rejects an oversized multi-counter charge without consuming the other allowance', async () => {
    const owner = 'atomic-usage';
    await expect(
      reserveUsage(env, owner, [
        { metric: 'calls', amount: 1, limit: 2, periodSeconds: 86400 },
        { metric: 'bytes', amount: 6, limit: 5, periodSeconds: 86400 },
      ])
    ).rejects.toMatchObject({ code: 'usage_limit_exceeded' });
    expect((await usageSummary(env, owner)).windows).toEqual([]);
    await reserveUsage(env, owner, [
      { metric: 'calls', amount: 1, limit: 2, periodSeconds: 86400 },
      { metric: 'bytes', amount: 4, limit: 5, periodSeconds: 86400 },
    ]);
    await expect(
      reserveUsage(env, owner, [
        { metric: 'calls', amount: 1, limit: 2, periodSeconds: 86400 },
        { metric: 'bytes', amount: 2, limit: 5, periodSeconds: 86400 },
      ])
    ).rejects.toBeInstanceOf(UsageLimitError);
    expect((await usageSummary(env, owner)).windows.map((row) => [row.metric, row.used])).toEqual([
      ['bytes', 4],
      ['calls', 1],
    ]);
    await reserveUsage(env, 'another-owner', [
      { metric: 'bytes', amount: 5, limit: 5, periodSeconds: 86400 },
    ]);
  });
  it('enforces live Worker request ceilings per token and owner, with retry/reset headers', async () => {
    async function key(owner: string, id: string) {
      const raw = 'zine2_' + crypto.randomUUID();
      await stmt(
        env.DB,
        'INSERT INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',
        id,
        owner,
        id,
        await digest(raw),
        '2030-01-01T00:00:00.000Z',
        new Date().toISOString()
      ).run();
      return raw;
    }
    async function request(raw: string) {
      return runtime.mf.dispatchFetch('http://localhost/v1/me', {
        headers: { authorization: `Bearer ${raw}` },
      });
    }
    const a = await key('http-usage', 'tok_usage_a'),
      b = await key('http-usage', 'tok_usage_b'),
      c = await key('http-usage', 'tok_usage_c');
    expect((await request(a)).status).toBe(200);
    expect((await request(a)).status).toBe(200);
    const denied = await request(a);
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(denied.headers.get('x-usage-reset-at')).toBeTruthy();
    expect(await denied.json()).toMatchObject({ error: { code: 'usage_limit_exceeded' } });
    expect((await request(b)).status).toBe(200);
    expect((await request(b)).status).toBe(200);
    expect((await request(c)).status).toBe(200);
    expect((await request(c)).status).toBe(429);
    expect((await request(await key('http-other', 'tok_usage_other'))).status).toBe(200);
    const summary = await usageSummary(env, 'http-usage');
    expect(summary.windows.filter((row) => row.subject === 'owner')[0].used).toBe(5);
    expect(
      summary.windows
        .filter((row) => row.subject !== 'owner')
        .map((row) => row.used)
        .sort()
    ).toEqual([1, 2, 2]);
  });
  it('stops AI before inference and stops large writes before storage when quotas are exhausted', async () => {
    let calls = 0,
      puts = 0;
    const metered = {
      ...env,
      USAGE_LIMITS_JSON: JSON.stringify({ aiCallsPerDay: 1, artifactBytesPerDay: 1 }),
      AI: {
        run: async () => {
          calls++;
          return { data: [Array(1024).fill(0.1)] };
        },
      },
      ARTIFACTS: new Proxy(env.ARTIFACTS, {
        get(target, prop) {
          if (prop === 'put')
            return async () => {
              puts++;
              throw new Error('Must not write');
            };
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    } as unknown as Env;
    await embedding(metered, ['source'], 'queries', 'ai-usage');
    await expect(embedding(metered, ['source'], 'queries', 'ai-usage')).rejects.toBeInstanceOf(
      UsageLimitError
    );
    expect(calls).toBe(1);
    const principal = { userId: 'artifact-usage', contributor: 'fixture' };
    const saved = await save(
      metered,
      principal,
      saveSchema.parse({ url: 'https://example.com/retained-overage' })
    );
    await expect(
      contribute(metered, principal, saved.body.item.id, {
        field: 'article',
        value: { text: 'Available reference; retained material exceeds allowance' },
        category: 'source',
        provenance: { method: 'fixture', inputContributionIds: [] },
      })
    ).rejects.toBeInstanceOf(UsageLimitError);
    expect(puts).toBe(0);
    expect((await getItem(metered, principal.userId, saved.body.item.id)).status).toBe('saved');
    expect(
      await stmt(
        env.DB,
        'SELECT artifact_key FROM material_artifacts WHERE item_id=?',
        saved.body.item.id
      ).first()
    ).toBeNull();
  });
  it('defers queued enrichment until reset without burning failure attempts or losing the save', async () => {
    const limited = { ...env, USAGE_LIMITS_JSON: JSON.stringify({ enrichmentPerDay: 1 }) };
    const principal = { userId: 'source-job-usage', contributor: 'fixture' };
    const first = await save(
      limited,
      principal,
      saveSchema.parse({ url: 'https://x.com/i/status/1234567' })
    );
    const second = await save(
      limited,
      principal,
      saveSchema.parse({
        url: 'https://x.com/i/status/7654321',
        context: { text: 'Keep this saved while enrichment waits' },
      })
    );
    const firstJob = await stmt(
      env.DB,
      'SELECT id FROM jobs WHERE item_id=?',
      first.body.item.id
    ).first<string>('id');
    const secondJob = await stmt(
      env.DB,
      'SELECT id FROM jobs WHERE item_id=?',
      second.body.item.id
    ).first<string>('id');
    await runJob(limited, firstJob!);
    expect(await runJob(limited, secondJob!)).toMatchObject({
      status: 'deferred',
      code: 'usage_limit_exceeded',
    });
    const pending = await stmt(
      env.DB,
      'SELECT status,attempts,available_at,last_error_code FROM jobs WHERE id=?',
      secondJob!
    ).first<{ status: string; attempts: number; available_at: string; last_error_code: string }>();
    expect(pending).toMatchObject({
      status: 'pending',
      attempts: 0,
      last_error_code: 'usage_limit_exceeded',
    });
    expect(Date.parse(pending!.available_at)).toBeGreaterThan(Date.now());
    expect((await getItem(limited, principal.userId, second.body.item.id)).context).toHaveLength(1);
  });
  it('retains minimal hashed counters across erasure and expires them through maintenance', async () => {
    const owner = 'erased-usage-owner';
    const charge = { metric: 'abuse-window', amount: 1, limit: 1, periodSeconds: 60 };
    await reserveUsage(env, owner, [charge]);
    await eraseAccountData(env, owner);
    await expect(reserveUsage(env, owner, [charge])).rejects.toBeInstanceOf(UsageLimitError);
    const key = await usageOwnerKey(owner);
    expect(key).not.toContain(owner);
    await stmt(
      env.DB,
      "UPDATE usage_windows SET expires_at='2020-01-01T00:00:00.000Z' WHERE owner_key=?",
      key
    ).run();
    await scheduled({} as ScheduledController, env);
    expect(
      await stmt(env.DB, 'SELECT owner_key FROM usage_windows WHERE owner_key=?', key).first()
    ).toBeNull();
  });
});
