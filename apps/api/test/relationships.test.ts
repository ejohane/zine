import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { save, saveSchema, deleteItem } from '../src/items';
import { addRelationship, relationshipSchema, listRelationships } from '../src/relationships';
import { contribute } from '../src/enrichment';
import { eraseAccountData, exportSection } from '../src/portability';
import { stmt } from '../src/lib';
import type { Env } from '../src/types';

describe('private content relationships independent of saving and identity merging', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let env: Env;
  beforeAll(async () => {
    runtime = await runtimeHarness();
    env = {
      DB: runtime.db as unknown as D1Database,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
    } as Env;
  });
  afterAll(async () => runtime?.close());
  const principal = (owner: string) => ({ userId: owner, contributor: 'test-agent' });
  const capture = async (owner: string, url: string) =>
    (await save(env, principal(owner), saveSchema.parse({ url }))).body.item.id;
  it('retains separate editions, exposes incoming/outgoing edges, and references unsaved context without creating library items', async () => {
    const owner = 'relationship-editions';
    const a = await capture(owner, 'https://example.com/podcast-edition');
    const b = await capture(owner, 'https://youtu.be/abcdef12345');
    const body = relationshipSchema.parse({
      kind: 'same_work',
      targetItemId: b,
      provenance: { method: 'explicit-link' },
    });
    const first = await addRelationship(env, principal(owner), a, body);
    const replay = await addRelationship(env, principal(owner), a, body);
    expect(replay.id).toBe(first.id);
    expect(replay.created).toBe(false);
    const incoming = await listRelationships(env, owner, b);
    expect(incoming.relationships[0]).toMatchObject({
      id: first.id,
      direction: 'incoming',
      source: { itemId: a },
      target: { itemId: b },
    });
    const externalUrl = 'https://example.net/unsaved-context';
    await addRelationship(
      env,
      principal(owner),
      a,
      relationshipSchema.parse({
        kind: 'references',
        targetUrl: externalUrl,
        provenance: { method: 'agent-analysis' },
      })
    );
    const page = await listRelationships(env, owner, a, 1);
    expect(page.nextCursor).toBeTruthy();
    const next = await listRelationships(env, owner, a, 1, page.nextCursor!);
    expect(new Set([...page.relationships, ...next.relationships].map((r) => r.id)).size).toBe(2);
    expect(
      (await stmt(
        env.DB,
        'SELECT COUNT(*) AS n FROM personal_items WHERE owner_id=?',
        owner
      ).first<{ n: number }>())!.n
    ).toBe(2);
    const all = await listRelationships(env, owner, a);
    expect(all.relationships.find((r) => r.kind === 'references')!.target.itemId).toBeNull();
    const later = await capture(owner, externalUrl);
    expect(
      (await listRelationships(env, owner, a)).relationships.find((r) => r.kind === 'references')!
        .target.itemId
    ).toBe(later);
    await expect(listRelationships(env, owner, b, 1, page.nextCursor!)).rejects.toMatchObject({
      code: 'invalid_cursor',
    });
    await expect(
      addRelationship(
        env,
        principal(owner),
        a,
        relationshipSchema.parse({
          kind: 'related',
          targetItemId: a,
          provenance: { method: 'self' },
        })
      )
    ).rejects.toMatchObject({ code: 'self_relationship' });
    expect((await exportSection(env, owner, 'relationships', '', 10)).records).toHaveLength(2);
    await deleteItem(env, owner, b);
    expect((await listRelationships(env, owner, a)).relationships).toHaveLength(1);
  });
  it('rejects foreign owners and private input provenance, and erases both saved and unsaved relationship data', async () => {
    const a = 'relationship-private-a',
      b = 'relationship-private-b';
    const one = await capture(a, 'https://example.com/relationship-shared');
    const two = await capture(b, 'https://example.com/relationship-shared');
    const foreign = await contribute(env, principal(b), two, {
      field: 'description',
      value: 'Private source material',
      category: 'source',
      provenance: { method: 'private', inputContributionIds: [] },
    });
    await expect(
      addRelationship(
        env,
        principal(a),
        one,
        relationshipSchema.parse({
          kind: 'related',
          targetItemId: two,
          provenance: { method: 'foreign-target' },
        })
      )
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      addRelationship(
        env,
        principal(a),
        one,
        relationshipSchema.parse({
          kind: 'related',
          targetUrl: 'https://example.com/external-target',
          provenance: { method: 'foreign-input', inputContributionIds: [foreign.id] },
        })
      )
    ).rejects.toMatchObject({ status: 404 });
    await addRelationship(
      env,
      principal(a),
      one,
      relationshipSchema.parse({
        kind: 'related',
        targetUrl: 'https://example.com/relationship-context-only-a',
        provenance: { method: 'private-connection' },
      })
    );
    expect((await listRelationships(env, b, two)).relationships).toEqual([]);
    await expect(listRelationships(env, b, one)).rejects.toMatchObject({ status: 404 });
    await eraseAccountData(env, a);
    expect(
      (await stmt(
        env.DB,
        'SELECT COUNT(*) AS n FROM item_relationships WHERE owner_id=?',
        a
      ).first<{ n: number }>())!.n
    ).toBe(0);
    expect(
      await stmt(
        env.DB,
        "SELECT id FROM content_items WHERE canonical_url='https://example.com/relationship-context-only-a'"
      ).first()
    ).toBeNull();
    expect(
      await stmt(env.DB, 'SELECT id FROM personal_items WHERE id=?', two).first()
    ).toBeTruthy();
  });
  it('supports authenticated relationship CRUD while preserving contributor boundaries', async () => {
    const owner = 'relationship-http';
    const a = await capture(owner, 'https://example.com/relation-http-a');
    const b = await capture(owner, 'https://example.com/relation-http-b');
    const token = await runtime.token(owner);
    async function request(path: string, method = 'GET', body?: unknown) {
      const r = await runtime.mf.dispatchFetch(`http://localhost/v1${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: r.status,
        body:
          r.status === 204 ? null : ((await r.json()) as { id: string; relationships: unknown[] }),
      };
    }
    const external = await addRelationship(
      env,
      principal(owner),
      a,
      relationshipSchema.parse({
        kind: 'related',
        targetItemId: b,
        provenance: { method: 'external-agent' },
      })
    );
    expect(
      (
        await request(`/items/${a}/relationships/${external.id}`, 'PATCH', {
          provenance: { method: 'overwrite-another-contributor' },
        })
      ).status
    ).toBe(403);
    const created = await request(`/items/${a}/relationships`, 'POST', {
      kind: 'same_work',
      targetItemId: b,
      provenance: { method: 'user-choice' },
    });
    expect(created.status).toBe(201);
    expect(
      (
        await request(`/items/${a}/relationships/${created.body!.id}`, 'PATCH', {
          provenance: { method: 'user-choice', description: 'Verified alternate edition' },
        })
      ).status
    ).toBe(200);
    const read = await request(`/items/${b}/relationships?direction=incoming`);
    expect(read.status).toBe(200);
    expect(read.body!.relationships).toHaveLength(2);
    expect((await request(`/items/${a}/relationships/${created.body!.id}`, 'DELETE')).status).toBe(
      204
    );
    expect((await request(`/items/${a}/relationships/${external.id}`, 'DELETE')).status).toBe(204);
    expect((await request(`/items/${a}/relationships`)).body!.relationships).toEqual([]);
  });
});
