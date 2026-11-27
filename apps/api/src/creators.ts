import { acquireBudget, releaseBudget } from './budgets';
import { creatorImageReference, identify } from './identity';
import { all, id, now, stmt } from './lib';
import { ProviderError } from './remote';
import { youtubeRequest } from './providers/youtube-api';
import type { Env } from './types';

/**
 * Shared, public creator records (a YouTube channel today).
 *
 * A creator's avatar is a fact about the channel, not about anyone's saved item, so it is
 * stored once and shown on every item by that creator. Records hold only what the platform
 * publishes to anyone: the channel id, name, URL and avatar. They have no owner, are never
 * derived from a user's own writes, and outlive any one account's erasure.
 *
 * Images come from three places, in increasing trust: the previous app's stored avatar
 * (seeded by migration 0028), the public watch page, and the YouTube Data API. A lower
 * method never replaces a higher one; the API record is refreshed weekly by
 * `refreshCreators` using the app's own key, one `channels.list` call per 50 channels.
 */

const DAY = 86_400_000;
/** How long a Data API observation is used before it is refreshed. */
export const CREATOR_REFRESH_MS = 7 * DAY;
/**
 * YouTube's developer policies require API data to be refreshed or deleted within 30 days;
 * API-sourced images and video metadata older than this are cleared by maintenance.
 */
export const YOUTUBE_API_RETENTION_MS = 30 * DAY;
/** The scope used by background shared lookups; separate from per-item enrichment leases. */
export const SHARED_YOUTUBE_SCOPE = 'provider:youtube:shared';
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type CreatorImageMethod =
  | 'youtube-data-api'
  | 'youtube-public-page'
  | 'legacy-library-migration';
const RANK_SQL = `CASE %s WHEN 'youtube-data-api' THEN 3 WHEN 'youtube-public-page' THEN 2 WHEN 'legacy-library-migration' THEN 1 ELSE 0 END`;
const rank = (column: string) => RANK_SQL.replace('%s', column);

export function youtubeCreatorKey(channelId: string) {
  return `youtube:channel:${channelId}`;
}
export function youtubeChannelId(value: unknown): string | undefined {
  return typeof value === 'string' && CHANNEL_ID.test(value) ? value : undefined;
}
/** The channel id named by a `source` contribution value, if it is a YouTube channel. */
export function sourceChannelId(source: unknown): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const value = source as { id?: unknown; kind?: unknown };
  return value.kind === 'channel' ? youtubeChannelId(value.id) : undefined;
}
export function youtubeVideoId(url: string): string | undefined {
  try {
    const identity = identify(url);
    return identity.platform === 'youtube' &&
      identity.kind === 'video' &&
      VIDEO_ID.test(identity.externalId ?? '')
      ? identity.externalId
      : undefined;
  } catch {
    return undefined;
  }
}

export interface CreatorObservation {
  channelId: string;
  name?: string;
  imageUrl?: string;
  method?: CreatorImageMethod;
}
/** Records a creator and, when given, its avatar unless a more trusted one is already held. */
export async function observeCreators(env: Env, observations: CreatorObservation[]) {
  const timestamp = now();
  const statements = observations.flatMap((observation) => {
    const channelId = youtubeChannelId(observation.channelId);
    if (!channelId) return [];
    const image = creatorImageReference(observation.imageUrl);
    const method = image ? (observation.method ?? null) : null;
    return [
      stmt(
        env.DB,
        `INSERT INTO creators(key,platform,external_id,name,url,image_url,image_method,image_observed_at,refresh_after,created_at,updated_at)
        VALUES(?,'youtube',?,?,?,?,?,?,?,?,?)
        ON CONFLICT(key) DO UPDATE SET
          name=COALESCE(excluded.name,creators.name),
          image_url=CASE WHEN excluded.image_url IS NOT NULL AND ${rank('excluded.image_method')}>=${rank('creators.image_method')} THEN excluded.image_url ELSE creators.image_url END,
          image_method=CASE WHEN excluded.image_url IS NOT NULL AND ${rank('excluded.image_method')}>=${rank('creators.image_method')} THEN excluded.image_method ELSE creators.image_method END,
          image_observed_at=CASE WHEN excluded.image_url IS NOT NULL AND ${rank('excluded.image_method')}>=${rank('creators.image_method')} THEN excluded.image_observed_at ELSE creators.image_observed_at END,
          refresh_after=CASE WHEN excluded.image_method='youtube-data-api' THEN excluded.refresh_after ELSE creators.refresh_after END,
          last_error_code=CASE WHEN excluded.image_method='youtube-data-api' THEN NULL ELSE creators.last_error_code END,
          updated_at=excluded.updated_at`,
        youtubeCreatorKey(channelId),
        channelId,
        observation.name?.slice(0, 2000) || null,
        `https://www.youtube.com/channel/${channelId}`,
        image ?? null,
        method,
        image ? timestamp : null,
        method === 'youtube-data-api'
          ? new Date(Date.now() + CREATOR_REFRESH_MS).toISOString()
          : '1970-01-01T00:00:00.000Z',
        timestamp,
        timestamp
      ),
    ];
  });
  for (let offset = 0; offset < statements.length; offset += 50)
    await env.DB.batch(statements.slice(offset, offset + 50));
}

