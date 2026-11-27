import {
  observeCreators,
  observeYouTubeVideos,
  lookupVideos,
  withSharedYouTubeApi,
  youtubeVideoId,
} from './creators';
import { all, digest, id, now, stmt } from './lib';
import type { Feed } from './providers/feed';
import type { Env } from './types';

/**
 * One upstream fetch per public feed URL, shared by every subscription that polls it.
 *
 * Subscriptions keep everything personal to them: their cursor, seen entries, filters,
 * intake boundary and the items they deliver. Only the network fetch is shared. A fetch is
 * reused for `FEED_FRESH_MS`; each subscription still polls on its own schedule and gets
 * `notModified` when the shared copy has not changed since it last processed it.
 *
 * Feed bodies are public documents. The copy is keyed by the exact URL, so a feed URL that
 * carries a private token is only ever served to callers who already hold that URL.
 */
export const FEED_FRESH_MS = 10 * 60_000;
const LEASE_MS = 2 * 60_000;

type Fetched = Feed & {
  etag?: string | null;
  lastModified?: string | null;
  notModified?: boolean;
};
export type FeedFetcher = (url: string, headers: Record<string, string>) => Promise<Fetched>;
interface Row {
  url_hash: string;
  fetched_at: string | null;
  content_hash: string | null;
  etag: string | null;
  last_modified: string | null;
  artifact_key: string | null;
}

const tag = (contentHash: string) => `"zine-${contentHash}"`;
function strip(feed: Fetched): Feed {
  const rest: Fetched = { ...feed };
  delete rest.etag;
  delete rest.lastModified;
  delete rest.notModified;
  return rest;
}
async function stored(env: Env, row: Row | null) {
  if (!row?.artifact_key || !row.content_hash) return undefined;
  const object = await env.ARTIFACTS.get(row.artifact_key);
  return object ? await object.json<Feed>() : undefined;
}

export async function sharedFeedAt(
  env: Env,
  url: string,
  conditional: Record<string, string>,
  upstream: FeedFetcher,
  options: { youtube?: boolean } = {}
): Promise<Fetched> {
  const urlHash = await digest(url);
  const artifactKey = `feed-cache/${urlHash}.json`;
  const clientTag = conditional['if-none-match'];
  const respond = (feed: Feed, contentHash: string): Fetched =>
    clientTag === tag(contentHash)
      ? { title: '', url, entries: [], notModified: true }
      : { ...feed, etag: tag(contentHash), lastModified: null };
  const row = await stmt(
    env.DB,
    'SELECT url_hash,fetched_at,content_hash,etag,last_modified,artifact_key FROM feed_fetches WHERE url_hash=?',
    urlHash
  ).first<Row>();
  const fresh =
    !!row?.fetched_at && row.fetched_at > new Date(Date.now() - FEED_FRESH_MS).toISOString();
  if (fresh && row?.content_hash) {
    if (clientTag === tag(row.content_hash))
      return respond({ title: '', url, entries: [] }, row.content_hash);
    const feed = await stored(env, row);
    if (feed) return respond(feed, row.content_hash);
  }
  const lease = id('feedlease');
  const timestamp = now();
  const claimed = await stmt(
    env.DB,
    `INSERT INTO feed_fetches(url_hash,url,lease_token,lease_until,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(url_hash) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until,updated_at=excluded.updated_at
    WHERE feed_fetches.lease_until IS NULL OR feed_fetches.lease_until<?`,
    urlHash,
    url,
    lease,
    new Date(Date.now() + LEASE_MS).toISOString(),
    timestamp,
    timestamp
  ).run();
  if (!claimed.meta.changes) {
    // Another poll is fetching this feed right now: use the last copy, else fetch alone.
    const feed = await stored(env, row);
    if (feed && row?.content_hash) return respond(feed, row.content_hash);
    return upstream(url, {});
  }
  try {
    const previous = await stored(env, row);
    const fetched = await upstream(
      url,
      previous
        ? {
            ...(row?.etag ? { 'if-none-match': row.etag } : {}),
            ...(row?.last_modified ? { 'if-modified-since': row.last_modified } : {}),
          }
        : {}
    );
    let feed: Feed;
    let contentHash: string;
    let changed = false;
    if (fetched.notModified && previous && row?.content_hash) {
      feed = previous;
      contentHash = row.content_hash;
    } else {
      feed = strip(fetched);
      const body = JSON.stringify(feed);
      contentHash = await digest(body);
      changed = contentHash !== row?.content_hash;
      if (changed || !previous)
        await env.ARTIFACTS.put(artifactKey, body, {
          httpMetadata: { contentType: 'application/json' },
        });
    }
    await stmt(
      env.DB,
      'UPDATE feed_fetches SET fetched_at=?,content_hash=?,etag=?,last_modified=?,artifact_key=?,lease_token=NULL,lease_until=NULL,last_error_code=NULL,updated_at=? WHERE url_hash=? AND lease_token=?',
      now(),
      contentHash,
      fetched.notModified ? (row?.etag ?? null) : (fetched.etag ?? null),
      fetched.notModified ? (row?.last_modified ?? null) : (fetched.lastModified ?? null),
      artifactKey,
      now(),
      urlHash,
      lease
    ).run();
    if (changed) await feedChanged(env, url, feed, options);
    return respond(feed, contentHash);
  } catch (error) {
    await stmt(
      env.DB,
      'UPDATE feed_fetches SET lease_token=NULL,lease_until=NULL,last_error_code=?,updated_at=? WHERE url_hash=? AND lease_token=?',
      error instanceof Error && 'code' in error ? String(error.code) : 'processing_error',
      now(),
      urlHash,
      lease
    ).run();
    throw error;
  }
}

