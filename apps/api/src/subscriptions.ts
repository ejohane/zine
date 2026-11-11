import { Hono } from 'hono';
import { reserveArtifactUsage } from './usage';
import { z } from 'zod4';
import {
  all,
  ApiError,
  atomicItemWrite,
  atomicOwnerWrite,
  operationGeneration,
  id,
  now,
  ownerGeneration,
  parseBody,
  stableId,
  stmt,
} from './lib';
import { contentIdentity, personalContentIdentity } from './identity';
import { fetchPublic, ProviderError } from './remote';
import { newestFirst, parseFeed } from './providers/feed';
import { extractWeb } from './providers/web';
import { spotifySource, spotifySourcePage } from './providers/spotify';
import { youtubePlaylistPage } from './providers/youtube-api';
import { youtubeSource } from './providers/youtube';
import { xSource, xSourcePage } from './providers/x';
import type { Feed, FeedEntry } from './providers/feed';
import type { AppEnv, Env } from './types';

export interface SubscriptionRow {
  id: string;
  owner_id: string;
  source_id: string;
  route_id: string;
  auto_save: number;
  filters_json: string;
  status: string;
  initialized: number;
  cursor_json: string | null;
  next_poll_at: string;
  last_success_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
  intake_since_at?: string | null;
  feed_etag?: string | null;
  feed_last_modified?: string | null;
}
export function subscriptionView(row: SubscriptionRow) {
  return {
    id: row.id,
    sourceId: row.source_id,
    routeId: row.route_id,
    autoSave: !!row.auto_save,
    filters: JSON.parse(row.filters_json),
    status: row.status,
    initialized: !!row.initialized,
    nextPollAt: row.next_poll_at,
    lastSuccessAt: row.last_success_at,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export const subscriptionFiltersSchema = z
  .object({
    types: z
      .array(
        z.enum(['article', 'post', 'video', 'short_video', 'podcast_episode', 'track', 'album'])
      )
      .min(1)
      .max(7)
      .optional(),
  })
  .strict();
const filters = subscriptionFiltersSchema;
export const subscribeSchema = z
  .object({
    sourceId: z.string(),
    routeId: z.string(),
    autoSave: z.boolean().default(false),
    filters: filters.default({}),
  })
  .strict();

async function sourceOwned(env: Env, owner: string, sourceId: string) {
  const source = await stmt(
    env.DB,
    'SELECT id,name,url,platform,created_at AS createdAt FROM sources WHERE id=? AND owner_id=?',
    sourceId,
    owner
  ).first();
  if (!source) throw new ApiError(404, 'not_found', 'Source not found');
  return source;
}
async function subscriptionOwned(env: Env, owner: string, subscriptionId: string) {
  const subscription = await stmt(
    env.DB,
    'SELECT * FROM subscriptions WHERE id=? AND owner_id=?',
    subscriptionId,
    owner
  ).first<SubscriptionRow>();
  if (!subscription) throw new ApiError(404, 'not_found', 'Subscription not found');
  return subscription;
}
async function feedAt(url: string, headers: Record<string, string> = {}) {
  const response = await fetchPublic(url, {
    headers,
    accept:
      'application/rss+xml,application/atom+xml,application/feed+json,application/xml,text/xml',
  });
  if (response.status === 304) return { title: '', url, entries: [], notModified: true };
  if (response.headers.get('content-type')?.includes('text/html'))
    throw new ProviderError('unsupported_feed', false);
  return {
    ...parseFeed(response.text, response.url),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

export async function resolveSource(env: Env, owner: string, url: string) {
  const epoch = await operationGeneration(env, owner);
  const identity = await contentIdentity(url);
  // Provider adapters add explicit routes. Generic feed discovery does not invent
  // a subscription mechanism for a site that does not publish one.
  if (identity.platform === 'spotify') {
    const source = await spotifySource(env, url);
    const sourceId = await stableId('src', owner, source.url);
    const routeId = await stableId('route', sourceId, source.url);
    const timestamp = now();
    await atomicOwnerWrite(
      env,
      owner,
      [
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO sources(id,owner_id,identity_key,platform,url,name,created_at) VALUES(?,?,?,?,?,?,?)',
          sourceId,
          owner,
          source.url,
          'spotify',
          source.url,
          source.name,
          timestamp
        ),
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO source_routes(id,source_id,url,kind) VALUES(?,?,?,?)',
          routeId,
          sourceId,
          source.url,
          source.kind
        ),
      ],
      epoch
    );
    return {
      id: sourceId,
      name: source.name,
      url: source.url,
      routes: [{ id: routeId, url: source.url, kind: source.kind, name: source.name }],
    };
  }
  if (identity.platform === 'youtube') {
    const source = await youtubeSource(env, url, owner);
    const sourceId = await stableId('src', owner, source.url);
    const routeId = await stableId('route', sourceId, source.feedUrl);
    const timestamp = now();
    await atomicOwnerWrite(
      env,
      owner,
      [
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO sources(id,owner_id,identity_key,platform,url,name,created_at) VALUES(?,?,?,?,?,?,?)',
          sourceId,
          owner,
          source.url,
          'youtube',
          source.url,
          source.name,
          timestamp
        ),
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO source_routes(id,source_id,url,kind) VALUES(?,?,?,?)',
          routeId,
          sourceId,
          source.feedUrl,
          source.kind
        ),
      ],
      epoch
    );
    return {
      id: sourceId,
      name: source.name,
      url: source.url,
      routes: [{ id: routeId, url: source.feedUrl, kind: source.kind, name: source.name }],
    };
  }
  if (identity.platform === 'x') {
    const source = await xSource(env, url);
    const identityKey = `x:${source.kind === 'x_list' ? 'list' : 'account'}:${source.externalId}`;
    const existing = await stmt(
      env.DB,
      'SELECT id FROM sources WHERE owner_id=? AND identity_key=?',
      owner,
      identityKey
    ).first<{ id: string }>();
    const sourceId = existing?.id ?? (await stableId('src', owner, identityKey));
    const previousRoute = await stmt(
      env.DB,
      'SELECT id FROM source_routes WHERE source_id=? AND kind=?',
      sourceId,
      source.kind
    ).first<{ id: string }>();
    const routeId = previousRoute?.id ?? (await stableId('route', sourceId, identityKey));
    const timestamp = now();
    await atomicOwnerWrite(
      env,
      owner,
      [
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO sources(id,owner_id,identity_key,platform,url,name,created_at) VALUES(?,?,?,?,?,?,?)',
          sourceId,
          owner,
          identityKey,
          'x',
          source.url,
          source.name,
          timestamp
        ),
        stmt(
          env.DB,
          'INSERT INTO source_routes(id,source_id,url,kind,external_id) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,external_id=excluded.external_id',
          routeId,
          sourceId,
          source.url,
          source.kind,
          source.externalId
        ),
      ],
      epoch
    );
    await atomicOwnerWrite(
      env,
      owner,
      [
        stmt(
          env.DB,
          'UPDATE sources SET url=?,name=? WHERE id=? AND owner_id=?',
          source.url,
          source.name,
          sourceId,
          owner
        ),
      ],
      epoch
    );
    return {
      id: sourceId,
      name: source.name,
      url: source.url,
      routes: [{ id: routeId, url: source.url, kind: source.kind, name: source.name }],
    };
  }
  let feeds: Feed[] = [];
  try {
    feeds = [await feedAt(identity.url)];
  } catch (error) {
    if (error instanceof ProviderError && error.code === 'unsupported_feed') {
      const page = await extractWeb(identity.url);
      const candidates = [...page.feedUrls];
      if (identity.platform === 'substack' && !candidates.length)
        candidates.push(new URL('/feed', identity.url).toString());
      for (const feedUrl of candidates.slice(0, 10)) {
        try {
          feeds.push(await feedAt(feedUrl));
        } catch {
          /* A broken alternate is not a working delivery route. */
        }
      }
    } else throw error;
  }
  if (!feeds.length)
    throw new ApiError(
      422,
      'no_delivery_route',
      'No supported feed was discovered for this source'
    );
  const sourceId = await stableId('src', owner, feeds[0].homeUrl ?? feeds[0].url);
  const timestamp = now();
  const writes = [
    stmt(
      env.DB,
      'INSERT OR IGNORE INTO sources(id,owner_id,identity_key,platform,url,name,created_at) VALUES(?,?,?,?,?,?,?)',
      sourceId,
      owner,
      feeds[0].homeUrl ?? feeds[0].url,
      identity.platform === 'substack' ? 'substack' : 'rss',
      feeds[0].homeUrl ?? identity.url,
      feeds[0].title,
      timestamp
    ),
  ];
  const routes = [];
  for (const feed of feeds) {
    const routeId = await stableId('route', sourceId, feed.url);
    writes.push(
      stmt(
        env.DB,
        'INSERT OR IGNORE INTO source_routes(id,source_id,url,kind) VALUES(?,?,?,?)',
        routeId,
        sourceId,
        feed.url,
        'feed'
      )
    );
    routes.push({ id: routeId, url: feed.url, kind: 'feed', name: feed.title });
  }
  await atomicOwnerWrite(env, owner, writes, epoch);
  return { id: sourceId, name: feeds[0].title, url: feeds[0].homeUrl ?? identity.url, routes };
}

