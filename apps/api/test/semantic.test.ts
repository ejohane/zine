import { vectorFilterPages } from '../src/semantic';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { contribute } from '../src/enrichment';
import { save, saveSchema, deleteItem } from '../src/items';
import { indexItem, namespaceFor, semanticCandidates } from '../src/semantic';
import { searchItems, searchSchema } from '../src/query';
import { all, stmt } from '../src/lib';
import type { Env } from '../src/types';

// The external AI/vector bindings are controlled doubles. D1/R2/Worker are real
// local runtimes. These tests prove isolation/index lifecycle, not model quality.
describe('derived semantic index authorization', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let env: Env;
  const vectors = new Map<
    string,
    {
      id: string;
      namespace: string;
      metadata: { itemId: string; documentId: string };
      values: number[];
    }
  >();
  const queriedNamespaces: string[] = [];
  let maliciousId: string | undefined;
  beforeAll(async () => {
    runtime = await runtimeHarness();
    env = {
      DB: runtime.db as unknown as D1Database,
      ARTIFACTS: (await runtime.mf.getR2Bucket('ARTIFACTS')) as unknown as R2Bucket,
      ENVIRONMENT: 'test',
      EMBEDDING_MODEL: '@cf/qwen/qwen3-embedding-0.6b',
      AI: {
        run: async (
          _model: string,
          input: { text?: string[]; documents?: string[]; queries?: string[] }
        ) => ({
          data: (input.text ?? input.documents ?? input.queries ?? []).map(() =>
            Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0))
          ),
        }),
      } as unknown as Ai,
      VECTORS: {
        upsert: async (entries: typeof vectors extends Map<string, infer T> ? T[] : never) => {
          for (const entry of entries) vectors.set(entry.id, entry);
          return { mutationId: 'test' };
        },
        deleteByIds: async (ids: string[]) => {
          for (const id of ids) vectors.delete(id);
          return { mutationId: 'test' };
        },
        query: async (
          _values: number[],
          options: { namespace: string; filter: { itemId: { $in: string[] } } }
        ) => {
          queriedNamespaces.push(options.namespace);
          const matches = [...vectors.values()]
            .filter(
              (entry) =>
                entry.namespace === options.namespace &&
                options.filter.itemId.$in.includes(entry.metadata.itemId)
            )
            .map((entry) => ({ id: entry.id, score: 0.8 }));
          if (maliciousId) matches.push({ id: maliciousId, score: 0.99 });
          return { matches, count: matches.length };
        },
      } as unknown as VectorizeIndex,
    } as Env;
  });
  afterAll(async () => runtime?.close());

  it('indexes only visible documents and rejects hostile cross-owner vector results', async () => {
    const a = { userId: 'semantic-owner-a', contributor: 'agent' };
    const b = { userId: 'semantic-owner-b', contributor: 'agent' };
    const url = 'https://example.com/shared-semantic';
    const savedA = await save(env, a, saveSchema.parse({ url }));
    const savedB = await save(env, b, saveSchema.parse({ url }));
    await contribute(env, a, savedA.body.item.id, {
      field: 'summary',
      value: 'Local automation without remote services',
      category: 'derived',
      provenance: { method: 'test', inputContributionIds: [] },
    });
    await contribute(env, b, savedB.body.item.id, {
      field: 'summary',
      value: 'Private owner B detail',
      category: 'derived',
      provenance: { method: 'test', inputContributionIds: [] },
    });
    await indexItem(env, a.userId, savedA.body.item.id);
    await indexItem(env, b.userId, savedB.body.item.id);
    const namespaceB = await namespaceFor(b.userId);
    maliciousId = [...vectors.values()].find((entry) => entry.namespace === namespaceB)!.id;
    const results = await semanticCandidates(env, a.userId, 'automation', [savedA.body.item.id]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(savedA.body.item.id);
    expect(queriedNamespaces.at(-1)).toBe(await namespaceFor(a.userId));
    const indexed = await all<{ item_id: string; document_id: number }>(
      env.DB,
      'SELECT * FROM indexed_documents WHERE item_id=?',
      savedA.body.item.id
    );
    expect(indexed).toHaveLength(1);
    const query = await searchItems(
      env,
      a.userId,
      searchSchema.parse({ query: 'automation', match: 'hybrid' })
    );
    expect(query.items).toHaveLength(1);
    expect(JSON.stringify(query)).not.toContain('Private owner B detail');
    const state = await stmt(
      env.DB,
      'SELECT * FROM index_requests WHERE item_id=?',
      savedA.body.item.id
    ).first<{ requested_revision: number; indexed_revision: number }>();
    expect(state!.requested_revision).toBe(state!.indexed_revision);
  });

  it('retains vector deletion work after authoritative document deletion', async () => {
    const owner = { userId: 'semantic-deletion', contributor: 'agent' };
    const saved = await save(
      env,
      owner,
      saveSchema.parse({ url: 'https://example.com/semantic-delete' })
    );
    await contribute(env, owner, saved.body.item.id, {
      field: 'title',
      value: 'Delete this',
      category: 'source',
      provenance: { method: 'test', inputContributionIds: [] },
    });
    await indexItem(env, owner.userId, saved.body.item.id);
    const before = await stmt(
      env.DB,
      'SELECT vector_id FROM indexed_documents WHERE item_id=?',
      saved.body.item.id
    ).first<string>('vector_id');
    expect(before).toBeTruthy();
    await deleteItem(env, owner.userId, saved.body.item.id);
    expect(
      await stmt(env.DB, 'SELECT vector_id FROM vector_garbage WHERE vector_id=?', before).first()
    ).toBeTruthy();
    expect(await semanticCandidates(env, owner.userId, 'delete', [saved.body.item.id])).toEqual([]);
  });
  it('resumes a long material index without falsely marking unfinished work complete', async () => {
    const owner = 'long-material-owner';
    const principal = { userId: owner, contributor: 'test' };
    const saved = await save(
      env,
      principal,
      saveSchema.parse({ url: 'https://example.com/long-material' })
    );
    await contribute(env, principal, saved.body.item.id, {
      field: 'article',
      value: { text: 'Detailed retained source text. '.repeat(16000) },
      category: 'source',
      provenance: { method: 'fixture', inputContributionIds: [] },
    });
    expect(await indexItem(env, owner, saved.body.item.id)).toBe(false);
    const pending = await stmt(
      env.DB,
      'SELECT requested_revision,indexed_revision FROM index_requests WHERE item_id=?',
      saved.body.item.id
    ).first<{ requested_revision: number; indexed_revision: number }>();
    expect(pending!.requested_revision).toBeGreaterThan(pending!.indexed_revision);
    expect(await indexItem(env, owner, saved.body.item.id)).toBe(true);
    const complete = await stmt(
      env.DB,
      'SELECT requested_revision,indexed_revision FROM index_requests WHERE item_id=?',
      saved.body.item.id
    ).first<{ requested_revision: number; indexed_revision: number }>();
    expect(complete!.indexed_revision).toBe(complete!.requested_revision);
    const expected = (await stmt(
      env.DB,
      'SELECT COUNT(*) AS n FROM search_documents WHERE owner_id=?',
      owner
    ).first<{ n: number }>())!.n;
    const indexed = (await stmt(
      env.DB,
      'SELECT COUNT(*) AS n FROM indexed_documents WHERE item_id=?',
      saved.body.item.id
    ).first<{ n: number }>())!.n;
    expect(indexed).toBe(expected);
    expect(indexed).toBeGreaterThan(100);
  });
});

it('keeps large-library vector filters within the provider byte limit without losing eligible items', () => {
  const ids = Array.from({ length: 444 }, (_, i) => `itm_${String(i).padStart(40, '0')}`);
  const pages = vectorFilterPages(ids);
  expect(pages.flat()).toEqual(ids);
  expect(pages.length).toBeGreaterThan(1);
  for (const page of pages)
    expect(new TextEncoder().encode(JSON.stringify({ itemId: { $in: page } })).length).toBeLessThan(
      2048
    );
});