export interface VideoObservation {
  videoId: string;
  channelId?: string;
  data?: unknown;
  method: string;
  missing?: boolean;
}
/** Records public video-to-channel identity and, from the Data API, the video resource. */
export async function observeYouTubeVideos(env: Env, observations: VideoObservation[]) {
  const timestamp = now();
  const statements = observations.flatMap((observation) => {
    if (!VIDEO_ID.test(observation.videoId)) return [];
    const channelId = youtubeChannelId(observation.channelId) ?? null;
    const data = observation.data === undefined ? null : JSON.stringify(observation.data);
    return [
      stmt(
        env.DB,
        `INSERT INTO youtube_videos(video_id,channel_id,data_json,api_fetched_at,missing,method,updated_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(video_id) DO UPDATE SET
          channel_id=COALESCE(excluded.channel_id,youtube_videos.channel_id),
          data_json=COALESCE(excluded.data_json,youtube_videos.data_json),
          api_fetched_at=COALESCE(excluded.api_fetched_at,youtube_videos.api_fetched_at),
          missing=CASE WHEN excluded.api_fetched_at IS NOT NULL THEN excluded.missing ELSE youtube_videos.missing END,
          method=CASE WHEN excluded.channel_id IS NOT NULL OR excluded.api_fetched_at IS NOT NULL THEN excluded.method ELSE youtube_videos.method END,
          updated_at=excluded.updated_at`,
        observation.videoId,
        channelId,
        data,
        data || observation.missing ? timestamp : null,
        observation.missing ? 1 : 0,
        observation.method,
        timestamp
      ),
    ];
  });
  for (let offset = 0; offset < statements.length; offset += 50)
    await env.DB.batch(statements.slice(offset, offset + 50));
}

/** A Data API video resource stored within `maxAgeMs`, if any. */
export async function cachedYouTubeVideo(env: Env, videoId: string, maxAgeMs: number) {
  const row = await stmt(
    env.DB,
    'SELECT data_json,api_fetched_at,missing FROM youtube_videos WHERE video_id=? AND api_fetched_at>?',
    videoId,
    new Date(Date.now() - maxAgeMs).toISOString()
  ).first<{ data_json: string | null; missing: number }>();
  if (!row) return undefined;
  return row.missing ? null : row.data_json ? (JSON.parse(row.data_json) as unknown) : undefined;
}
/** A Data API channel avatar observed within the refresh window, if any. */
export async function freshApiCreatorImage(env: Env, channelId: string) {
  return (
    (await stmt(
      env.DB,
      "SELECT image_url FROM creators WHERE key=? AND image_method='youtube-data-api' AND image_observed_at>?",
      youtubeCreatorKey(channelId),
      new Date(Date.now() - CREATOR_REFRESH_MS).toISOString()
    ).first<string>('image_url')) ?? undefined
  );
}

/**
 * The creator record for an item: its provider `source` channel, else the channel recorded
 * for its video. Returns only records that hold an image.
 */
export async function creatorRecordFor(
  env: Env,
  content: { platform: string; canonical_url: string },
  source: unknown
) {
  if (content.platform !== 'youtube') return undefined;
  let channelId = sourceChannelId(source);
  if (!channelId) {
    const videoId = youtubeVideoId(content.canonical_url);
    if (videoId)
      channelId =
        (await stmt(
          env.DB,
          'SELECT channel_id FROM youtube_videos WHERE video_id=?',
          videoId
        ).first<string>('channel_id')) ?? undefined;
  }
  if (!channelId) return undefined;
  const record = await stmt(
    env.DB,
    'SELECT key,url,image_url,image_method,image_observed_at FROM creators WHERE key=? AND image_url IS NOT NULL',
    youtubeCreatorKey(channelId)
  ).first<{
    key: string;
    url: string;
    image_url: string;
    image_method: string;
    image_observed_at: string | null;
  }>();
  return record ?? undefined;
}