/** Automatic arrival never changes an existing lifecycle decision. */
export async function ingestEntry(
  env: Env,
  subscription: SubscriptionRow,
  entry: FeedEntry
): Promise<{ itemId: string; created: boolean }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await ingestOnce(env, subscription, entry);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'identity_changed') continue;
      throw e;
    }
  }
  throw new ApiError(409, 'identity_changed', 'Identity changed concurrently; retry intake');
}
async function ingestOnce(env: Env, subscription: SubscriptionRow, entry: FeedEntry) {
  const owner = subscription.owner_id;
  const { content, itemId } = await personalContentIdentity(env, owner, entry.url);
  const occurrenceId = await stableId('sav', subscription.id, entry.id);
  const timestamp = now();
  const epoch = await ownerGeneration(env, owner);
  const revision = (subscription as SubscriptionRow & { revision?: number }).revision ?? 0;
  const lease =
    (subscription as SubscriptionRow & { sync_lease_token?: string | null }).sync_lease_token ?? '';
  const feedSourceUrl = await stmt(
    env.DB,
    'SELECT url FROM source_routes WHERE id=? AND source_id=?',
    subscription.route_id,
    subscription.source_id
  ).first<string>('url');
  const serialized = JSON.stringify(entry);
  let inputKey: string | undefined;
  let retainInput = false;
  const alreadySeen = await stmt(
    env.DB,
    'SELECT entry_key FROM subscription_seen WHERE subscription_id=? AND entry_key=?',
    subscription.id,
    entry.id
  ).first();
  if (alreadySeen) return { itemId, created: false };
  const prior = await stmt(
    env.DB,
    'SELECT status FROM personal_items WHERE id=? AND owner_id=?',
    itemId,
    owner
  ).first<{ status: string }>();
  if (new TextEncoder().encode(serialized).length > 64000 && prior?.status !== 'deleted') {
    inputKey = `feed-input/${subscription.id}/${id('entry')}.json`;
    const registered = await stmt(
      env.DB,
      "INSERT INTO subscription_snapshots(artifact_key,subscription_id,created_at) SELECT ?,?,? FROM subscriptions WHERE id=? AND owner_id=? AND status='active' AND revision=?",
      inputKey,
      subscription.id,
      timestamp,
      subscription.id,
      owner,
      revision
    ).run();
    if (!registered.meta.changes)
      throw new ApiError(
        409,
        'subscription_changed',
        'Subscription changed before retaining input'
      );
    try {
      await reserveArtifactUsage(env, owner, serialized);
      await env.ARTIFACTS.put(inputKey, serialized, {
        httpMetadata: { contentType: 'application/json' },
      });
    } catch (error) {
      await stmt(
        env.DB,
        'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) VALUES(?,?)',
        inputKey,
        timestamp
      )
        .run()
        .catch(() => {});
      throw error;
    }
  }
  try {
    const result = await atomicItemWrite(env, owner, itemId, async (existing) => {
      retainInput = false;
      const initialGeneration = await ownerGeneration(env, owner);
      const seen = await stmt(
        env.DB,
        'SELECT entry_key FROM subscription_seen WHERE subscription_id=? AND entry_key=?',
        subscription.id,
        entry.id
      ).first();
      if (seen) return { statements: [], result: { itemId, created: false } };
      if ((await ownerGeneration(env, owner)) !== epoch)
        throw new ApiError(409, 'account_data_erased', 'Account data was erased during intake');
      const current = await stmt(
        env.DB,
        'SELECT revision,status,sync_lease_token,sync_lease_until FROM subscriptions WHERE id=? AND owner_id=?',
        subscription.id,
        owner
      ).first<{
        revision: number;
        status: string;
        sync_lease_token: string | null;
        sync_lease_until: string | null;
      }>();
      if (
        !current ||
        current.status !== 'active' ||
        current.revision !== revision ||
        (current.sync_lease_token ?? '') !== lease ||
        (lease && (!current.sync_lease_until || current.sync_lease_until <= now()))
      )
        throw new ApiError(
          409,
          'subscription_changed',
          'Subscription or its lease changed during intake'
        );
      const guard = id('guard');
      const statements = [
        stmt(
          env.DB,
          "INSERT INTO write_guards(id,valid) SELECT ?,COALESCE((SELECT revision FROM subscriptions WHERE id=? AND owner_id=? AND status='active'),-1)=? AND COALESCE((SELECT sync_lease_token FROM subscriptions WHERE id=?),'')=? AND (?='' OR (SELECT sync_lease_until FROM subscriptions WHERE id=?)>?) AND COALESCE((SELECT generation FROM owner_generations WHERE owner_id=?),0)=?",
          guard,
          subscription.id,
          owner,
          revision,
          subscription.id,
          lease,
          lease,
          subscription.id,
          now(),
          owner,
          epoch
        ),
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO content_items(id,identity_key,canonical_url,platform,kind,created_at) VALUES(?,?,?,?,?,?)',
          content.id,
          content.key,
          content.url,
          content.platform,
          content.kind,
          timestamp
        ),
        stmt(
          env.DB,
          "INSERT OR IGNORE INTO personal_items(id,owner_id,content_id,status,created_at,saved_at,updated_at,content_type,generation,decision_at,decision_origin) VALUES(?,?,?,?,?,?,?,?,?,?,'automatic')",
          itemId,
          owner,
          content.id,
          subscription.auto_save ? 'saved' : 'received',
          timestamp,
          subscription.auto_save ? timestamp : null,
          timestamp,
          entry.kind,
          initialGeneration,
          timestamp
        ),
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO subscription_seen(subscription_id,entry_key) VALUES(?,?)',
          subscription.id,
          entry.id
        ),
        stmt(env.DB, 'UPDATE personal_items SET revision=revision+1 WHERE id=?', itemId),
      ];
      if (existing?.status !== 'deleted') {
        statements.push(
          stmt(
            env.DB,
            'INSERT OR IGNORE INTO save_occurrences(id,owner_id,item_id,contributor,route,subscription_id,created_at,input_url) VALUES(?,?,?,?,?,?,?,?)',
            occurrenceId,
            owner,
            itemId,
            'zine:subscription',
            'subscription',
            subscription.id,
            timestamp,
            entry.url
          )
        );
        retainInput = true;
        statements.push(
          stmt(
            env.DB,
            `INSERT INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES(?,?,?,'enrich',?,'pending',?,?,?)`,
            await stableId('job', subscription.id, entry.id),
            owner,
            itemId,
            JSON.stringify({
              contentId: content.id,
              url: content.url,
              generation: existing?.generation ?? initialGeneration,
              metadataOnly: !!existing,
              feedSourceUrl: feedSourceUrl ?? entry.url,
              ...(inputKey ? { feedEntryArtifactKey: inputKey } : { feedEntry: entry }),
            }),
            timestamp,
            timestamp,
            timestamp
          )
        );
      }
      if (existing?.status !== 'deleted' && entry.transcripts.length)
        statements.push(
          stmt(
            env.DB,
            `INSERT INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES(?,?,?,'enrich',?,'pending',?,?,?)`,
            await stableId('job_transcript', subscription.id, entry.id),
            owner,
            itemId,
            JSON.stringify({
              stage: 'published-transcript',
              url: entry.transcripts[0].url,
              references: entry.transcripts,
              generation: existing?.generation ?? initialGeneration,
            }),
            timestamp,
            timestamp,
            timestamp
          )
        );
      statements.push(stmt(env.DB, 'DELETE FROM write_guards WHERE id=?', guard));
      return { statements, result: { itemId, created: !existing } };
    });
    if (inputKey && !retainInput)
      await stmt(
        env.DB,
        'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) VALUES(?,?)',
        inputKey,
        timestamp
      ).run();
    return result;
  } catch (error) {
    if (inputKey)
      await stmt(
        env.DB,
        'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) VALUES(?,?)',
        inputKey,
        timestamp
      )
        .run()
        .catch(() => {});
    throw error;
  }
}

