import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { ingestEntry, syncSubscription } from '../src/subscriptions';
import { save, saveSchema, patchItem, deleteItem, getItem } from '../src/items';
import { dispatchOutbox, runJob } from '../src/jobs';
import { now, id, stmt } from '../src/lib';
import { contribute } from '../src/enrichment';
import { acquireBudget, releaseBudget } from '../src/budgets';
import type { Env } from '../src/types';
import type { SubscriptionRow } from '../src/subscriptions';
import type { FeedEntry } from '../src/providers/feed';

describe('automatic arrival and durable jobs', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let env: Env;
  let owner: string;
  const entry = (): FeedEntry => ({
    id: crypto.randomUUID(),
    url: `https://example.com/${crypto.randomUUID()}`,
    title: 'Episode',
    kind: 'podcast_episode',
    enclosures: [],
    transcripts: [],
  });
  async function subscription(autoSave: boolean) {
    const subscriptionId = id('sub');
    const sourceId = id('src');
    const routeId = id('route');
    const timestamp = now();
    await env.DB.batch([
      stmt(
        env.DB,
        'INSERT INTO sources(id,owner_id,identity_key,platform,url,created_at) VALUES(?,?,?,?,?,?)',
        sourceId,
        owner,
        sourceId,
        'rss',
        'https://example.com/feed',
        timestamp
      ),
      stmt(
        env.DB,
        'INSERT INTO source_routes(id,source_id,url,kind) VALUES(?,?,?,?)',
        routeId,
        sourceId,
        'https://example.com/feed',
        'feed'
      ),
      stmt(
        env.DB,
        "INSERT INTO subscriptions(id,owner_id,source_id,route_id,auto_save,filters_json,status,next_poll_at,created_at,updated_at) VALUES(?,?,?,?,?,'{}','active',?,?,?)",
        subscriptionId,
        owner,
        sourceId,
        routeId,
        autoSave ? 1 : 0,
        timestamp,
        timestamp,
        timestamp
      ),
    ]);
    return (await stmt(
      env.DB,
      'SELECT * FROM subscriptions WHERE id=?',
      subscriptionId
    ).first<SubscriptionRow>())!;
  }
  beforeAll(async () => {
    runtime = await runtimeHarness();
    env = {
      DB: runtime.db as unknown as D1Database,
      ARTIFACTS: (await runtime.mf.getR2Bucket('ARTIFACTS')) as unknown as R2Bucket,
      JOBS: {
        send: async () => {
          throw new Error('Simulated queue outage');
        },
      } as unknown as Queue,
      ENVIRONMENT: 'test',
      AUTH_ISSUER: 'test',
      AUTH_AUDIENCE: 'test',
      ALLOWED_ORIGINS: '',
      EMBEDDING_MODEL: '',
    };
  });
  beforeEach(() => {
    owner = `user_${crypto.randomUUID()}`;
  });
  afterAll(async () => runtime?.close());

  it('receives once, preserves undecided triage even through an auto-save subscription', async () => {
    const a = await subscription(false);
    const b = await subscription(true);
    const item = entry();
    const first = await ingestEntry(env, a, item);
    expect(first.created).toBe(true);
    expect((await getItem(env, owner, first.itemId)).status).toBe('received');
    const again = await ingestEntry(env, a, item);
    expect(again.created).toBe(false);
    await ingestEntry(env, b, item);
    const personal = await getItem(env, owner, first.itemId);
    expect(personal.status).toBe('received');
    expect(personal.occurrences).toHaveLength(2);
    expect(
      (
        await env.DB.prepare('SELECT COUNT(*) AS n FROM jobs WHERE item_id=?')
          .bind(first.itemId)
          .first<{ n: number }>()
      )?.n
    ).toBe(2); // Each route retains its own source observation.
  });

  it('preserves dismissal and archive on automatic arrival but explicit saves reactivate', async () => {
    const a = await subscription(false);
    const b = await subscription(true);
    const item = entry();
    const first = await ingestEntry(env, a, item);
    await patchItem(env, owner, first.itemId, { status: 'dismissed' });
    await ingestEntry(env, b, item);
    expect((await getItem(env, owner, first.itemId)).status).toBe('dismissed');
    const explicit = await save(
      env,
      { userId: owner, contributor: 'test' },
      saveSchema.parse({ url: item.url })
    );
    expect(explicit.body.save.outcome).toBe('reactivated');
    await patchItem(env, owner, first.itemId, { archived: true });
    const c = await subscription(true);
    await ingestEntry(env, c, item);
    expect((await getItem(env, owner, first.itemId)).archived).toBe(true);
  });

  it('retains deletion suppression without adding personal arrival data', async () => {
    const a = await subscription(true);
    const b = await subscription(true);
    const item = entry();
    const first = await ingestEntry(env, a, item);
    await deleteItem(env, owner, first.itemId);
    await ingestEntry(env, b, item);
    expect(
      (await stmt(env.DB, 'SELECT status FROM personal_items WHERE id=?', first.itemId).first())
        ?.status
    ).toBe('deleted');
    expect(
      (
        await stmt(
          env.DB,
          'SELECT COUNT(*) AS n FROM save_occurrences WHERE item_id=?',
          first.itemId
        ).first()
      )?.n
    ).toBe(0);
  });

  it('checkpoints subscription pages and selects only the latest matching initial item', async () => {
    const sub = await subscription(false);
    const old = { ...entry(), publishedAt: '2020-01-01T00:00:00.000Z' };
    const latest = { ...entry(), publishedAt: '2025-01-01T00:00:00.000Z' };
    const pages: (number | string | null)[] = [];
    const load: Parameters<typeof syncSubscription>[3] = async (_env, _route, page) => {
      pages.push(page);
      return {
        title: 'source',
        url: 'https://example.com/feed',
        entries: page === null ? [old] : [latest],
        nextOffset: page === null ? 50 : null,
      };
    };
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      received: 0,
      status: 'continuing',
    });
    expect(
      (await stmt(env.DB, 'SELECT initialized FROM subscriptions WHERE id=?', sub.id).first())
        ?.initialized
    ).toBe(0);
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      received: 1,
      status: 'active',
    });
    expect(pages).toEqual([null, 50]);
    const received = await env.DB.prepare(
      "SELECT id FROM personal_items WHERE owner_id=? AND status='received'"
    )
      .bind(owner)
      .all<{ id: string }>();
    expect(received.results).toHaveLength(1);
    expect((await getItem(env, owner, received.results[0].id)).content.url).toBe(latest.url);
    // Once initialized, unobserved old history must not become a new arrival.
    const historic = { ...entry(), publishedAt: '2019-01-01T00:00:00.000Z' };
    const fresh = { ...entry(), publishedAt: new Date(Date.now() + 10000).toISOString() };
    const next: Parameters<typeof syncSubscription>[3] = async (_env, _route, page) => ({
      title: 'source',
      url: 'https://example.com/feed',
      entries: page === null ? [fresh] : [historic],
      nextOffset: page === null ? 50 : null,
    });
    expect(await syncSubscription(env, sub.id, owner, next)).toMatchObject({
      received: 1,
      status: 'continuing',
    });
    expect(await syncSubscription(env, sub.id, owner, next)).toMatchObject({
      received: 0,
      status: 'active',
    });
    expect(
      (
        await env.DB.prepare('SELECT COUNT(*) AS n FROM personal_items WHERE owner_id=?')
          .bind(owner)
          .first<{ n: number }>()
      )?.n
    ).toBe(2);
  });

  it('retains arrivals since creation across a delayed first poll plus the latest preceding match', async () => {
    const sub = await subscription(false);
    const cutoff = new Date(Date.now() - 3600000).toISOString();
    await stmt(env.DB, 'UPDATE subscriptions SET created_at=? WHERE id=?', cutoff, sub.id).run();
    const old = { ...entry(), publishedAt: new Date(Date.now() - 7200000).toISOString() };
    const baseline = { ...entry(), publishedAt: new Date(Date.now() - 5400000).toISOString() };
    const arrivals = [1800000, 900000].map((age) => ({
      ...entry(),
      publishedAt: new Date(Date.now() - age).toISOString(),
    }));
    let pages = 0;
    const load: Parameters<typeof syncSubscription>[3] = async (_env, _route, page) => {
      pages++;
      return {
        title: 'source',
        url: 'https://example.com/feed',
        entries: page === null ? arrivals : [baseline, old],
        nextOffset: page === null ? 1 : null,
        newestFirst: true,
      };
    };
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      received: 2,
      status: 'continuing',
    });
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      received: 1,
      status: 'active',
    });
    expect(pages).toBe(2);
    const rows = await env.DB.prepare(
      'SELECT c.canonical_url FROM personal_items p JOIN content_items c ON c.id=p.content_id WHERE p.owner_id=?'
    )
      .bind(owner)
      .all<{ canonical_url: string }>();
    expect(rows.results.map((row) => row.canonical_url).sort()).toEqual(
      [...arrivals.map((item) => item.url), baseline.url].sort()
    );
  });

  it('bounds arrivals from a delayed initial poll and resumes without losing the preceding baseline', async () => {
    const sub = await subscription(false);
    const cutoff = new Date(Date.now() - 3600000).toISOString();
    await stmt(env.DB, 'UPDATE subscriptions SET created_at=? WHERE id=?', cutoff, sub.id).run();
    const arrivals = Array.from({ length: 45 }, () => ({
      ...entry(),
      publishedAt: new Date(Date.now() - 60000).toISOString(),
    }));
    const baseline = { ...entry(), publishedAt: new Date(Date.now() - 7200000).toISOString() };
    let fetches = 0;
    const load: Parameters<typeof syncSubscription>[3] = async () => {
      fetches++;
      return {
        title: 'source',
        url: 'https://example.com/feed',
        entries: [...arrivals, baseline],
        newestFirst: true,
      };
    };
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      received: 20,
      status: 'continuing',
    });
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      received: 20,
      status: 'continuing',
    });
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      received: 6,
      status: 'active',
    });
    expect(fetches).toBe(1);
    expect(
      (await stmt(
        env.DB,
        'SELECT COUNT(*) AS n FROM personal_items WHERE owner_id=?',
        owner
      ).first<{ n: number }>())!.n
    ).toBe(46);
  });

  it('resumes a large immutable feed snapshot without refetching or skipping entries', async () => {
    const sub = await subscription(true);
    const entries = Array.from({ length: 45 }, (_, i) => ({
      ...entry(),
      publishedAt: new Date(Date.now() - 60000 + i * 1000).toISOString(),
    }));
    let fetches = 0;
    const load: Parameters<typeof syncSubscription>[3] = async () => {
      fetches++;
      return { title: 'source', url: 'https://example.com/feed', entries };
    };
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      status: 'active',
      received: 1,
    });
    expect(fetches).toBe(1);
    const initial = await env.DB.prepare('SELECT id FROM personal_items WHERE owner_id=?')
      .bind(owner)
      .all<{ id: string }>();
    expect(initial.results).toHaveLength(1);
    expect((await getItem(env, owner, initial.results[0].id)).content.url).toBe(entries[44].url);
    const fresh = Array.from({ length: 45 }, () => ({
      ...entry(),
      publishedAt: new Date(Date.now() + 60000).toISOString(),
    }));
    const changed: Parameters<typeof syncSubscription>[3] = async () => {
      fetches++;
      return { title: 'source', url: 'https://example.com/feed', entries: fresh };
    };
    expect(await syncSubscription(env, sub.id, owner, changed)).toMatchObject({
      received: 20,
      status: 'continuing',
    });
    expect(await syncSubscription(env, sub.id, owner, changed)).toMatchObject({
      received: 20,
      status: 'continuing',
    });
    expect(await syncSubscription(env, sub.id, owner, changed)).toMatchObject({
      received: 5,
      status: 'active',
    });
    expect(fetches).toBe(2);
    expect(
      (
        await env.DB.prepare('SELECT COUNT(*) AS n FROM personal_items WHERE owner_id=?')
          .bind(owner)
          .first<{ n: number }>()
      )?.n
    ).toBe(46);
  });

  it('uses feed validators only after baseline completion and handles an unchanged feed', async () => {
    const sub = await subscription(false);
    let calls = 0;
    const load: Parameters<typeof syncSubscription>[3] = async (
      _env,
      _route,
      _page,
      _owner,
      headers
    ) => {
      calls++;
      if (calls === 1) {
        expect(headers).toEqual({});
        return {
          title: 'source',
          url: 'https://example.com/feed',
          entries: [entry()],
          etag: '"feed-version-1"',
          lastModified: 'Sun, 08 Nov 2026 00:00:00 GMT',
        };
      }
      expect(headers).toEqual({
        'if-none-match': '"feed-version-1"',
        'if-modified-since': 'Sun, 08 Nov 2026 00:00:00 GMT',
      });
      return { title: 'source', url: 'https://example.com/feed', entries: [], notModified: true };
    };
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      status: 'active',
      received: 1,
    });
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      status: 'not_modified',
      received: 0,
    });
    expect(
      await stmt(
        env.DB,
        'SELECT last_error_code,feed_etag FROM subscriptions WHERE id=?',
        sub.id
      ).first()
    ).toMatchObject({ last_error_code: null, feed_etag: '"feed-version-1"' });
  });

  it('rejects a pagination cycle across multiple pages instead of creating an endless continuation', async () => {
    const sub = await subscription(false);
    const load: Parameters<typeof syncSubscription>[3] = async (_env, _route, page) => ({
      title: 'cycle',
      url: 'https://example.com/feed',
      entries: [],
      nextCursor: page === null ? 'A' : page === 'A' ? 'B' : 'A',
    });
    for (let i = 0; i < 3; i++)
      expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
        status: 'continuing',
      });
    await expect(syncSubscription(env, sub.id, owner, load)).rejects.toMatchObject({
      code: 'source_pagination_cycle',
    });
  });

  it('starts reverse-chronological sources with the latest item and stops later polls at the known boundary', async () => {
    const sub = await subscription(false);
    const initial = { ...entry(), publishedAt: '2025-01-01T00:00:00.000Z' };
    let fetched = 0;
    const load: Parameters<typeof syncSubscription>[3] = async (_env, _route, page) => {
      expect(page).toBeNull();
      fetched++;
      return {
        title: 'ordered source',
        url: 'https://example.com/feed',
        entries: [initial],
        newestFirst: true,
        nextCursor: 'older-history',
      };
    };
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      status: 'active',
      received: 1,
    });
    const fresh = { ...entry(), publishedAt: new Date(Date.now() + 1000).toISOString() };
    const poll: Parameters<typeof syncSubscription>[3] = async (_env, _route, page) => {
      expect(page).toBeNull();
      return {
        title: 'ordered source',
        url: 'https://example.com/feed',
        entries: [fresh, initial],
        newestFirst: true,
        nextCursor: 'older-history',
      };
    };
    expect(await syncSubscription(env, sub.id, owner, poll)).toMatchObject({
      status: 'active',
      received: 1,
    });
    expect(fetched).toBe(1);
  });

  it('treats a newly added old playlist track as a future arrival and honors coarse publication dates', async () => {
    const sub = await subscription(true);
    await stmt(env.DB, 'UPDATE subscriptions SET initialized=1 WHERE id=?', sub.id).run();
    const oldTrack = {
      ...entry(),
      kind: 'track',
      publishedAt: '2019-01-01T00:00:00.000Z',
      eventAt: new Date(Date.now() + 1000).toISOString(),
    };
    const today = {
      ...entry(),
      publishedAt: `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
      publishedPrecision: 'day' as const,
    };
    const load: Parameters<typeof syncSubscription>[3] = async () => ({
      title: 'source',
      url: 'https://example.com/feed',
      entries: [oldTrack, today],
    });
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      received: 2,
      status: 'active',
    });
  });

  it('serializes subscription syncs and abandons a page after settings change', async () => {
    const sub = await subscription(false);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const load: Parameters<typeof syncSubscription>[3] = async () => {
      started();
      await gate;
      return { title: 'source', url: 'https://example.com/feed', entries: [entry()] };
    };
    const running = syncSubscription(env, sub.id, owner, load);
    await entered;
    expect(await syncSubscription(env, sub.id, owner, load)).toMatchObject({
      status: 'busy_or_unsubscribed',
    });
    await stmt(
      env.DB,
      "UPDATE subscriptions SET status='unsubscribed',revision=revision+1 WHERE id=?",
      sub.id
    ).run();
    release();
    expect(await running).toMatchObject({ status: 'settings_changed', received: 0 });
    expect(
      (
        await env.DB.prepare('SELECT COUNT(*) AS n FROM personal_items WHERE owner_id=?')
          .bind(owner)
          .first<{ n: number }>()
      )?.n
    ).toBe(0);
  });

  it('retains feed-provided metadata when platform extraction fails and queues transcript work independently', async () => {
    const sub = await subscription(false);
    const supplied = {
      ...entry(),
      url: 'https://x.com/example/status/123456789',
      kind: 'post',
      title: 'A title supplied by the feed',
      transcripts: [{ url: 'https://example.com/transcript.vtt', type: 'text/vtt' }],
    };
    const received = await ingestEntry(env, sub, supplied);
    const jobs = await env.DB.prepare('SELECT id,payload_json FROM jobs WHERE item_id=?')
      .bind(received.itemId)
      .all<{ id: string; payload_json: string }>();
    expect(jobs.results).toHaveLength(2);
    expect(
      jobs.results.some((job) => JSON.parse(job.payload_json).stage === 'published-transcript')
    ).toBe(true);
    const source = jobs.results.find((job) => !JSON.parse(job.payload_json).stage)!;
    expect(await runJob(env, source.id)).toMatchObject({
      status: 'failed',
      code: 'x_credentials_missing',
    });
    const item = await getItem(env, owner, received.itemId);
    expect(item.content).toHaveProperty('title', supplied.title);
    expect(item.status).toBe('received');
  });

  it('retains a multi-megabyte feed entry outside D1 and keeps independent route observations without changing triage', async () => {
    const first = await subscription(false);
    const second = await subscription(true);
    await stmt(
      env.DB,
      'UPDATE source_routes SET url=? WHERE id=?',
      'https://example.com/second-feed',
      second.route_id
    ).run();
    const text = '内容。'.repeat(100000);
    const supplied = {
      ...entry(),
      url: 'https://x.com/example/status/987654321',
      kind: 'post',
      text,
      html: `<p>${text}</p>`,
    };
    const result = await ingestEntry(env, first, supplied);
    const sourceJob = await stmt(
      env.DB,
      'SELECT id,payload_json FROM jobs WHERE item_id=?',
      result.itemId
    ).first<{ id: string; payload_json: string }>();
    expect(sourceJob!.payload_json.length).toBeLessThan(2000);
    const payload = JSON.parse(sourceJob!.payload_json);
    expect(payload.feedEntry).toBeUndefined();
    expect((await env.ARTIFACTS.get(payload.feedEntryArtifactKey))!.size).toBeGreaterThan(1000000);
    await runJob(env, sourceJob!.id);
    expect((await getItem(env, owner, result.itemId, ['article'])).content).toHaveProperty(
      'article.text',
      text
    );
    await patchItem(env, owner, result.itemId, { status: 'dismissed' });
    await ingestEntry(env, second, {
      ...supplied,
      id: crypto.randomUUID(),
      title: 'Second route metadata',
    });
    const secondJob = await stmt(
      env.DB,
      "SELECT id FROM jobs WHERE item_id=? AND json_extract(payload_json,'$.metadataOnly')=1",
      result.itemId
    ).first<{ id: string }>();
    expect(await runJob(env, secondJob!.id)).toMatchObject({ status: 'succeeded' });
    expect((await getItem(env, owner, result.itemId)).status).toBe('dismissed');
    const observations = await stmt(
      env.DB,
      "SELECT COUNT(DISTINCT json_extract(provenance_json,'$.sourceUrl')) AS n FROM contributions WHERE owner_id=? AND field='article'",
      owner
    ).first<{ n: number }>();
    expect(observations!.n).toBe(2);
  });

  it('rejects an intake whose subscription changes during an R2 input upload', async () => {
    const sub = await subscription(false);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const started = new Promise<void>((resolve) => (entered = resolve));
    const paused = {
      ...env,
      ARTIFACTS: new Proxy(env.ARTIFACTS, {
        get(target, prop) {
          if (prop === 'put')
            return async (...args: Parameters<R2Bucket['put']>) => {
              entered();
              await gate;
              return target.put(...args);
            };
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    };
    const running = ingestEntry(paused, sub, { ...entry(), text: 'large input '.repeat(10000) });
    await started;
    await stmt(env.DB, 'UPDATE subscriptions SET revision=revision+1 WHERE id=?', sub.id).run();
    release();
    await expect(running).rejects.toMatchObject({ code: 'subscription_changed' });
    expect(
      await stmt(env.DB, 'SELECT id FROM personal_items WHERE owner_id=?', owner).first()
    ).toBeNull();
    const pending = await stmt(
      env.DB,
      'SELECT p.artifact_key FROM subscription_snapshots p JOIN artifact_garbage g ON g.artifact_key=p.artifact_key WHERE p.subscription_id=?',
      sub.id
    ).first();
    expect(pending).toBeTruthy();
  });

  it('keeps pending outbox jobs when queue delivery fails', async () => {
    const saved = await save(
      env,
      { userId: owner, contributor: 'test' },
      saveSchema.parse({ url: entry().url })
    );
    const result = await dispatchOutbox(env, owner);
    expect(result.due).toBeGreaterThan(0);
    expect(result.sent).toBe(0);
    const job = await stmt(
      env.DB,
      'SELECT status FROM jobs WHERE item_id=?',
      saved.body.item.id
    ).first();
    expect(job?.status).toBe('pending');
  });

  it('prevents expired work from enriching a deleted and re-saved item', async () => {
    const input = saveSchema.parse({ url: entry().url });
    const principal = { userId: owner, contributor: 'zine:provider' };
    const saved = await save(env, principal, input);
    const itemId = saved.body.item.id;
    await deleteItem(env, owner, itemId);
    await save(env, principal, input);
    await expect(
      contribute(
        env,
        principal,
        itemId,
        {
          field: 'title',
          value: 'Stale title',
          category: 'source',
          provenance: { method: 'old-job', inputContributionIds: [] },
        },
        undefined,
        0
      )
    ).rejects.toMatchObject({ code: 'stale_generation' });
    expect((await getItem(env, owner, itemId)).content).not.toHaveProperty('title');
  });

  it('claims a job only once and reports unsupported adapters as failures', async () => {
    const saved = await save(
      env,
      { userId: owner, contributor: 'test' },
      saveSchema.parse({ url: 'https://x.com/example/status/123' })
    );
    const job = (await stmt(
      env.DB,
      'SELECT id FROM jobs WHERE item_id=?',
      saved.body.item.id
    ).first<{ id: string }>())!;
    await stmt(env.DB, "UPDATE jobs SET kind='index' WHERE id=?", job.id).run();
    const result = await runJob(env, job.id);
    expect(result).toMatchObject({
      claimed: true,
      status: 'failed',
      code: 'semantic_index_not_configured',
    });
    expect(await runJob(env, job.id)).toEqual({ claimed: false });
    expect((await getItem(env, owner, saved.body.item.id)).status).toBe('saved');
  });

  it('queues artifact cleanup when personal enrichment is deleted', async () => {
    const principal = { userId: owner, contributor: 'test' };
    const saved = await save(env, principal, saveSchema.parse({ url: entry().url }));
    const contribution = await contribute(env, principal, saved.body.item.id, {
      field: 'transcript',
      value: { segments: [{ text: 'private' }] },
      category: 'source',
      provenance: { method: 'test', inputContributionIds: [] },
    });
    const artifact = await stmt(
      env.DB,
      'SELECT artifact_key FROM contributions WHERE id=?',
      contribution.id
    ).first<string>('artifact_key');
    await deleteItem(env, owner, saved.body.item.id);
    expect(
      await stmt(
        env.DB,
        'SELECT artifact_key FROM artifact_garbage WHERE artifact_key=?',
        artifact
      ).first()
    ).toBeTruthy();
    expect(
      await stmt(env.DB, 'SELECT id FROM contributions WHERE id=?', contribution.id).first()
    ).toBeNull();
  });

  it('coordinates provider backoff across jobs without consuming deferred attempts', async () => {
    const first = await acquireBudget(env, 'workers-ai:embeddings', 'held-by-test');
    expect(first.acquired).toBe(true);
    const saved = await save(
      env,
      { userId: owner, contributor: 'test' },
      saveSchema.parse({ url: entry().url })
    );
    const job = (await stmt(
      env.DB,
      'SELECT id FROM jobs WHERE item_id=?',
      saved.body.item.id
    ).first<{ id: string }>())!;
    await stmt(env.DB, "UPDATE jobs SET kind='index' WHERE id=?", job.id).run();
    expect(await runJob(env, job.id)).toMatchObject({ claimed: true, status: 'deferred' });
    const deferred = await stmt(
      env.DB,
      'SELECT attempts,status FROM jobs WHERE id=?',
      job.id
    ).first<{ attempts: number; status: string }>();
    expect(deferred).toMatchObject({ attempts: 0, status: 'pending' });
    await releaseBudget(env, 'workers-ai:embeddings', 'held-by-test', 120);
    expect((await acquireBudget(env, 'workers-ai:embeddings', 'new-job')).acquired).toBe(false);
  });

  it('allows only one concurrent provider lease and rejects a stale release', async () => {
    const scope = `provider:test-${crypto.randomUUID()}`;
    const results = await Promise.all(
      ['one', 'two', 'three'].map((token) => acquireBudget(env, scope, token))
    );
    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    await releaseBudget(env, scope, 'not-the-holder');
    expect((await acquireBudget(env, scope, 'four')).acquired).toBe(false);
  });
  it('prioritizes source work and bounds queued AI work during a corpus backfill', async () => {
    const saved = await save(
      env,
      { userId: owner, contributor: 'test' },
      saveSchema.parse({ url: entry().url })
    );
    const timestamp = now();
    const queued: string[] = [];
    const original = env.JOBS;
    env.JOBS = {
      send: async (value: { jobId: string }) => {
        queued.push(value.jobId);
      },
    } as unknown as Queue;
    try {
      for (const kind of ['index', 'enrich'])
        for (let i = 0; i < 120; i++)
          await stmt(
            env.DB,
            "INSERT INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?,?)",
            id('job'),
            owner,
            saved.body.item.id,
            kind,
            JSON.stringify(
              kind === 'enrich'
                ? { stage: 'understanding', generation: 0, requestedRevision: 1 }
                : {}
            ),
            timestamp,
            timestamp,
            timestamp
          ).run();
      expect(await dispatchOutbox(env, owner)).toMatchObject({ sent: 3 });
      const first = await stmt(
        env.DB,
        'SELECT payload_json FROM jobs WHERE id=?',
        queued[0]
      ).first<string>('payload_json');
      expect(JSON.parse(first!).stage).toBeUndefined();
      expect(await dispatchOutbox(env, owner)).toMatchObject({ sent: 0 });
      expect(queued).toHaveLength(3);
    } finally {
      env.JOBS = original;
    }
  });
});