interface Selectable {
  id: string;
  field: string;
  value_json: string | null;
  category: string;
  provenance_json: string;
}
/**
 * The creator image an item shows. An owner's own correction always wins; otherwise a
 * shared creator record wins over values stored on the item, which are older per-item
 * observations of the same avatar. Used by item JSON and the image proxy alike.
 */
export async function shownCreatorImage(
  env: Env,
  content: { platform: string; canonical_url: string },
  contributions: Selectable[]
): Promise<
  | {
      value: string;
      selection: { contributionId: string | null; category: string; provenance: unknown };
    }
  | undefined
> {
  const stored = contributions.find((c) => c.field === 'creatorImageUrl');
  const storedValue = stored?.value_json ? (JSON.parse(stored.value_json) as unknown) : undefined;
  const fromItem =
    stored && typeof storedValue === 'string' && storedValue
      ? {
          value: storedValue,
          selection: {
            contributionId: stored.id,
            category: stored.category,
            provenance: JSON.parse(stored.provenance_json) as unknown,
          },
        }
      : undefined;
  if (stored?.category === 'correction') return fromItem;
  const source = contributions.find((c) => c.field === 'source');
  const record = await creatorRecordFor(
    env,
    content,
    source?.value_json ? JSON.parse(source.value_json) : undefined
  );
  if (!record) return fromItem;
  return {
    value: record.image_url,
    selection: {
      contributionId: null,
      category: 'source',
      provenance: {
        method: 'creator-record',
        sourceUrl: record.url,
        creatorKey: record.key,
        imageMethod: record.image_method,
        observedAt: record.image_observed_at,
        inputContributionIds: [],
      },
    },
  };
}

/**
 * Records creators and video identity seen in an item's provider contributions, so the
 * next item by the same creator needs no lookup of its own.
 */
export async function observeContributions(
  env: Env,
  contentUrl: string,
  contributions: { field: string; value: unknown; provenance: { method: string } }[]
) {
  const source = contributions.find((c) => c.field === 'source');
  const channelId = sourceChannelId(source?.value);
  if (!channelId) return;
  const image = contributions.find((c) => c.field === 'creatorImageUrl');
  const method = image?.provenance.method;
  const sourceName = (source?.value as { name?: unknown }).name;
  await observeCreators(env, [
    {
      channelId,
      name: typeof sourceName === 'string' ? sourceName : undefined,
      // Data API avatars are recorded where the channel lookup happens: an item's value may
      // be a reused shared image, and recording it again would postpone its refresh.
      ...(image && method === 'youtube-public-page'
        ? { imageUrl: String(image.value), method }
        : {}),
    },
  ]);
  const videoId = youtubeVideoId(contentUrl);
  if (videoId)
    await observeYouTubeVideos(env, [
      { videoId, channelId, method: source?.provenance.method ?? 'provider' },
    ]);
}

type YouTubeFetch = (path: string, params: Record<string, string>) => Promise<{ items: unknown[] }>;
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** One `channels.list` call (1 quota unit) for up to 50 channels. */
export async function lookupChannels(env: Env, request: YouTubeFetch, channelIds: string[]) {
  const ids = [...new Set(channelIds.filter((value) => CHANNEL_ID.test(value)))].slice(0, 50);
  if (!ids.length) return [];
  const result = await request('channels', {
    part: 'snippet',
    id: ids.join(','),
    maxResults: '50',
  });
  const found = new Set<string>();
  const observations: CreatorObservation[] = [];
  for (const item of result.items.map(obj)) {
    const channelId = youtubeChannelId(item.id);
    if (!channelId) continue;
    found.add(channelId);
    const snippet = obj(item.snippet);
    const thumbnails = obj(snippet.thumbnails);
    observations.push({
      channelId,
      name: typeof snippet.title === 'string' ? snippet.title : undefined,
      imageUrl: String(obj(thumbnails.high ?? thumbnails.medium ?? thumbnails.default).url ?? ''),
      method: 'youtube-data-api',
    });
  }
  await observeCreators(env, observations);
  const timestamp = now();
  const missing = ids.filter((channelId) => !found.has(channelId));
  if (missing.length)
    await env.DB.batch(
      missing.map((channelId) =>
        stmt(
          env.DB,
          "UPDATE creators SET last_error_code='source_not_found',refresh_after=?,updated_at=? WHERE key=?",
          new Date(Date.now() + CREATOR_REFRESH_MS).toISOString(),
          timestamp,
          youtubeCreatorKey(channelId)
        )
      )
    );
  return observations;
}

