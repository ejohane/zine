import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { save, saveSchema, getItem, deleteItem, updateProgress } from '../src/items';
import { contribute } from '../src/enrichment';
import { reconcileVerifiedIdentity } from '../src/reconciliation';
import { addRelationship, relationshipSchema, listRelationships } from '../src/relationships';
import { eraseAccountData, exportSection } from '../src/portability';
import { stmt } from '../src/lib';
import type { Env } from '../src/types';

describe('verified private identity reconciliation with stable public item IDs', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let env: Env;
  const redirects = new Map<string, string>();
  const principal = (owner: string) => ({ userId: owner, contributor: 'test-reconciliation' });
  beforeAll(async () => {
    runtime = await runtimeHarness({
      bindings: { X_BEARER_TOKEN: 'synthetic-provider-token' },
      outbound: (request) => {
        const url = new URL(request.url);
        if (url.hostname === 'cloudflare-dns.com')
          return Response.json({
            Status: 0,
            Answer:
              url.searchParams.get('type') === 'AAAA' ? [] : [{ type: 1, data: '93.184.216.34' }],
          });
        if (url.hostname === 'api.x.com' && url.pathname.startsWith('/2/users/'))
          return Response.json({
            data: {
              id: '424242',
              name: 'Synthetic account',
              username: 'current_handle',
              description: 'Verified account metadata',
            },
          });
        if (url.hostname === 'www.youtube.com')
          return new Response(
            '<html><head><meta property="og:title" content="Synthetic channel"></head><body><script>var ytInitialData = {"metadata":{"channelMetadataRenderer":{"title":"Synthetic channel","externalId":"UCsyntheticchannel","description":"Source channel data"}}};</script></body></html>',
            { headers: { 'content-type': 'text/html' } }
          );
        const target = redirects.get(request.url);
        if (target) return new Response(null, { status: 301, headers: { location: target } });
        if (!['short.example', 'canonical.example'].includes(url.hostname))
          throw new Error('Unexpected synthetic upstream');
        if (request.method === 'HEAD')
          return new Response(null, {
            headers: { 'content-length': '4000000', 'content-type': 'text/html' },
          });
        return new Response(
          `<html><head><title>The same title is not identity evidence</title></head><body><article><h1>The same title is not identity evidence</h1><p>${'Retained source text supports reading and understanding without equating unrelated publications. '.repeat(20)}</p></article></body></html>`,
          { headers: { 'content-type': 'text/html' } }
        );
      },
    });
    env = {
      DB: runtime.db as unknown as D1Database,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
    } as Env;
  });
  afterAll(async () => runtime?.close());
  async function capture(owner: string, url: string, text: string, key?: string) {
    return save(
      env,
      principal(owner),
      saveSchema.parse({ url, context: { text }, tags: [text] }),
      key
    );
  }
  async function request(owner: string, path: string, method = 'GET', body?: unknown) {
    const response = await runtime.mf.dispatchFetch(`http://localhost/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await runtime.token(owner)}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      headers: response.headers,
      body: response.status === 204 ? null : JSON.parse(await response.text()),
    };
  }
  it('unions personal material and provenance, retains conflicting observations, and resolves old IDs in HTTP reads, writes, filters and references', async () => {
    const owner = 'merge-state';
    const sourceUrl = 'https://short.example/state';
    const targetUrl = 'https://canonical.example/state';
    redirects.set(sourceUrl, targetUrl);
    const a = (await capture(owner, sourceUrl, 'source-context', 'source-receipt')).body.item.id;
    const b = (await capture(owner, targetUrl, 'target-context', 'target-receipt')).body.item.id;
    await updateProgress(env, principal(owner), a, { position: 12, unit: 'seconds' });
    await updateProgress(env, principal(owner), b, {
      position: 24,
      unit: 'seconds',
      completed: true,
    });
    const material = await contribute(env, principal(owner), a, {
      field: 'article',
      value: { text: 'A retained private article from the source identity. '.repeat(600) },
      category: 'source',
      provenance: { method: 'source-material', inputContributionIds: [] },
    });
    const collection = await request(owner, '/collections', 'POST', { name: 'Merge research' });
    expect(collection.status).toBe(201);
    await request(owner, `/collections/${collection.body.id}/items/${a}`, 'PUT', { position: 3 });
    await request(owner, `/collections/${collection.body.id}/items/${b}`, 'PUT', { position: 8 });
    const annotation = await request(owner, `/items/${a}/annotations`, 'POST', {
      kind: 'note',
      text: 'Preserve this annotation',
    });
    expect(annotation.status).toBe(201);
    await addRelationship(
      env,
      principal(owner),
      a,
      relationshipSchema.parse({
        kind: 'same_work',
        targetItemId: b,
        provenance: { method: 'earlier-edition-link' },
      })
    );
    const result = await request(owner, `/items/${a}/reconcile`, 'POST', { targetItemId: b });
    expect(result.status).toBe(200);
    expect(result.body.outcome).toBe('merged');
    expect(result.body.canonicalItemId).toBe(b);
    const item = await getItem(env, owner, a, ['article']);
    expect(item.id).toBe(b);
    expect(item.context.map((c) => c.text).sort()).toEqual(['source-context', 'target-context']);
    expect(item.tags.sort()).toEqual(['source-context', 'target-context']);
    expect(item.progress).toMatchObject({ position: 24, completedAt: expect.any(String) });
    expect((item.content.article as { text: string }).text).toBe(
      'A retained private article from the source identity. '.repeat(600)
    );
    expect(item.enrichment.fields.article).toMatchObject({ contributionId: material.id });
    const receipt = await request(owner, `/items/${a}/reconciliations`);
    expect(receipt.body.events).toHaveLength(1);
    expect(receipt.body.events[0].state.progress.source.position).toBe(12);
    expect(receipt.body.events[0].state.progress.target.position).toBe(24);
    expect(receipt.body.events[0].state.collapsedRelationships).toHaveLength(1);
    expect(receipt.body.events[0].state.collectionPositionConflicts).toEqual([
      { collectionId: collection.body.id, source: 3, target: 8, resolution: 'target' },
    ]);
    expect((await listRelationships(env, owner, b)).relationships).toEqual([]);
    const read = await request(owner, `/items/${a}`);
    expect(read.status).toBe(200);
    expect(read.body.id).toBe(b);
    expect(read.headers.get('x-zine-canonical-item')).toBe(b);
    expect(
      (await request(owner, `/items/${a}/progress`, 'PATCH', { position: 32, unit: 'seconds' }))
        .status
    ).toBe(200);
    expect((await getItem(env, owner, b)).progress.position).toBe(32);
    const annotations = await request(owner, `/items/${a}/annotations`);
    expect(annotations.body.annotations[0].id).toBe(annotation.body.id);
    expect(
      (
        await request(owner, `/items/${a}/annotations/${annotation.body.id}`, 'PATCH', {
          kind: 'note',
          text: 'Edited through old ID',
        })
      ).status
    ).toBe(200);
    const filtered = await request(owner, `/items?url=${encodeURIComponent(sourceUrl)}`);
    expect(filtered.body.items.map((i: { id: string }) => i.id)).toEqual([b]);
    const note = await request(owner, `/collections/${collection.body.id}/notes`, 'POST', {
      text: 'A reference through an alias',
      itemIds: [a],
    });
    expect(note.status).toBe(201);
    expect(note.body.itemIds).toEqual([b]);
    const replay = await capture(owner, sourceUrl, 'source-context', 'source-receipt');
    expect(replay.replayed).toBe(true);
    expect(replay.body.item.id).toBe(a);
    const explicit = await capture(owner, sourceUrl, 'later-context', 'later-receipt');
    expect(explicit.body.item.id).toBe(b);
    expect((await getItem(env, owner, b)).context).toHaveLength(3);
    expect((await exportSection(env, owner, 'aliases', '', 10)).records).toHaveLength(1);
    expect((await exportSection(env, owner, 'reconciliations', '', 10)).records).toHaveLength(1);
    const other = 'merge-state-other';
    await capture(other, targetUrl, 'other-owner');
    expect((await request(other, `/items/${a}`)).status).toBe(404);
    expect((await request(other, `/items/${b}/reconciliations`)).status).toBe(404);
  });
  it('does not merge similar titles or arbitrary caller claims without a verified redirect', async () => {
    const owner = 'merge-conservative';
    const a = (await capture(owner, 'https://short.example/no-redirect', 'source')).body.item.id;
    const b = (await capture(owner, 'https://canonical.example/another', 'target')).body.item.id;
    const result = await request(owner, `/items/${a}/reconcile`, 'POST', { targetItemId: b });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('identity_not_established');
    expect((await getItem(env, owner, a)).id).toBe(a);
    expect((await getItem(env, owner, b)).id).toBe(b);
    const unchanged = await request(owner, `/items/${a}/reconcile`, 'POST', {});
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.outcome).toBe('unchanged');
  });
  it('preserves deletion suppression, tombstones every old receipt, and permits a fresh intentional save through an alias', async () => {
    const owner = 'merge-suppression';
    const sourceUrl = 'https://short.example/deleted';
    const targetUrl = 'https://canonical.example/deleted';
    const b = (await capture(owner, targetUrl, 'old-target', 'deleted-target-receipt')).body.item
      .id;
    const a = (await capture(owner, sourceUrl, 'old-source', 'deleted-source-receipt')).body.item
      .id;
    await deleteItem(env, owner, b);
    const result = await reconcileVerifiedIdentity(env, principal(owner), a, targetUrl);
    expect(result.outcome).toBe('suppressed');
    await expect(getItem(env, owner, a)).rejects.toMatchObject({ status: 404 });
    expect((await exportSection(env, owner, 'reconciliations', '', 10)).records).toEqual([]);
    expect((await capture(owner, sourceUrl, 'old-source', 'deleted-source-receipt')).status).toBe(
      410
    );
    const fresh = await capture(owner, sourceUrl, 'fresh-state', 'fresh-alias-receipt');
    expect(fresh.status).toBe(201);
    expect(fresh.body.item.id).toBe(b);
    expect((await getItem(env, owner, a)).context.map((c) => c.text)).toEqual(['fresh-state']);
    await deleteItem(env, owner, a);
    expect((await capture(owner, sourceUrl, 'fresh-state', 'fresh-alias-receipt')).status).toBe(
      410
    );
    const hidden = await request(owner, `/items/${a}`);
    expect(hidden.status).toBe(404);
    expect(hidden.headers.get('x-request-id')).toBe(hidden.body.error.requestId);
  });
  it('carries a newer explicit save across an old deletion and fences the deleted target generation', async () => {
    const owner = 'merge-revival';
    const targetUrl = 'https://canonical.example/revive';
    const b = (await capture(owner, targetUrl, 'old')).body.item.id;
    await deleteItem(env, owner, b);
    const a = (await capture(owner, 'https://short.example/revive', 'new-explicit-intent')).body
      .item.id;
    const result = await reconcileVerifiedIdentity(env, principal(owner), a, targetUrl);
    expect(result.outcome).toBe('merged');
    const item = await getItem(env, owner, b);
    expect(item.context.map((c) => c.text)).toEqual(['new-explicit-intent']);
    expect(item.progress.position).toBeNull();
    expect(
      (await stmt(env.DB, 'SELECT generation FROM personal_items WHERE id=?', b).first<{
        generation: number;
      }>())!.generation
    ).toBe(1);
  });
  it('serializes concurrent merges and captures without losing a successful explicit context', async () => {
    const owner = 'merge-concurrent';
    const sourceUrl = 'https://short.example/concurrent';
    const targetUrl = 'https://canonical.example/concurrent';
    const a = (await capture(owner, sourceUrl, 'first')).body.item.id;
    const b = (await capture(owner, targetUrl, 'second')).body.item.id;
    const results = await Promise.all([
      reconcileVerifiedIdentity(env, principal(owner), a, targetUrl),
      reconcileVerifiedIdentity(env, principal(owner), a, targetUrl),
      capture(owner, sourceUrl, 'concurrent-context', 'merge-concurrent-save'),
    ]);
    expect(results).toHaveLength(3);
    expect((await getItem(env, owner, b)).context.map((c) => c.text).sort()).toEqual([
      'concurrent-context',
      'first',
      'second',
    ]);
    expect(
      (await stmt(
        env.DB,
        "SELECT COUNT(*) AS n FROM personal_items WHERE owner_id=? AND status='saved'",
        owner
      ).first<{ n: number }>())!.n
    ).toBe(1);
    expect((await exportSection(env, owner, 'reconciliations', '', 10)).records).toHaveLength(1);
  });
  it('rejects a merge crossing account erasure instead of recreating erased state', async () => {
    const owner = 'merge-erasure';
    const a = (await capture(owner, 'https://short.example/erasure', 'source')).body.item.id;
    await capture(owner, 'https://canonical.example/erasure', 'target');
    let release!: () => void;
    let started!: () => void;
    const paused = new Promise<void>((r) => (release = r));
    const entered = new Promise<void>((r) => (started = r));
    const real = env.DB;
    const delayed = {
      ...env,
      DB: new Proxy(real, {
        get(target, key) {
          if (key === 'batch')
            return async (statements: D1PreparedStatement[]) => {
              started();
              await paused;
              return target.batch(statements);
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    };
    const pending = reconcileVerifiedIdentity(
      delayed,
      principal(owner),
      a,
      'https://canonical.example/erasure'
    );
    await entered;
    await eraseAccountData(env, owner);
    release();
    await expect(pending).rejects.toMatchObject({ code: 'account_data_erased' });
    expect(
      (await stmt(
        env.DB,
        'SELECT COUNT(*) AS n FROM personal_items WHERE owner_id=?',
        owner
      ).first<{ n: number }>())!.n
    ).toBe(0);
    expect((await exportSection(env, owner, 'aliases', '', 10)).records).toEqual([]);
  });
  it('keeps immutable platform editions separate and resolves mutable handles only through verified provider identifiers', async () => {
    const owner = 'merge-provider-identifiers';
    const video = (await capture(owner, 'https://youtu.be/abcdef12345', 'video-edition')).body.item
      .id;
    const episode = (
      await capture(
        owner,
        'https://open.spotify.com/episode/1234567890123456789012',
        'audio-edition'
      )
    ).body.item.id;
    await expect(
      reconcileVerifiedIdentity(env, principal(owner), episode, 'https://youtu.be/abcdef12345')
    ).rejects.toMatchObject({ code: 'different_platform_identity' });
    expect((await getItem(env, owner, episode)).id).toBe(episode);
    expect((await getItem(env, owner, video)).id).toBe(video);
    const handle = (await capture(owner, 'https://x.com/alias_handle', 'profile-context')).body.item
      .id;
    const profile = (await capture(owner, 'https://x.com/i/user/424242', 'profile-id-context')).body
      .item.id;
    const x = await request(owner, `/items/${handle}/reconcile`, 'POST', { targetItemId: profile });
    expect(x.status).toBe(200);
    expect(x.body.canonicalItemId).toBe(profile);
    expect(
      (await request(owner, `/items/${handle}/reconciliations`)).body.events[0].evidence.method
    ).toBe('platform-identifier');
    const youtube = (await capture(owner, 'https://www.youtube.com/@synthetic', 'channel-handle'))
      .body.item.id;
    const channel = (
      await capture(owner, 'https://www.youtube.com/channel/UCsyntheticchannel', 'channel-id')
    ).body.item.id;
    const yt = await request(owner, `/items/${youtube}/reconcile`, 'POST', {
      targetItemId: channel,
    });
    expect(yt.status).toBe(200);
    expect(yt.body.canonicalItemId).toBe(channel);
  });
  it('flattens chained aliases while retaining historical receipts and every old save tombstone', async () => {
    const owner = 'merge-chain';
    const aUrl = 'https://short.example/chain-a',
      bUrl = 'https://canonical.example/chain-b',
      cUrl = 'https://canonical.example/chain-c';
    const a = (await capture(owner, aUrl, 'chain-a', 'receipt-chain-a')).body.item.id,
      b = (await capture(owner, bUrl, 'chain-b', 'receipt-chain-b')).body.item.id,
      c = (await capture(owner, cUrl, 'chain-c', 'receipt-chain-c')).body.item.id;
    await reconcileVerifiedIdentity(env, principal(owner), a, bUrl);
    await reconcileVerifiedIdentity(env, principal(owner), b, cUrl);
    expect((await getItem(env, owner, a)).id).toBe(c);
    expect((await getItem(env, owner, b)).id).toBe(c);
    const identity = await request(owner, `/items/${a}/identity`);
    expect(identity.body.aliases).toHaveLength(2);
    expect(identity.body.canonicalItemId).toBe(c);
    const receipts = await request(owner, `/items/${a}/reconciliations`);
    expect(receipts.body.events).toHaveLength(2);
    expect(receipts.body.events.every((e: { targetItemId: string }) => e.targetItemId === c)).toBe(
      true
    );
    const d = (await capture(owner, 'https://canonical.example/chain-observer', 'observer')).body
      .item.id;
    await addRelationship(
      env,
      principal(owner),
      d,
      relationshipSchema.parse({
        kind: 'references',
        targetUrl: aUrl,
        provenance: { method: 'alias-reference' },
      })
    );
    expect((await listRelationships(env, owner, d)).relationships[0].target.itemId).toBe(c);
    await deleteItem(env, owner, a);
    expect((await exportSection(env, owner, 'reconciliations', '', 10)).records).toHaveLength(0);
    for (const [url, text, key] of [
      [aUrl, 'chain-a', 'receipt-chain-a'],
      [bUrl, 'chain-b', 'receipt-chain-b'],
      [cUrl, 'chain-c', 'receipt-chain-c'],
    ])
      expect((await capture(owner, url, text, key)).status).toBe(410);
  });
});