/**
 * New content in a shared feed: bring every other subscription's next poll forward, and
 * for YouTube channel feeds record public video/channel identity and look up the new
 * videos in one batched Data API call, so per-item enrichment needs no request.
 */
async function feedChanged(env: Env, url: string, feed: Feed, options: { youtube?: boolean }) {
  const timestamp = now();
  await stmt(
    env.DB,
    "UPDATE subscriptions SET next_poll_at=? WHERE status='active' AND next_poll_at>? AND route_id IN (SELECT id FROM source_routes WHERE url=?)",
    timestamp,
    timestamp,
    url
  ).run();
  if (!options.youtube) return;
  const videos = feed.entries.flatMap((entry) => {
    const videoId = youtubeVideoId(entry.url);
    return videoId ? [{ videoId, channelId: entry.source?.id, name: entry.source?.name }] : [];
  });
  await observeYouTubeVideos(
    env,
    videos.map((video) => ({ ...video, method: 'youtube-feed' }))
  );
  await observeCreators(
    env,
    videos.flatMap((video) =>
      video.channelId ? [{ channelId: video.channelId, name: video.name }] : []
    )
  );
  if (!env.YOUTUBE_API_KEY || !videos.length) return;
  const known = new Set(
    (
      await all<{ video_id: string }>(
        env.DB,
        'SELECT video_id FROM youtube_videos WHERE api_fetched_at>? AND video_id IN (SELECT value FROM json_each(?))',
        new Date(Date.now() - 7 * 86_400_000).toISOString(),
        JSON.stringify(videos.map((video) => video.videoId))
      )
    ).map((row) => row.video_id)
  );
  const missing = videos.map((video) => video.videoId).filter((videoId) => !known.has(videoId));
  if (missing.length)
    await withSharedYouTubeApi(env, (request) => lookupVideos(env, request, missing.slice(0, 50)));
}

/** Drops shared copies no active subscription has needed for a day. */
export async function collectFeedCache(env: Env) {
  const stale = await all<{ url_hash: string; artifact_key: string | null }>(
    env.DB,
    `SELECT f.url_hash,f.artifact_key FROM feed_fetches f
    WHERE COALESCE(f.fetched_at,f.updated_at)<? AND (f.lease_until IS NULL OR f.lease_until<?)
      AND NOT EXISTS(SELECT 1 FROM source_routes r JOIN subscriptions s ON s.route_id=r.id WHERE r.url=f.url AND s.status='active')
    LIMIT 100`,
    new Date(Date.now() - 86_400_000).toISOString(),
    now()
  );
  for (const row of stale) {
    if (row.artifact_key) await env.ARTIFACTS.delete(row.artifact_key);
    await stmt(env.DB, 'DELETE FROM feed_fetches WHERE url_hash=?', row.url_hash).run();
  }
  return stale.length;
}
