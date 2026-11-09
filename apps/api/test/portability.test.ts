import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { save, saveSchema, getItem } from '../src/items';
import { contribute } from '../src/enrichment';
import { eraseAccountData, exportSection } from '../src/portability';
import { atomicItemWrite, stmt } from '../src/lib';
import type { Env } from '../src/types';
describe('portable private data and account erasure', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let env: Env;
  beforeAll(async () => {
    runtime = await runtimeHarness();
    env = {
      DB: runtime.db as unknown as D1Database,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
    } as unknown as Env;
  });
  afterAll(async () => runtime?.close());
  it('exports retained material with private cursors and erases one owner without reviving stale jobs', async () => {
    const a = { userId: 'export-owner-a', contributor: 'verification' },
      b = { userId: 'export-owner-b', contributor: 'verification' };
    const shared = 'https://example.com/shared-portability';
    const saved = await save(
      env,
      a,
      saveSchema.parse({ url: shared, context: { text: 'private context' }, tags: ['private'] })
    );
    const other = await save(env, b, saveSchema.parse({ url: shared }));
    await save(env, a, saveSchema.parse({ url: 'https://example.com/unique-private-portability' }));
    const generation = (await stmt(
      env.DB,
      'SELECT generation FROM personal_items WHERE id=?',
      saved.body.item.id
    ).first<{ generation: number }>())!.generation;
    await contribute(env, a, saved.body.item.id, {
      field: 'transcript',
      category: 'source',
      value: { segments: [{ text: 'retained private material', startSeconds: 2, endSeconds: 5 }] },
      provenance: { method: 'verification', inputContributionIds: [] },
    });
    const exported = await exportSection(env, a.userId, 'enrichment', '', 10);
    expect(exported.records).toHaveLength(1);
    expect(exported.records[0].value).toEqual({
      segments: [{ text: 'retained private material', startSeconds: 2, endSeconds: 5 }],
    });
    expect(exported.records[0]).not.toHaveProperty('artifact_key');
    expect((await exportSection(env, b.userId, 'enrichment', '', 10)).records).toEqual([]);
    const page = await exportSection(env, a.userId, 'items', '', 1);
    expect(page.records).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    expect((await exportSection(env, a.userId, 'items', page.nextCursor!, 1)).records).toHaveLength(
      1
    );
    expect(await eraseAccountData(env, a.userId)).toMatchObject({
      authoritativeDataDeleted: true,
      derivedArtifactCleanup: 'queued',
    });
    for (const table of [
      'personal_items',
      'contributions',
      'save_occurrences',
      'collections',
      'sources',
      'subscriptions',
      'jobs',
      'api_tokens',
      'connections',
      'search_sessions',
      'search_documents',
    ])
      expect(
        (
          await stmt(
            env.DB,
            `SELECT COUNT(*) AS n FROM ${table} WHERE owner_id=?`,
            a.userId
          ).first<{ n: number }>()
        )?.n,
        table
      ).toBe(0);
    expect((await getItem(env, b.userId, other.body.item.id)).content.url).toBe(shared);
    expect(
      await stmt(
        env.DB,
        'SELECT id FROM content_items WHERE canonical_url=?',
        'https://example.com/unique-private-portability'
      ).first()
    ).toBeNull();
    expect(
      (await stmt(env.DB, 'SELECT COUNT(*) AS n FROM artifact_garbage').first<{ n: number }>())!.n
    ).toBeGreaterThan(0);
    const fresh = await save(env, a, saveSchema.parse({ url: shared }));
    expect(fresh.body.item.id).toBe(saved.body.item.id);
    await expect(
      contribute(
        env,
        a,
        fresh.body.item.id,
        {
          field: 'title',
          value: 'stale output',
          category: 'source',
          provenance: { method: 'old-job', inputContributionIds: [] },
        },
        undefined,
        generation
      )
    ).rejects.toMatchObject({ code: 'stale_generation' });
    expect((await getItem(env, a.userId, fresh.body.item.id)).context).toEqual([]);
  });
  it('rejects an in-flight item mutation that crosses an account erasure', async () => {
    const owner = 'erasure-race';
    const saved = await save(
      env,
      { userId: owner, contributor: 'test' },
      saveSchema.parse({ url: 'https://example.com/race-erasure' })
    );
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = atomicItemWrite(env, owner, saved.body.item.id, async () => {
      started();
      await gate;
      return {
        statements: [
          stmt(env.DB, 'UPDATE personal_items SET archived=1 WHERE id=?', saved.body.item.id),
        ],
        result: true,
      };
    });
    await ready;
    await eraseAccountData(env, owner);
    resume();
    await expect(pending).rejects.toMatchObject({ code: 'account_data_erased' });
  });
});