/** One `videos.list` call (1 quota unit) for up to 50 videos, stored for every owner. */
export async function lookupVideos(env: Env, request: YouTubeFetch, videoIds: string[]) {
  const ids = [...new Set(videoIds.filter((value) => VIDEO_ID.test(value)))].slice(0, 50);
  if (!ids.length) return [];
  const result = await request('videos', {
    part: 'snippet,contentDetails,statistics',
    id: ids.join(','),
    maxResults: '50',
  });
  const found = new Map<string, Record<string, unknown>>();
  for (const item of result.items.map(obj))
    if (typeof item.id === 'string' && VIDEO_ID.test(item.id)) found.set(item.id, item);
  await observeYouTubeVideos(
    env,
    ids.map((videoId) => {
      const item = found.get(videoId);
      return item
        ? {
            videoId,
            channelId: String(obj(item.snippet).channelId ?? ''),
            data: item,
            method: 'youtube-data-api',
          }
        : { videoId, method: 'youtube-data-api', missing: true };
    })
  );
  await observeCreators(
    env,
    [...found.values()].flatMap((item) => {
      const snippet = obj(item.snippet);
      const channelId = youtubeChannelId(snippet.channelId);
      return channelId
        ? [
            {
              channelId,
              name: typeof snippet.channelTitle === 'string' ? snippet.channelTitle : undefined,
            },
          ]
        : [];
    })
  );
  return [...found.values()];
}

/**
 * Runs `work` with the app's own Data API key under the shared lookup budget. Background
 * lookups never use an owner's Google authorization. Without a key this does nothing.
 */
export async function withSharedYouTubeApi<T>(
  env: Env,
  work: (request: YouTubeFetch) => Promise<T>
): Promise<T | undefined> {
  if (!env.YOUTUBE_API_KEY) return undefined;
  const token = id('ytshared');
  const budget = await acquireBudget(env, SHARED_YOUTUBE_SCOPE, token);
  if (!budget.acquired) return undefined;
  try {
    const result = await work((path, params) => youtubeRequest(env, undefined, path, params));
    await releaseBudget(env, SHARED_YOUTUBE_SCOPE, token);
    return result;
  } catch (error) {
    // Quota exhaustion is a 403; back off for an hour rather than retrying every cron.
    const retryAfter =
      error instanceof ProviderError
        ? error.code === 'rate_limited'
          ? error.retryAfterSeconds
          : error.code === 'provider_access_denied'
            ? 3600
            : 300
        : 300;
    await releaseBudget(env, SHARED_YOUTUBE_SCOPE, token, retryAfter);
    console.warn(
      JSON.stringify({
        event: 'shared_youtube_lookup_failed',
        code: error instanceof ProviderError ? error.code : 'processing_error',
      })
    );
    return undefined;
  }
}

/** Fetches due creator records, oldest first, 50 per call. */
export async function refreshCreators(env: Env, limit = 50) {
  const due = await all<{ external_id: string }>(
    env.DB,
    "SELECT external_id FROM creators WHERE platform='youtube' AND refresh_after<=? ORDER BY refresh_after,key LIMIT ?",
    now(),
    limit
  );
  if (!due.length) return 0;
  const refreshed = await withSharedYouTubeApi(env, (request) =>
    lookupChannels(
      env,
      request,
      due.map((row) => row.external_id)
    )
  );
  return refreshed?.length ?? 0;
}

/**
 * Finds the channel of YouTube videos whose items name none (for example items imported
 * from the previous app), 50 per call, so they can show their creator's record.
 */
export async function backfillVideoChannels(env: Env, limit = 50) {
  if (!env.YOUTUBE_API_KEY) return 0;
  const rows = await all<{ canonical_url: string }>(
    env.DB,
    `SELECT c.canonical_url FROM content_items c
    WHERE c.platform='youtube' AND c.kind='video' AND c.canonical_url LIKE 'https://www.youtube.com/watch?v=%'
      AND NOT EXISTS(SELECT 1 FROM youtube_videos v WHERE v.video_id=substr(c.canonical_url,33,11) AND (v.channel_id IS NOT NULL OR v.missing=1))
      AND EXISTS(SELECT 1 FROM personal_items p WHERE p.content_id=c.id AND p.status!='deleted')
    LIMIT ?`,
    limit
  );
  const videoIds = rows.flatMap((row) => youtubeVideoId(row.canonical_url) ?? []);
  if (!videoIds.length) return 0;
  const found = await withSharedYouTubeApi(env, (request) => lookupVideos(env, request, videoIds));
  return found?.length ?? 0;
}