interface SyncCursor {
  page: number | string | null;
  startedAt: string;
  candidate?: FeedEntry;
  revision: number;
  pending?: FeedEntry[];
  following?: number | string | null;
  visited?: string[];
  ordered?: boolean;
  stopAfterPage?: boolean;
  etag?: string | null;
  lastModified?: string | null;
}
export interface SourcePage extends Feed {
  nextOffset?: number | null;
  nextCursor?: string;
  notModified?: boolean;
  newestFirst?: boolean;
  etag?: string | null;
  lastModified?: string | null;
}
async function subscriptionPage(
  env: Env,
  route: { url: string; kind: string; external_id?: string | null },
  page: SyncCursor['page'],
  owner?: string,
  headers: Record<string, string> = {}
): Promise<SourcePage> {
  if (route.kind === 'youtube_playlist')
    return youtubePlaylistPage(env, owner, route.url, typeof page === 'string' ? page : undefined);
  if (route.kind.startsWith('spotify_'))
    return spotifySourcePage(env, route.url, typeof page === 'number' ? page : 0);
  if (route.kind.startsWith('x_'))
    return xSourcePage(
      env,
      route.url,
      typeof page === 'string' ? page : undefined,
      route.external_id ?? undefined
    );
  if (!['feed', 'youtube_feed'].includes(route.kind))
    throw new ProviderError('provider_route_not_implemented', false);
  const feed = await feedAt(typeof page === 'string' ? page : route.url, headers);
  if (route.kind === 'youtube_feed') for (const entry of feed.entries) entry.kind = 'video';
  return feed;
}

