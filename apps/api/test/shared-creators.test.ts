import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { save, saveSchema, getItem } from '../src/items';
import { contribute } from '../src/enrichment';
import {
  backfillVideoChannels,
  lookupChannels,
  observeCreators,
  purgeSharedProviderData,
  refreshCreators,
  scheduleYouTubeRetrofit,
} from '../src/creators';
import { runJob } from '../src/jobs';
import { collectFeedCache, sharedFeedAt } from '../src/feed-cache';
import type { FeedFetcher } from '../src/feed-cache';
import type { Feed } from '../src/providers/feed';
import type { Env } from '../src/types';

const CHANNEL = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_CHANNEL = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`;
const feed = (title: string): Feed => ({
  title: 'Channel',
  url: FEED_URL,
  entries: [
    {
      id: `yt:video:${title}`,
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      title,
      kind: 'video',
      source: {
        id: CHANNEL,
        name: 'Channel',
        url: `https://www.youtube.com/channel/${CHANNEL}`,
        kind: 'channel',
      },
      enclosures: [],
      transcripts: [],
    },
  ],
});

describe('shared public provider data for many users', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>, env: Env;
  beforeAll(async () => {
    runtime = await runtimeHarness();
    env = {
      DB: runtime.db,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
      JOBS: await runtime.mf.getQueueProducer('JOBS'),
    } as unknown as Env;
  });
  afterAll(async () => runtime?.close());
  afterEach(() => vi.unstubAllGlobals());

  it('fetches a public feed once for every subscription and answers unchanged polls as not modified', async () => {
    const calls: Record<string, string>[] = [];
    let title = 'First';
    const upstream: FeedFetcher = async (_url, headers) => {
      calls.push(headers);
      if (headers['if-none-match'] === '"upstream-1"' && title === 'First')
        return { title: '', url: FEED_URL, entries: [], notModified: true };
      return { ...feed(title), etag: '"upstream-1"', lastModified: null };
    };
    // Two owners' subscriptions on the same URL; the second has its next poll far away.
    const later = new Date(Date.now() + 3600000).toISOString();
    await runtime.db.batch([
      runtime.db
        .prepare(
          "INSERT INTO sources(id,owner_id,identity_key,platform,url,name,created_at) VALUES('src_a','owner-a','k','youtube','u','Channel',?),('src_b','owner-b','k','youtube','u','Channel',?)"
        )
        .bind(later, later),
      runtime.db.prepare(
        `INSERT INTO source_routes(id,source_id,url,kind) VALUES('route_a','src_a','${FEED_URL}','youtube_feed'),('route_b','src_b','${FEED_URL}','youtube_feed')`
      ),
      runtime.db
        .prepare(
          "INSERT INTO subscriptions(id,owner_id,source_id,route_id,auto_save,filters_json,status,next_poll_at,created_at,updated_at) VALUES('sub_b','owner-b','src_b','route_b',0,'{}','active',?,?,?)"
        )
        .bind(later, later, later),
    ]);

    const first = await sharedFeedAt(env, FEED_URL, {}, upstream, { youtube: true });
    const second = await sharedFeedAt(env, FEED_URL, {}, upstream, { youtube: true });
    expect(calls).toHaveLength(1);
    expect(first.entries[0].title).toBe('First');
    expect(second.entries[0].title).toBe('First');
    expect(second.etag).toBe(first.etag);
    expect(first.etag).toMatch(/^"zine-[0-9a-f]{64}"$/);
    const unchanged = await sharedFeedAt(env, FEED_URL, { 'if-none-match': first.etag! }, upstream);
    expect(unchanged.notModified).toBe(true);
    expect(calls).toHaveLength(1);

    // New content: the other owner's subscription is brought forward and the video's
    // channel is recorded without any per-item lookup.
    const woken = await runtime.db
      .prepare("SELECT next_poll_at FROM subscriptions WHERE id='sub_b'")
      .first<string>('next_poll_at');
    expect(woken! <= new Date().toISOString()).toBe(true);
    expect(
      await runtime.db
        .prepare("SELECT channel_id FROM youtube_videos WHERE video_id='abcdefghijk'")
        .first<string>('channel_id')
    ).toBe(CHANNEL);
    expect(
      await runtime.db
        .prepare(`SELECT name FROM creators WHERE key='youtube:channel:${CHANNEL}'`)
        .first<string>('name')
    ).toBe('Channel');

    // Once stale, the upstream fetch is conditional; a 304 keeps the stored copy.
    await runtime.db.prepare("UPDATE feed_fetches SET fetched_at='2020-01-01T00:00:00.000Z'").run();
    const revalidated = await sharedFeedAt(env, FEED_URL, {}, upstream);
    expect(calls).toHaveLength(2);
    expect(calls[1]['if-none-match']).toBe('"upstream-1"');
    expect(revalidated.entries[0].title).toBe('First');
    expect(revalidated.etag).toBe(first.etag);

    title = 'Second';
    await runtime.db.prepare("UPDATE feed_fetches SET fetched_at='2020-01-01T00:00:00.000Z'").run();
    const changed = await sharedFeedAt(env, FEED_URL, { 'if-none-match': first.etag! }, upstream);
    expect(changed.notModified).toBeFalsy();
    expect(changed.entries[0].title).toBe('Second');
    expect(changed.etag).not.toBe(first.etag);

    // A copy is kept only while some active subscription polls that URL.
    await runtime.db.prepare("UPDATE subscriptions SET status='unsubscribed'").run();
    await runtime.db.prepare("UPDATE feed_fetches SET fetched_at='2020-01-01T00:00:00.000Z'").run();
    expect(await collectFeedCache(env)).toBe(1);
    expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM feed_fetches').first('n')).toBe(0);
  });

  it('shows the shared creator record on every owner’s item while an owner correction still wins', async () => {
    const url = 'https://www.youtube.com/watch?v=creatorvid1';
    const a = { userId: 'creator-owner-a', contributor: 'fixture' };
    const b = { userId: 'creator-owner-b', contributor: 'fixture' };
    const savedA = await save(env, a, saveSchema.parse({ url }));
    const savedB = await save(env, b, saveSchema.parse({ url }));
    // A stored per-item value, as legacy imports and feed entries have.
    await contribute(env, a, savedA.body.item.id, {
      field: 'creatorImageUrl',
      value: 'https://images.example/old-avatar.jpg',
      category: 'source',
      provenance: { method: 'legacy-library-migration', inputContributionIds: [] },
    });
    expect((await getItem(env, a.userId, savedA.body.item.id)).content.creatorImageUrl).toBe(
      'https://images.example/old-avatar.jpg'
    );
    await runtime.db
      .prepare(
        "INSERT INTO youtube_videos(video_id,channel_id,method,updated_at) VALUES('creatorvid1',?,'fixture',?)"
      )
      .bind(OTHER_CHANNEL, new Date().toISOString())
      .run();
    await observeCreators(env, [
      {
        channelId: OTHER_CHANNEL,
        name: 'Other',
        imageUrl: 'https://yt3.example/fresh.jpg',
        method: 'youtube-data-api',
      },
    ]);
    for (const [owner, item] of [
      [a, savedA],
      [b, savedB],
    ] as const) {
      const shown = await getItem(env, owner.userId, item.body.item.id);
      expect(shown.content.creatorImageUrl).toBe('https://yt3.example/fresh.jpg');
      expect(shown.enrichment.fields.creatorImageUrl).toMatchObject({
        contributionId: null,
        provenance: { method: 'creator-record', creatorKey: `youtube:channel:${OTHER_CHANNEL}` },
      });
    }
    // A less trusted observation never replaces a Data API image.
    await observeCreators(env, [
      {
        channelId: OTHER_CHANNEL,
        imageUrl: 'https://yt3.example/scraped.jpg',
        method: 'youtube-public-page',
      },
    ]);
    expect((await getItem(env, b.userId, savedB.body.item.id)).content.creatorImageUrl).toBe(
      'https://yt3.example/fresh.jpg'
    );
    await contribute(env, b, savedB.body.item.id, {
      field: 'creatorImageUrl',
      value: 'https://images.example/mine.jpg',
      category: 'correction',
      provenance: { method: 'explicit-correction', inputContributionIds: [] },
    });
    expect((await getItem(env, b.userId, savedB.body.item.id)).content.creatorImageUrl).toBe(
      'https://images.example/mine.jpg'
    );
    expect((await getItem(env, a.userId, savedA.body.item.id)).content.creatorImageUrl).toBe(
      'https://yt3.example/fresh.jpg'
    );
  });

  it('refreshes due creators 50 per channels.list call with the app key and backs off on quota errors', async () => {
    const requests: URL[] = [];
    let quotaExceeded = false;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      if (quotaExceeded) return new Response('{}', { status: 403 });
      const ids = (url.searchParams.get('id') ?? '').split(',');
      return Response.json({
        items: ids
          .filter((value) => value !== 'UCmissingmissingmissingm')
          .map((value) => ({
            id: value,
            snippet: {
              title: `Title ${value.slice(-4)}`,
              thumbnails: { high: { url: `https://yt3.example/${value}.jpg` } },
            },
          })),
      });
    });
    const keyed = { ...env, YOUTUBE_API_KEY: 'synthetic-key' } as Env;
    await runtime.db
      .prepare("DELETE FROM provider_budgets WHERE scope='provider:youtube:shared'")
      .run();
    await observeCreators(keyed, [
      { channelId: 'UCrefreshrefreshrefresh1' },
      { channelId: 'UCrefreshrefreshrefresh2' },
      { channelId: 'UCmissingmissingmissingm' },
    ]);
    expect(await refreshCreators({ ...env } as Env)).toBe(0); // no key: no request
    expect(requests).toHaveLength(0);
    await refreshCreators(keyed);
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe('/youtube/v3/channels');
    expect(requests[0].searchParams.get('key')).toBe('synthetic-key');
    expect(requests[0].searchParams.get('id')!.split(',').length).toBeGreaterThanOrEqual(3);
    const refreshed = await runtime.db
      .prepare(
        "SELECT image_url,image_method,refresh_after FROM creators WHERE key='youtube:channel:UCrefreshrefreshrefresh1'"
      )
      .first<{ image_url: string; image_method: string; refresh_after: string }>();
    expect(refreshed).toMatchObject({
      image_url: 'https://yt3.example/UCrefreshrefreshrefresh1.jpg',
      image_method: 'youtube-data-api',
    });
    expect(refreshed!.refresh_after > new Date(Date.now() + 6 * 86400000).toISOString()).toBe(true);
    expect(
      await runtime.db
        .prepare(
          "SELECT last_error_code FROM creators WHERE key='youtube:channel:UCmissingmissingmissingm'"
        )
        .first('last_error_code')
    ).toBe('source_not_found');
    // Nothing is due now, so no request.
    await refreshCreators(keyed);
    expect(requests).toHaveLength(1);

    // Quota exhaustion (403) holds shared lookups for an hour instead of retrying each cron.
    await runtime.db.prepare("UPDATE creators SET refresh_after='1970-01-01T00:00:00.000Z'").run();
    quotaExceeded = true;
    await refreshCreators(keyed);
    expect(requests).toHaveLength(2);
    await refreshCreators(keyed);
    expect(requests).toHaveLength(2);
    const held = await runtime.db
      .prepare("SELECT not_before FROM provider_budgets WHERE scope='provider:youtube:shared'")
      .first<string>('not_before');
    expect(held! > new Date(Date.now() + 50 * 60000).toISOString()).toBe(true);

    // API-sourced images are cleared once older than 30 days.
    await runtime.db
      .prepare(
        "UPDATE creators SET image_observed_at='2020-01-01T00:00:00.000Z' WHERE image_method='youtube-data-api'"
      )
      .run();
    await purgeSharedProviderData(env);
    expect(
      await runtime.db
        .prepare("SELECT COUNT(*) AS n FROM creators WHERE image_method='youtube-data-api'")
        .first('n')
    ).toBe(0);
  });

  it('finds the channel of imported videos in one videos.list call per 50 videos', async () => {
    await runtime.db
      .prepare("DELETE FROM provider_budgets WHERE scope='provider:youtube:shared'")
      .run();
    const owner = { userId: 'backfill-owner', contributor: 'fixture' };
    for (const videoId of ['backfill001', 'backfill002', 'gonegonegon'])
      await save(
        env,
        owner,
        saveSchema.parse({ url: `https://www.youtube.com/watch?v=${videoId}` })
      );
    const requests: URL[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      return Response.json({
        items: (url.searchParams.get('id') ?? '')
          .split(',')
          .filter((value) => value.startsWith('backfill'))
          .map((value) => ({
            id: value,
            snippet: { channelId: 'UCbackfillbackfillbackfi', channelTitle: 'Backfilled' },
            contentDetails: { duration: 'PT1M' },
          })),
      });
    });
    const keyed = { ...env, YOUTUBE_API_KEY: 'synthetic-key' } as Env;
    await backfillVideoChannels(keyed);
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe('/youtube/v3/videos');
    const rows = await runtime.db
      .prepare(
        "SELECT video_id,channel_id,missing FROM youtube_videos WHERE video_id IN ('backfill001','backfill002','gonegonegon') ORDER BY video_id"
      )
      .all();
    expect(rows.results).toEqual([
      { video_id: 'backfill001', channel_id: 'UCbackfillbackfillbackfi', missing: 0 },
      { video_id: 'backfill002', channel_id: 'UCbackfillbackfillbackfi', missing: 0 },
      { video_id: 'gonegonegon', channel_id: null, missing: 1 },
    ]);
    // Every video is now resolved or known missing: no further request.
    await backfillVideoChannels(keyed);
    expect(requests).toHaveLength(1);
    // The channel was recorded for the next refresh.
    expect(
      await runtime.db
        .prepare("SELECT name FROM creators WHERE key='youtube:channel:UCbackfillbackfillbackfi'")
        .first('name')
    ).toBe('Backfilled');
  });

  it('fills only the missing fields of imported YouTube items from one batched lookup', async () => {
    await runtime.db
      .prepare("DELETE FROM provider_budgets WHERE scope='provider:youtube:shared'")
      .run();
    // Earlier tests leave YouTube items behind; settle them so this test sees only its own.
    await runtime.db
      .prepare(
        "INSERT OR IGNORE INTO enrichment_components(content_id,owner_id,component,status,updated_at) SELECT content_id,owner_id,'provider_metadata','available','2026-01-01T00:00:00.000Z' FROM personal_items"
      )
      .run();
    const a = { userId: 'retrofit-owner-a', contributor: 'fixture' };
    const b = { userId: 'retrofit-owner-b', contributor: 'fixture' };
    const url = 'https://www.youtube.com/watch?v=retrofit001';
    const savedA = await save(env, a, saveSchema.parse({ url }));
    const savedB = await save(env, b, saveSchema.parse({ url }));
    const gone = await save(
      env,
      a,
      saveSchema.parse({ url: 'https://www.youtube.com/watch?v=retrofitgon' })
    );
    // What the previous app imported for owner A: title, description and a summary.
    for (const [field, value] of [
      ['title', 'Imported title'],
      ['description', 'Imported description'],
    ] as const)
      await contribute(env, a, savedA.body.item.id, {
        field,
        value,
        category: 'source',
        provenance: { method: 'legacy-library-migration', inputContributionIds: [] },
      });
    const understandingBefore = await runtime.db
      .prepare('SELECT requested_revision FROM understanding_requests WHERE item_id=?')
      .bind(savedA.body.item.id)
      .first<number>('requested_revision');
    const requests: URL[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const request = new URL(input instanceof Request ? input.url : String(input));
      requests.push(request);
      return Response.json({
        items: [
          {
            id: 'retrofit001',
            snippet: {
              title: 'API title',
              description: 'API description\n0:00 Intro\n1:30 Main part',
              channelId: 'UCretrofitretrofitretrof',
              channelTitle: 'Retrofit channel',
              publishedAt: '2026-01-02T00:00:00Z',
              tags: ['one', 'two'],
              defaultAudioLanguage: 'en',
            },
            contentDetails: { duration: 'PT12M' },
          },
        ],
      });
    });
    const keyed = { ...env, YOUTUBE_API_KEY: 'synthetic-key' } as Env;
    const first = await scheduleYouTubeRetrofit(keyed);
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe('/youtube/v3/videos');
    expect(requests[0].searchParams.get('id')!.split(',').sort()).toEqual([
      'retrofit001',
      'retrofitgon',
    ]);
    expect(first.queued).toBe(3);
    const jobs = await runtime.db
      .prepare(
        "SELECT id FROM jobs WHERE json_extract(payload_json,'$.stage')='provider-metadata' AND status='pending'"
      )
      .all<{ id: string }>();
    for (const job of jobs.results) await runJob(keyed, job.id);
    // Applying stored resources makes no further request.
    expect(requests).toHaveLength(1);

    const itemA = await getItem(env, a.userId, savedA.body.item.id);
    expect(itemA.content).toMatchObject({
      title: 'Imported title',
      description: 'Imported description',
      durationSeconds: 720,
      language: 'en',
      chapters: [
        { startSeconds: 0, title: 'Intro' },
        { startSeconds: 90, title: 'Main part' },
      ],
    });
    expect(itemA.enrichment.fields.durationSeconds).toMatchObject({
      provenance: { method: 'youtube-data-api' },
    });
    const itemB = await getItem(env, b.userId, savedB.body.item.id);
    expect(itemB.content).toMatchObject({ title: 'API title', durationSeconds: 720 });
    // Owner A's description was kept, so its summary is not regenerated.
    expect(
      await runtime.db
        .prepare('SELECT requested_revision FROM understanding_requests WHERE item_id=?')
        .bind(savedA.body.item.id)
        .first<number>('requested_revision')
    ).toBe(understandingBefore);
    const component = (item: Awaited<ReturnType<typeof getItem>>) =>
      item.enrichment.components.find(
        (entry: { component: string }) => entry.component === 'provider_metadata'
      );
    expect(component(itemA)).toMatchObject({ status: 'available' });
    expect(component(await getItem(env, a.userId, gone.body.item.id))).toMatchObject({
      status: 'unavailable',
      reasonCode: 'youtube_item_unavailable',
    });
    // The channel is now known for avatars.
    expect(
      await runtime.db
        .prepare("SELECT channel_id FROM youtube_videos WHERE video_id='retrofit001'")
        .first('channel_id')
    ).toBe('UCretrofitretrofitretrof');
    // Everything is settled: no lookups, no jobs.
    expect(await scheduleYouTubeRetrofit(keyed)).toEqual({ looked: 0, queued: 0 });
    expect(requests).toHaveLength(1);
  });

  it('ignores malformed identifiers from provider responses', async () => {
    const observations = await lookupChannels(
      env,
      async () => ({
        items: [{ id: 'not-a-channel', snippet: { title: 'x' } }],
      }),
      [CHANNEL]
    );
    expect(observations).toEqual([]);
  });
});