/** Clears Data API material past its retention period and unreferenced feed copies. */
export async function purgeSharedProviderData(env: Env) {
  const cutoff = new Date(Date.now() - YOUTUBE_API_RETENTION_MS).toISOString();
  await stmt(
    env.DB,
    'UPDATE youtube_videos SET data_json=NULL,api_fetched_at=NULL,missing=0 WHERE api_fetched_at<?',
    cutoff
  ).run();
  await stmt(
    env.DB,
    "UPDATE creators SET image_url=NULL,image_method=NULL,image_observed_at=NULL,refresh_after='1970-01-01T00:00:00.000Z' WHERE image_method='youtube-data-api' AND image_observed_at<?",
    cutoff
  ).run();
}

/** Marks an item whose YouTube metadata gaps were filled from the Data API. */
export const PROVIDER_METADATA_COMPONENT = 'provider_metadata';
export const PROVIDER_METADATA_STAGE = 'provider-metadata';
/**
 * An item by any owner whose YouTube video never received Data API metadata. Cheap checks
 * come first: once an item is settled, its marker component ends the evaluation.
 */
const NEEDS_RETROFIT = `p.status!='deleted'
    AND NOT EXISTS(SELECT 1 FROM enrichment_components e WHERE e.content_id=p.content_id AND e.owner_id=p.owner_id AND e.component='${PROVIDER_METADATA_COMPONENT}')
    AND NOT EXISTS(SELECT 1 FROM contributions k WHERE k.content_id=p.content_id AND k.owner_id=p.owner_id AND k.field='structuredData' AND json_extract(k.provenance_json,'$.method')='youtube-data-api')`;
const RETROFIT_DATA_MS = 7 * DAY;

/**
 * Fills gaps in YouTube items enriched without the Data API (imported libraries, items saved
 * before a key existed). Each cron run looks up at most 50 such videos in one `videos.list`
 * call, stored once for every owner, then queues a job per item that adds only the fields the
 * item lacks. Nothing shown is overwritten, so existing titles, descriptions and generated
 * summaries stay as they are, and no watch page is fetched.
 */
export async function scheduleYouTubeRetrofit(env: Env, enqueueLimit = 100) {
  const cutoff = new Date(Date.now() - RETROFIT_DATA_MS).toISOString();
  let looked = 0;
  if (env.YOUTUBE_API_KEY) {
    const pending = await all<{ video_id: string }>(
      env.DB,
      `SELECT DISTINCT substr(c.canonical_url,33,11) AS video_id
      FROM content_items c JOIN personal_items p ON p.content_id=c.id
      WHERE c.platform='youtube' AND c.kind='video'
        AND c.canonical_url LIKE 'https://www.youtube.com/watch?v=%' AND length(c.canonical_url)=43
        AND ${NEEDS_RETROFIT}
        AND NOT EXISTS(SELECT 1 FROM youtube_videos v WHERE v.video_id=substr(c.canonical_url,33,11) AND v.api_fetched_at>?)
      LIMIT 50`,
      cutoff
    );
    if (pending.length)
      looked =
        (
          await withSharedYouTubeApi(env, (request) =>
            lookupVideos(
              env,
              request,
              pending.map((row) => row.video_id)
            )
          )
        )?.length ?? 0;
  }
  // Start from the few videos looked up recently, not from every item.
  const ready = await all<{ id: string; owner_id: string; generation: number; url: string }>(
    env.DB,
    `SELECT p.id,p.owner_id,p.generation,c.canonical_url AS url
    FROM youtube_videos v
    JOIN content_items c ON c.identity_key='youtube:video:'||v.video_id
    JOIN personal_items p ON p.content_id=c.id
    WHERE v.api_fetched_at>? AND ${NEEDS_RETROFIT}
      AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.owner_id=p.owner_id AND j.item_id=p.id AND j.kind='enrich'
        AND json_extract(j.payload_json,'$.stage')='${PROVIDER_METADATA_STAGE}' AND j.status IN ('pending','running','failed'))
    LIMIT ?`,
    cutoff,
    enqueueLimit
  );
  const timestamp = now();
  const day = timestamp.slice(0, 10);
  const statements = ready.map((row) =>
    stmt(
      env.DB,
      "INSERT OR IGNORE INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES(?,?,?,'enrich',?,'pending',?,?,?)",
      `job_ytmeta_${row.id}_${row.generation}_${day}`,
      row.owner_id,
      row.id,
      JSON.stringify({ stage: PROVIDER_METADATA_STAGE, url: row.url, generation: row.generation }),
      timestamp,
      timestamp,
      timestamp
    )
  );
  for (let offset = 0; offset < statements.length; offset += 50)
    await env.DB.batch(statements.slice(offset, offset + 50));
  return { looked, queued: ready.length };
}
