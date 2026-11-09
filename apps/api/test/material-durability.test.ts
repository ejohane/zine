import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { contribute } from '../src/enrichment';
import { save, saveSchema, getItem, deleteItem } from '../src/items';
import { collectMaterialArtifacts } from '../src/jobs';
import { stmt } from '../src/lib';
import type { Env } from '../src/types';

describe('durable material uploads under ambiguous storage acknowledgements', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let env: Env;
  beforeAll(async () => {
    runtime = await runtimeHarness();
    env = {
      DB: runtime.db,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
    } as unknown as Env;
  });
  afterAll(async () => runtime?.close());
  const input = {
    field: 'article' as const,
    value: { text: 'Retained article material. '.repeat(100) },
    category: 'source' as const,
    provenance: { method: 'fault-test', inputContributionIds: [] },
  };
  async function capture() {
    const principal = { userId: crypto.randomUUID(), contributor: 'fault-test' };
    const result = await save(
      env,
      principal,
      saveSchema.parse({ url: `https://example.com/${crypto.randomUUID()}` })
    );
    return { principal, itemId: result.body.item.id };
  }
  async function age(key: string) {
    await stmt(
      env.DB,
      'UPDATE artifact_garbage SET created_at=? WHERE artifact_key=?',
      '2020-01-01T00:00:00.000Z',
      key
    ).run();
  }
  it('registers an upload whose R2 write succeeds but acknowledgement fails, then collects the orphan after quarantine', async () => {
    const { principal, itemId } = await capture();
    const broken = {
      ...env,
      ARTIFACTS: new Proxy(env.ARTIFACTS, {
        get(target, prop) {
          if (prop === 'put')
            return async (...args: Parameters<R2Bucket['put']>) => {
              await target.put(...args);
              throw new Error('lost R2 acknowledgement');
            };
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    };
    await expect(contribute(broken, principal, itemId, input)).rejects.toThrow(
      'lost R2 acknowledgement'
    );
    const artifact = await stmt(
      env.DB,
      'SELECT artifact_key FROM material_artifacts WHERE item_id=?',
      itemId
    ).first<{ artifact_key: string }>();
    expect(artifact).toBeTruthy();
    await collectMaterialArtifacts(env);
    expect(await env.ARTIFACTS.get(artifact!.artifact_key)).toBeTruthy();
    await age(artifact!.artifact_key);
    await collectMaterialArtifacts(env);
    expect(await env.ARTIFACTS.get(artifact!.artifact_key)).toBeNull();
  });
  it('preserves committed readable material after a D1 commit succeeds but acknowledgement fails', async () => {
    const { principal, itemId } = await capture();
    let batches = 0;
    const broken = {
      ...env,
      DB: new Proxy(env.DB, {
        get(target, prop) {
          if (prop === 'batch')
            return async (statements: D1PreparedStatement[]) => {
              const result = await target.batch(statements);
              if (++batches === 2) {
                throw new Error('lost D1 acknowledgement');
              }
              return result;
            };
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    };
    await expect(contribute(broken, principal, itemId, input)).rejects.toThrow(
      'lost D1 acknowledgement'
    );
    const artifact = await stmt(
      env.DB,
      'SELECT artifact_key FROM contributions WHERE owner_id=?',
      principal.userId
    ).first<{ artifact_key: string }>();
    await age(artifact!.artifact_key);
    await collectMaterialArtifacts(env);
    expect((await getItem(env, principal.userId, itemId, ['article'])).content).toHaveProperty(
      'article',
      input.value
    );
    expect(await env.ARTIFACTS.get(artifact!.artifact_key)).toBeTruthy();
    expect(
      await stmt(
        env.DB,
        'SELECT artifact_key FROM artifact_garbage WHERE artifact_key=?',
        artifact!.artifact_key
      ).first()
    ).toBeNull();
    await deleteItem(env, principal.userId, itemId);
    await age(artifact!.artifact_key);
    await collectMaterialArtifacts(env);
    expect(await env.ARTIFACTS.get(artifact!.artifact_key)).toBeNull();
  });
});