describe('two owners subscribed to the same YouTube channel', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>> | undefined;
  afterEach(async () => runtime?.close());
  it('shares one feed fetch and one batched video lookup, and both see the channel avatar', async () => {
    const counts = { feed: 0, videos: 0, channels: 0, watch: 0 };
    const videoIds: string[] = [];
    const published = new Date(Date.now() + 60000).toISOString();
    runtime = await runtimeHarness({
      consumeJobs: true,
      bindings: { YOUTUBE_API_KEY: 'synthetic-youtube-key' },
      outbound: (request) => {
        const url = new URL(request.url);
        if (url.hostname === 'cloudflare-dns.com')
          return Response.json({
            Status: 0,
            Answer:
              url.searchParams.get('type') === 'AAAA' ? [] : [{ type: 1, data: '93.184.216.34' }],
          });
        if (url.hostname === 'www.youtube.com' && url.pathname === '/feeds/videos.xml') {
          counts.feed++;
          return new Response(
            `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>Shared channel</title><yt:channelId>${CHANNEL}</yt:channelId><link rel="alternate" href="https://www.youtube.com/channel/${CHANNEL}"/><entry><id>yt:video:sharedvideo</id><yt:videoId>sharedvideo</yt:videoId><yt:channelId>${CHANNEL}</yt:channelId><title>Shared video</title><link rel="alternate" href="https://www.youtube.com/watch?v=sharedvideo"/><published>${published}</published><author><name>Shared channel</name></author></entry></feed>`,
            { headers: { 'content-type': 'application/atom+xml' } }
          );
        }
        if (url.hostname === 'www.googleapis.com' && url.pathname === '/youtube/v3/videos') {
          counts.videos++;
          videoIds.push(url.searchParams.get('id')!);
          return Response.json({
            items: [
              {
                id: 'sharedvideo',
                snippet: {
                  title: 'Shared video',
                  channelId: CHANNEL,
                  channelTitle: 'Shared channel',
                  publishedAt: published,
                },
                contentDetails: { duration: 'PT5M' },
                statistics: {},
              },
            ],
          });
        }
        if (url.hostname === 'www.googleapis.com' && url.pathname === '/youtube/v3/channels') {
          counts.channels++;
          return Response.json({
            items: [
              {
                id: CHANNEL,
                snippet: {
                  title: 'Shared channel',
                  thumbnails: { high: { url: 'https://yt3.example/shared.jpg' } },
                },
              },
            ],
          });
        }
        counts.watch++;
        return new Response('unavailable', { status: 503 });
      },
    });
    const running = runtime;
    // Keep the optional public watch page out of this test.
    await running.db
      .prepare(
        "INSERT INTO provider_budgets(scope,not_before,consecutive_limits) VALUES('provider:youtube:watch',?,3)"
      )
      .bind(new Date(Date.now() + 3600000).toISOString())
      .run();
    const client = async (owner: string) => {
      const token = await running.token(owner);
      return async (path: string, method = 'GET', body?: unknown) => {
        const response = await running.mf.dispatchFetch(`http://localhost/v1${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const value = JSON.parse(await response.text());
        expect(response.status, JSON.stringify(value)).toBeLessThan(400);
        return value;
      };
    };
    const until = async <T>(get: () => Promise<T>, ready: (value: T) => boolean) => {
      for (let i = 0; i < 100; i++) {
        const value = await get();
        if (ready(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Outcome not observed');
    };
    const owners = [await client('shared-owner-a'), await client('shared-owner-b')];
    const sources = [];
    for (const request of owners)
      sources.push(await request('/sources/resolve', 'POST', { url: FEED_URL }));
    // Resolving a source is a one-off, user-initiated lookup; polling is what is shared.
    const afterResolve = counts.feed;
    for (const [index, request] of owners.entries())
      await request('/subscriptions', 'POST', {
        sourceId: sources[index].id,
        routeId: sources[index].routes[0].id,
      });
    for (const request of owners) {
      const page = await until(
        () => request('/items?status=received'),
        (value: {
          items: {
            content: { title?: string; creatorImageUrl?: string; durationSeconds?: number };
          }[];
        }) =>
          value.items.length === 1 &&
          value.items[0].content.creatorImageUrl === 'https://yt3.example/shared.jpg' &&
          value.items[0].content.durationSeconds === 300
      );
      expect(page.items[0].content.title).toBe('Shared video');
      expect(page.items[0].content.creatorImageUrl).not.toContain('feeds/videos.xml');
    }
    // Both owners' subscription syncs share one upstream fetch.
    expect(counts.feed - afterResolve).toBe(1);
    expect(counts.videos).toBe(1);
    expect(videoIds).toEqual(['sharedvideo']);
    // The avatar is looked up once and reused for the other owner's item.
    expect(counts.channels).toBe(1);
  });
});