/** One durable page per invocation keeps large sources within Worker limits.
 * A checkpoint and continuation job commit together; retried entries are deduplicated. */
export async function syncSubscription(
  env: Env,
  subscriptionId: string,
  owner: string,
  loadPage: typeof subscriptionPage = subscriptionPage
) {
  const lease = id('synclease');
  const timestamp = now();
  const claimed = await stmt(
    env.DB,
    "UPDATE subscriptions SET sync_lease_token=?,sync_lease_until=? WHERE id=? AND owner_id=? AND status='active' AND (sync_lease_until IS NULL OR sync_lease_until<?)",
    lease,
    new Date(Date.now() + 5 * 60000).toISOString(),
    subscriptionId,
    owner,
    timestamp
  ).run();
  if (!claimed.meta.changes) return { received: 0, status: 'busy_or_unsubscribed' };
  try {
    const subscription = await subscriptionOwned(env, owner, subscriptionId);
    const intakeSince = subscription.intake_since_at ?? subscription.created_at;
    const revision = (subscription as SubscriptionRow & { revision: number }).revision;
    const route = await stmt(
      env.DB,
      'SELECT url,kind,external_id FROM source_routes WHERE id=? AND source_id=?',
      subscription.route_id,
      subscription.source_id
    ).first<{ url: string; kind: string; external_id: string | null }>();
    if (!route) throw new ProviderError('source_route_missing', false);
    const pointer = subscription.cursor_json
      ? (JSON.parse(subscription.cursor_json) as { stateKey: string })
      : null;
    const previousObject = pointer ? await env.ARTIFACTS.get(pointer.stateKey) : null;
    if (pointer && !previousObject) throw new ProviderError('sync_checkpoint_missing', false);
    const previous = previousObject ? await previousObject.json<SyncCursor>() : null;
    const cursor: SyncCursor =
      previous?.revision === revision ? previous : { page: null, startedAt: timestamp, revision };
    if (!cursor.pending) {
      const pageKey = JSON.stringify(cursor.page);
      if (cursor.visited?.includes(pageKey))
        throw new ProviderError('source_pagination_cycle', false);
      cursor.visited = [...(cursor.visited ?? []), pageKey];
      if (cursor.visited.length > 10000) throw new ProviderError('source_page_limit', false);
      const conditional: Record<string, string> = {};
      if (subscription.initialized && cursor.page === null) {
        if (subscription.feed_etag) conditional['if-none-match'] = subscription.feed_etag;
        if (subscription.feed_last_modified)
          conditional['if-modified-since'] = subscription.feed_last_modified;
      }
      const fetched = await loadPage(env, route, cursor.page, owner, conditional);
      if (fetched.notModified) {
        await stmt(
          env.DB,
          'UPDATE subscriptions SET last_success_at=?,last_error_code=NULL,next_poll_at=?,updated_at=? WHERE id=? AND revision=? AND sync_lease_token=?',
          now(),
          new Date(Date.now() + 15 * 60000).toISOString(),
          now(),
          subscriptionId,
          revision,
          lease
        ).run();
        return { received: 0, status: 'not_modified' };
      }
      if (cursor.page === null) {
        cursor.etag = fetched.etag;
        cursor.lastModified = fetched.lastModified;
      }
      cursor.ordered = !!fetched.newestFirst;
      cursor.stopAfterPage = false;
      if (subscription.initialized && cursor.ordered && fetched.entries.length) {
        const seen = await stmt(
          env.DB,
          'SELECT entry_key FROM subscription_seen WHERE subscription_id=? AND entry_key IN(SELECT value FROM json_each(?)) LIMIT 1',
          subscriptionId,
          JSON.stringify(fetched.entries.map((entry) => entry.id))
        ).first();
        cursor.stopAfterPage = !!seen;
      }
      cursor.pending = fetched.entries;
      cursor.following = fetched.nextOffset ?? fetched.nextCursor ?? fetched.nextUrl ?? null;
      if (cursor.following !== null && cursor.following === cursor.page)
        throw new ProviderError('source_pagination_cycle', false);
    }
    // Keep every original entry in a private snapshot, but process a bounded
    // slice so large feeds cannot exceed a Worker's D1 subrequest budget.
    const hasNewArrivals = cursor.pending.some(
      (entry) => (entry.eventAt ?? entry.publishedAt ?? '') >= intakeSince
    );
    const batchLimit = subscription.initialized || hasNewArrivals ? 20 : 500;
    const feed = { entries: cursor.pending.slice(0, batchLimit) };
    const selection = JSON.parse(subscription.filters_json) as z.infer<typeof filters>;
    const matches = newestFirst(feed.entries).filter(
      (entry) => !selection.types?.length || selection.types.includes(entry.kind as never)
    );
    const stillActive = async () =>
      !!(await stmt(
        env.DB,
        "SELECT id FROM subscriptions WHERE id=? AND owner_id=? AND status='active' AND revision=? AND sync_lease_token=?",
        subscriptionId,
        owner,
        revision,
        lease
      ).first());
    let received = 0;
    if (!(await stillActive())) return { received, status: 'settings_changed' };
    // The creation time is the subscription boundary, even if its first poll is delayed.
    // Keep every matching arrival since that boundary, plus one preceding item.
    const baseline = matches.filter((entry) => {
      const arrival = entry.eventAt ?? entry.publishedAt;
      return !arrival || arrival < intakeSince;
    });
    if (!subscription.initialized) {
      cursor.candidate = newestFirst([
        ...(cursor.candidate ? [cursor.candidate] : []),
        ...baseline,
      ])[0];
    }
    for (const entry of matches) {
      const arrival = entry.eventAt ?? entry.publishedAt;
      const cutoff =
        entry.eventAt || !entry.publishedPrecision
          ? intakeSince
          : entry.publishedPrecision === 'year'
            ? `${intakeSince.slice(0, 4)}-01-01T00:00:00.000Z`
            : entry.publishedPrecision === 'month'
              ? `${intakeSince.slice(0, 7)}-01T00:00:00.000Z`
              : `${intakeSince.slice(0, 10)}T00:00:00.000Z`;
      if (!subscription.initialized && (!arrival || arrival < intakeSince)) continue;
      if (subscription.initialized && arrival && arrival < cutoff) continue;
      if (!(await stillActive())) return { received, status: 'settings_changed' };
      const result = await ingestEntry(env, subscription, entry);
      if (result.created) received++;
    }
    // Baseline nonmatching entries too, so filter changes never become a backfill.
    for (let offset = 0; offset < feed.entries.length; offset += 100)
      await env.DB.batch(
        feed.entries
          .slice(offset, offset + 100)
          .map((entry) =>
            stmt(
              env.DB,
              'INSERT OR IGNORE INTO subscription_seen(subscription_id,entry_key) VALUES(?,?)',
              subscriptionId,
              entry.id
            )
          )
      );
    cursor.pending = cursor.pending.slice(batchLimit);
    const hasPending = cursor.pending.length > 0;
    const stop =
      cursor.stopAfterPage || (!subscription.initialized && cursor.ordered && !!cursor.candidate);
    const next = hasPending ? cursor.page : stop ? null : (cursor.following ?? null);
    const more = hasPending || next !== null;
    if (!more && !subscription.initialized && cursor.candidate) {
      if (!(await stillActive())) return { received, status: 'settings_changed' };
      // Candidate was baselined above. Remove just its seen marker before the
      // atomic ingestion; a crash is safe because the personal item is durable.
      await stmt(
        env.DB,
        'DELETE FROM subscription_seen WHERE subscription_id=? AND entry_key=?',
        subscriptionId,
        cursor.candidate.id
      ).run();
      const result = await ingestEntry(env, subscription, cursor.candidate);
      if (result.created) received++;
    }
    if (!(await stillActive())) return { received, status: 'settings_changed' };
    const finished = now();
    let stateKey: string | null = null;
    if (more) {
      stateKey = `subscriptions/${subscriptionId}/${id('page')}.json`;
      await stmt(
        env.DB,
        'INSERT INTO subscription_snapshots(artifact_key,subscription_id,created_at) VALUES(?,?,?)',
        stateKey,
        subscriptionId,
        finished
      ).run();
      const checkpointBody = JSON.stringify({
        ...cursor,
        page: next,
        ...(!hasPending ? { pending: undefined, following: undefined } : {}),
      });
      await reserveArtifactUsage(env, owner, checkpointBody);
      await env.ARTIFACTS.put(stateKey, checkpointBody, {
        httpMetadata: { contentType: 'application/json' },
      });
    }
    const checkpoint = stmt(
      env.DB,
      'UPDATE subscriptions SET cursor_json=?,initialized=?,last_success_at=?,last_error_code=NULL,next_poll_at=?,updated_at=?,feed_etag=?,feed_last_modified=? WHERE id=? AND owner_id=? AND revision=? AND sync_lease_token=? AND sync_lease_until>?',
      stateKey ? JSON.stringify({ stateKey }) : null,
      more ? subscription.initialized : 1,
      more ? subscription.last_success_at : finished,
      more ? finished : new Date(Date.now() + 15 * 60000).toISOString(),
      finished,
      more ? (subscription.feed_etag ?? null) : (cursor.etag ?? null),
      more ? (subscription.feed_last_modified ?? null) : (cursor.lastModified ?? null),
      subscriptionId,
      owner,
      revision,
      lease,
      now()
    );
    const checkpointGuard = id('checkpoint');
    const writes = [
      stmt(
        env.DB,
        "INSERT INTO write_guards(id,valid) SELECT ?,EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND owner_id=? AND status='active' AND revision=? AND sync_lease_token=? AND sync_lease_until>?)",
        checkpointGuard,
        subscriptionId,
        owner,
        revision,
        lease,
        now()
      ),
      checkpoint,
    ];
    if (more)
      writes.push(
        stmt(
          env.DB,
          "INSERT INTO jobs(id,owner_id,kind,payload_json,status,available_at,created_at,updated_at) SELECT ?,?,'sync',?,'pending',?,?,? WHERE EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND revision=? AND sync_lease_token=?)",
          id('job'),
          owner,
          JSON.stringify({ subscriptionId }),
          finished,
          finished,
          finished,
          subscriptionId,
          revision,
          lease
        )
      );
    writes.push(stmt(env.DB, 'DELETE FROM write_guards WHERE id=?', checkpointGuard));
    try {
      await env.DB.batch(writes);
    } catch (error) {
      if (String(error).includes('CHECK constraint failed: valid=1'))
        throw new ApiError(
          409,
          'subscription_changed',
          'The subscription lease changed before checkpoint commit'
        );
      throw error;
    }
    return { received, status: more ? 'continuing' : 'active' };
  } finally {
    await stmt(
      env.DB,
      'UPDATE subscriptions SET sync_lease_token=NULL,sync_lease_until=NULL WHERE id=? AND sync_lease_token=?',
      subscriptionId,
      lease
    ).run();
  }
}

