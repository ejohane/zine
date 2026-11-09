import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { collectionMembers } from '../src/members';
import { save, saveSchema } from '../src/items';
import { contribute } from '../src/enrichment';
import { stmt } from '../src/lib';
import type { Env } from '../src/types';
describe('platform collection member retrieval', () => {
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
  it('pages retained members without saving them, rejects another owner and detects changed material', async () => {
    const principal = { userId: 'member-owner', contributor: 'test' };
    const saved = await save(
      env,
      principal,
      saveSchema.parse({ url: 'https://example.com/collection' })
    );
    const values = Array.from({ length: 101 }, (_, i) => ({
      url: `https://example.com/member/${i}`,
      title: `Entry ${i}`,
    }));
    const contribution = await contribute(env, principal, saved.body.item.id, {
      field: 'members',
      value: values,
      category: 'source',
      provenance: { method: 'fixture', inputContributionIds: [] },
    });
    const first = await collectionMembers(env, principal.userId, saved.body.item.id);
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    const second = await collectionMembers(
      env,
      principal.userId,
      saved.body.item.id,
      first.nextCursor!
    );
    expect(second.items).toHaveLength(50);
    const third = await collectionMembers(
      env,
      principal.userId,
      saved.body.item.id,
      second.nextCursor!
    );
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
    expect(
      (
        await stmt(
          env.DB,
          'SELECT COUNT(*) AS n FROM personal_items WHERE owner_id=?',
          principal.userId
        ).first<{ n: number }>()
      )?.n
    ).toBe(1);
    await expect(
      collectionMembers(env, 'another-owner', saved.body.item.id, first.nextCursor!)
    ).rejects.toMatchObject({ code: 'not_found' });
    await contribute(
      env,
      principal,
      saved.body.item.id,
      {
        field: 'members',
        value: values.slice(1),
        category: 'source',
        provenance: { method: 'fixture', inputContributionIds: [] },
      },
      contribution.id
    );
    await expect(
      collectionMembers(env, principal.userId, saved.body.item.id, first.nextCursor!)
    ).rejects.toMatchObject({ code: 'members_changed' });
  });
});
