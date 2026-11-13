import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import type { getHome } from '../src/home';
import { responseContract } from '../src/openapi';

describe('personal Home editorial', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  beforeAll(async () => {
    runtime = await runtimeHarness();
  });
  afterAll(async () => runtime?.close());

  type FixtureBody = Awaited<ReturnType<typeof getHome>> & {
    item: { id: string };
    token: string;
    records: { sections: { collections: unknown[] } }[];
  };

  async function call(token: string, path: string, method = 'GET', body?: unknown) {
    const response = await runtime.mf.dispatchFetch(`http://localhost/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (response.status === 204 ? null : await response.json()) as FixtureBody,
    };
  }

  async function saveItems(token: string, prefix: string, count: number) {
    const ids = [];
    for (let index = 0; index < count; index++) {
      const saved = await call(token, '/saves', 'POST', {
        url: `https://example.com/${prefix}-${index}`,
      });
      expect(saved.status).toBe(201);
      const id = saved.body.item.id as string;
      ids.push(id);
      await runtime.db
        .prepare('UPDATE personal_items SET saved_at=? WHERE id=?')
        .bind(new Date(Date.UTC(2026, 10, index + 1)).toISOString(), id)
        .run();
    }
    return ids;
  }

  it('previews without publication, then removes completed cards from the live edition', async () => {
    const token = await runtime.token('home-owner');
    const saves = await saveItems(token, 'editorial', 10);
    expect(
      (
        await call(token, `/items/${saves[0]}/progress`, 'PATCH', {
          position: 0.4,
          unit: 'fraction',
        })
      ).status
    ).toBe(200);
    const draft = {
      leadBeforeRecent: true,
      collections: [
        { title: 'The first collection', itemIds: saves.slice(1, 4) },
        { title: 'The smaller collection', itemIds: [saves[4], saves[8]] },
      ],
    };
    const preview = await call(token, '/home/preview', 'POST', draft);
    expect(preview.status).toBe(200);
    expect(preview.body.sections.map(({ kind }: { kind: string }) => kind)).toEqual([
      'resume',
      'collection',
      'recent',
    ]);
    expect((await call(token, '/home')).body.editionId).toBeNull();

    const published = await call(token, '/home/edition', 'PUT', { draft, expectedEditionId: null });
    expect(published.status).toBe(200);
    const initial = (await call(token, '/home')).body;
    expect(responseContract('GET', '/v1/home', 200)?.safeParse(initial).success).toBe(true);
    expect(initial.sections[1].cards.map(({ id }: { id: string }) => id)).toEqual(
      saves.slice(1, 4)
    );
    for (const itemId of [saves[0], saves[2], saves[9]]) {
      expect(
        (await call(token, `/items/${itemId}/progress`, 'PATCH', { completed: true })).status
      ).toBe(200);
    }
    const current = (await call(token, '/home')).body;
    expect(current.editionId).toBe(published.body.editionId);
    expect(current.generatedAt).toBe(initial.generatedAt);
    expect(current.sections.map(({ kind }: { kind: string }) => kind)).toEqual([
      'collection',
      'recent',
    ]);
    expect(current.sections[0].id).toBe(initial.sections[1].id);
    expect(current.sections[0].cards.map(({ id }: { id: string }) => id)).toEqual([
      saves[1],
      saves[3],
    ]);
    expect(current.sections[1].cards.map(({ id }: { id: string }) => id)).toEqual(
      saves.slice(4, 9).reverse()
    );
    expect(
      await call(token, '/home/edition', 'PUT', { draft, expectedEditionId: current.editionId })
    ).toMatchObject({ status: 409, body: { error: { code: 'home_edition_changed' } } });
    expect((await call(token, '/home')).body.editionId).toBe(current.editionId);
    expect((await call(token, `/items/${saves[1]}`, 'DELETE')).status).toBe(204);
    const exported = await call(token, '/export/homeEdition');
    expect(exported.body.records[0].sections.collections).toEqual([draft.collections[1]]);
  });

  it('isolates ownership, scopes, conflicting publishers, and account erasure', async () => {
    const token = await runtime.token('home-publisher');
    const other = await runtime.token('home-other');
    const saves = await saveItems(token, 'publisher', 2);
    const draft = {
      leadBeforeRecent: false,
      collections: [{ title: 'A pairing', itemIds: saves }],
    };
    const initial = { draft, expectedEditionId: null };
    const foreign = await call(other, '/home/edition', 'PUT', initial);
    expect(foreign.status).toBe(409);
    expect((await call(other, '/home/preview', 'POST', draft)).body.sections).toEqual([]);
    const results = await Promise.all([
      call(token, '/home/edition', 'PUT', initial),
      call(token, '/home/edition', 'PUT', initial),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);

    const read = await call(token, '/tokens', 'POST', { name: 'Home read' });
    expect((await call(read.body.token, '/home')).status).toBe(200);
    expect((await call(read.body.token, '/home/preview', 'POST', draft)).status).toBe(200);
    expect((await call(read.body.token, '/home/edition', 'PUT', initial)).status).toBe(403);
    expect((await call(token, '/account/data', 'DELETE')).status).toBe(200);
    expect((await call(token, '/home')).body).toEqual({
      editionId: null,
      generatedAt: null,
      sections: [],
    });
  });
});