export const subscriptionRoutes = new Hono<AppEnv>();
subscriptionRoutes.post('/sources/resolve', async (c) =>
  c.json(
    await resolveSource(
      c.env,
      c.get('principal').userId,
      (await parseBody(c.req.raw, z.object({ url: z.string().max(8192) }).strict())).url
    )
  )
);
subscriptionRoutes.get('/sources', async (c) => {
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(c.req.query('limit'));
  const rows = await all<{ id: string }>(
    c.env.DB,
    'SELECT id,name,url,platform FROM sources WHERE owner_id=? AND id>? ORDER BY id LIMIT ?',
    c.get('principal').userId,
    c.req.query('cursor') ?? '',
    limit + 1
  );
  const sources = rows.slice(0, limit);
  return c.json({ sources, nextCursor: rows.length > limit ? sources.at(-1)!.id : null });
});
subscriptionRoutes.get('/sources/:sourceId', async (c) => {
  const source = await sourceOwned(c.env, c.get('principal').userId, c.req.param('sourceId'));
  return c.json({
    ...source,
    routes: await all(
      c.env.DB,
      'SELECT id,url,kind,external_id AS providerId FROM source_routes WHERE source_id=? ORDER BY id',
      c.req.param('sourceId')
    ),
  });
});
subscriptionRoutes.post('/subscriptions', async (c) => {
  const input = await parseBody(c.req.raw, subscribeSchema);
  const owner = c.get('principal').userId;
  await sourceOwned(c.env, owner, input.sourceId);
  if (
    !(await stmt(
      c.env.DB,
      'SELECT id FROM source_routes WHERE id=? AND source_id=?',
      input.routeId,
      input.sourceId
    ).first())
  )
    throw new ApiError(404, 'not_found', 'Source route not found');
  const subscriptionId = id('sub');
  const jobId = id('job');
  const timestamp = now();
  await atomicOwnerWrite(c.env, owner, [
    stmt(
      c.env.DB,
      "INSERT INTO subscriptions(id,owner_id,source_id,route_id,auto_save,filters_json,status,next_poll_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',?,?,?)",
      subscriptionId,
      owner,
      input.sourceId,
      input.routeId,
      input.autoSave ? 1 : 0,
      JSON.stringify(input.filters),
      timestamp,
      timestamp,
      timestamp
    ),
    stmt(
      c.env.DB,
      "INSERT INTO jobs(id,owner_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES(?,?,'sync',?,'pending',?,?,?)",
      jobId,
      owner,
      JSON.stringify({ subscriptionId }),
      timestamp,
      timestamp,
      timestamp
    ),
  ]);
  c.executionCtx.waitUntil(
    c.env.JOBS.send({ jobId }).catch(() =>
      console.warn(JSON.stringify({ event: 'outbox_delivery_failed', jobId }))
    )
  );
  return c.json({ id: subscriptionId, ...input, status: 'active', jobId }, 201);
});
subscriptionRoutes.get('/subscriptions', async (c) => {
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(c.req.query('limit'));
  const status = z.enum(['active', 'unsubscribed']).optional().parse(c.req.query('status'));
  const rows = await all<SubscriptionRow>(
    c.env.DB,
    `SELECT * FROM subscriptions WHERE owner_id=? AND id>? ${status ? 'AND status=?' : ''} ORDER BY id LIMIT ?`,
    c.get('principal').userId,
    c.req.query('cursor') ?? '',
    ...(status ? [status] : []),
    limit + 1
  );
  const page = rows.slice(0, limit);
  return c.json({
    subscriptions: page.map(subscriptionView),
    nextCursor: rows.length > limit ? page.at(-1)!.id : null,
  });
});
subscriptionRoutes.get('/subscriptions/:subscriptionId', async (c) =>
  c.json(
    subscriptionView(
      await subscriptionOwned(c.env, c.get('principal').userId, c.req.param('subscriptionId'))
    )
  )
);
subscriptionRoutes.patch('/subscriptions/:subscriptionId', async (c) => {
  const input = await parseBody(
    c.req.raw,
    z
      .object({
        autoSave: z.boolean().optional(),
        filters: filters.optional(),
        status: z.enum(['active', 'unsubscribed']).optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, 'At least one change is required')
  );
  const owner = c.get('principal').userId;
  const subscriptionId = c.req.param('subscriptionId');
  await subscriptionOwned(c.env, owner, subscriptionId);
  await stmt(
    c.env.DB,
    'UPDATE subscriptions SET auto_save=COALESCE(?,auto_save),filters_json=COALESCE(?,filters_json),status=COALESCE(?,status),revision=revision+1,cursor_json=NULL,updated_at=? WHERE id=? AND owner_id=?',
    input.autoSave === undefined ? null : input.autoSave ? 1 : 0,
    input.filters ? JSON.stringify(input.filters) : null,
    input.status ?? null,
    now(),
    subscriptionId,
    owner
  ).run();
  return c.json(subscriptionView(await subscriptionOwned(c.env, owner, subscriptionId)));
});
subscriptionRoutes.delete('/subscriptions/:subscriptionId', async (c) => {
  const owner = c.get('principal').userId;
  const subscriptionId = c.req.param('subscriptionId');
  await subscriptionOwned(c.env, owner, subscriptionId);
  await stmt(
    c.env.DB,
    "UPDATE subscriptions SET status='unsubscribed',revision=revision+1,cursor_json=NULL,updated_at=? WHERE id=? AND owner_id=?",
    now(),
    subscriptionId,
    owner
  ).run();
  return c.body(null, 204);
});
subscriptionRoutes.post('/subscriptions/:subscriptionId/sync', async (c) => {
  const owner = c.get('principal').userId;
  const subscriptionId = c.req.param('subscriptionId');
  const subscription = await subscriptionOwned(c.env, owner, subscriptionId);
  if (subscription.status !== 'active')
    throw new ApiError(409, 'unsubscribed', 'Reactivate the subscription before syncing');
  const jobId = id('job');
  const timestamp = now();
  await atomicOwnerWrite(c.env, owner, [
    stmt(
      c.env.DB,
      "INSERT INTO jobs(id,owner_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES(?,?,'sync',?,'pending',?,?,?)",
      jobId,
      owner,
      JSON.stringify({ subscriptionId }),
      timestamp,
      timestamp,
      timestamp
    ),
  ]);
  c.executionCtx.waitUntil(
    c.env.JOBS.send({ jobId }).catch(() =>
      console.warn(JSON.stringify({ event: 'outbox_delivery_failed', jobId }))
    )
  );
  return c.json({ jobId, status: 'pending' }, 202);
});
