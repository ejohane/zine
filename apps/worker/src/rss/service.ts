import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { Provider, UserItemState } from '@zine/shared';

import { createDb, type Database } from '../db';
import { items, providerItemsSeen, rssFeedItems, rssFeeds, userItems } from '../db/schema';
import { transformRssEntry } from '../ingestion/transformers';
import { getOrCreateCreator } from '../ingestion/processor/creators';
import { prepareItem } from '../ingestion/processor/prepare';
import { fetchLinkPreview } from '../lib/link-preview';
import { logger } from '../lib/logger';
import { releaseLock, tryAcquireLock } from '../lib/locks';
import type { Bindings } from '../types';
import { parseRssFeedXml, type ParsedRssEntry, type ParsedRssFeed } from './parser';
import { normalizeFeedUrl } from './url';

const rssLogger = logger.child('rss');

const FEED_FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 1_500_000;
const MAX_ENTRIES_PER_SYNC = 20;
const ERROR_THRESHOLD = 10;

const RSS_POLL_LOCK_KEY = 'cron:poll-rss:lock';
const RSS_POLL_LOCK_TTL = 900;
const RSS_POLL_BATCH_SIZE = 50;

type RssFeedRow = typeof rssFeeds.$inferSelect;

export interface SyncRssFeedResult {
  newItems: number;
  processedEntries: number;
  skipped: boolean;
  reason?: string;
}

export interface RssPollResult {
  skipped: boolean;
  processedFeeds: number;
  newItems: number;
  reason?: string;
}

interface FetchFeedResult {
  notModified: boolean;
  parsed?: ParsedRssFeed;
  etag: string | null;
  lastModified: string | null;
}

interface SyncOptions {
  maxEntries?: number;
  useConditional?: boolean;
}

async function fetchFeed(feed: RssFeedRow, useConditional: boolean): Promise<FetchFeedResult> {
  const headers = new Headers({
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    'User-Agent': 'ZineRSSBot/1.0 (+https://myzine.app)',
  });

  if (useConditional && feed.etag) {
    headers.set('If-None-Match', feed.etag);
  }
  if (useConditional && feed.lastModified) {
    headers.set('If-Modified-Since', feed.lastModified);
  }

  const response = await fetch(feed.feedUrl, {
    method: 'GET',
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
  });

  if (response.status === 304) {
    return {
      notModified: true,
      etag: feed.etag ?? response.headers.get('etag'),
      lastModified: feed.lastModified ?? response.headers.get('last-modified'),
    };
  }

  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const payload = await response.arrayBuffer();
  if (payload.byteLength > MAX_FEED_BYTES) {
    throw new Error(`Feed payload too large (${payload.byteLength} bytes)`);
  }

  const xml = new TextDecoder().decode(payload);
  const parsed = parseRssFeedXml(xml, feed.feedUrl);

  return {
    notModified: false,
    parsed,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

function sortEntriesByPublishDate(entries: ParsedRssEntry[]): ParsedRssEntry[] {
  return [...entries].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
}

function looksLikeHtml(value: string | null | undefined): boolean {
  if (!value) return false;
  return /<[^>]+>/.test(value);
}

async function enrichRssEntryMetadata(
  entry: ParsedRssEntry,
  feedId: string
): Promise<ParsedRssEntry> {
  const shouldFetchPreview =
    looksLikeHtml(entry.summary) || !entry.imageUrl || !entry.creatorImageUrl;

  if (!shouldFetchPreview) {
    return entry;
  }

  try {
    const preview = await fetchLinkPreview(entry.canonicalUrl);

    if (!preview) {
      return entry;
    }

    return {
      ...entry,
      canonicalUrl: preview.canonicalUrl || entry.canonicalUrl,
      title: preview.title || entry.title,
      summary: preview.description ?? entry.summary,
      creator: preview.creator || entry.creator,
      creatorImageUrl: preview.creatorImageUrl ?? entry.creatorImageUrl,
      imageUrl: preview.thumbnailUrl ?? entry.imageUrl,
    };
  } catch (error) {
    rssLogger.warn('Failed to enrich RSS entry with preview metadata', {
      feedId,
      canonicalUrl: entry.canonicalUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return entry;
  }
}

async function upsertFeedItemMapping(params: {
  db: Database;
  rssFeedId: string;
  itemId: string;
  entryId: string;
  entryUrl?: string;
  publishedAt?: number;
}) {
  await params.db
    .insert(rssFeedItems)
    .values({
      id: ulid(),
      rssFeedId: params.rssFeedId,
      itemId: params.itemId,
      entryId: params.entryId,
      entryUrl: params.entryUrl ?? null,
      publishedAt: params.publishedAt ?? null,
      fetchedAt: Date.now(),
    })
    .onConflictDoNothing();
}

type CanonicalMetadataRow = {
  id: string;
  thumbnailUrl: string | null;
  summary: string | null;
  creatorId: string | null;
};

function buildCanonicalMetadataUpdates(params: {
  canonical: CanonicalMetadataRow;
  transformed: { imageUrl?: string; description?: string };
  creatorId: string | null;
  nowISO: string;
}): {
  thumbnailUrl?: string;
  summary?: string;
  creatorId?: string;
  updatedAt?: string;
} {
  const { canonical, transformed, creatorId, nowISO } = params;
  const updates: {
    thumbnailUrl?: string;
    summary?: string;
    creatorId?: string;
    updatedAt?: string;
  } = {};

  if (!canonical.thumbnailUrl && transformed.imageUrl) {
    updates.thumbnailUrl = transformed.imageUrl;
  }

  if ((!canonical.summary || looksLikeHtml(canonical.summary)) && transformed.description) {
    updates.summary = transformed.description;
  }

  if (!canonical.creatorId && creatorId) {
    updates.creatorId = creatorId;
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = nowISO;
  }

  return updates;
}

async function ingestEntry(params: {
  db: Database;
  userId: string;
  feedId: string;
  entry: ParsedRssEntry;
}): Promise<boolean> {
  const { db, userId, feedId, entry } = params;
  const enrichedEntry = await enrichRssEntryMetadata(entry, feedId);

  const prepared = await prepareItem({
    context: { userId, provider: Provider.RSS, db },
    rawItem: enrichedEntry,
    transformFn: transformRssEntry,
    backfillOnSeen: true,
  });

  const nowISO = new Date().toISOString();
  const now = Date.now();

  if (prepared.status === 'skipped') {
    const canonical = await db.query.items.findFirst({
      where: and(eq(items.provider, 'RSS'), eq(items.providerId, enrichedEntry.providerId)),
      columns: { id: true, thumbnailUrl: true, summary: true, creatorId: true },
    });

    if (canonical) {
      const transformedEntry = transformRssEntry(enrichedEntry);
      const creatorId = await getOrCreateCreator(db, 'RSS', enrichedEntry, transformedEntry);
      const itemUpdates = buildCanonicalMetadataUpdates({
        canonical,
        transformed: transformedEntry,
        creatorId,
        nowISO,
      });

      if (Object.keys(itemUpdates).length > 0) {
        await db.update(items).set(itemUpdates).where(eq(items.id, canonical.id));
      }

      await upsertFeedItemMapping({
        db,
        rssFeedId: feedId,
        itemId: canonical.id,
        entryId: enrichedEntry.entryId,
        entryUrl: enrichedEntry.canonicalUrl,
        publishedAt: enrichedEntry.publishedAt,
      });
    }

    return false;
  }

  const statements: unknown[] = [];

  if (!prepared.item.canonicalItemExists) {
    const publishedAtISO = prepared.item.newItem.publishedAt
      ? new Date(prepared.item.newItem.publishedAt).toISOString()
      : null;

    statements.push(
      db
        .insert(items)
        .values({
          id: prepared.item.newItem.id,
          contentType: prepared.item.newItem.contentType,
          provider: 'RSS',
          providerId: prepared.item.newItem.providerId,
          canonicalUrl: prepared.item.newItem.canonicalUrl,
          title: prepared.item.newItem.title,
          summary: prepared.item.newItem.description,
          creatorId: prepared.item.creatorId,
          thumbnailUrl: prepared.item.newItem.imageUrl,
          duration: prepared.item.newItem.durationSeconds,
          publishedAt: publishedAtISO,
          createdAt: nowISO,
          updatedAt: nowISO,
        })
        .onConflictDoNothing()
    );
  } else {
    const canonical = await db.query.items.findFirst({
      where: eq(items.id, prepared.item.canonicalItemId),
      columns: { id: true, thumbnailUrl: true, summary: true, creatorId: true },
    });

    if (canonical) {
      const itemUpdates = buildCanonicalMetadataUpdates({
        canonical,
        transformed: prepared.item.newItem,
        creatorId: prepared.item.creatorId,
        nowISO,
      });

      if (Object.keys(itemUpdates).length > 0) {
        await db.update(items).set(itemUpdates).where(eq(items.id, canonical.id));
      }
    }
  }

  statements.push(
    db
      .insert(userItems)
      .values({
        id: prepared.item.userItemId,
        userId,
        itemId: prepared.item.canonicalItemId,
        state: UserItemState.INBOX,
        ingestedAt: nowISO,
        createdAt: nowISO,
        updatedAt: nowISO,
      })
      .onConflictDoNothing()
  );

  statements.push(
    db
      .insert(rssFeedItems)
      .values({
        id: ulid(),
        rssFeedId: feedId,
        itemId: prepared.item.canonicalItemId,
        entryId: enrichedEntry.entryId,
        entryUrl: enrichedEntry.canonicalUrl,
        publishedAt: enrichedEntry.publishedAt ?? null,
        fetchedAt: now,
      })
      .onConflictDoNothing()
  );

  statements.push(
    db
      .insert(providerItemsSeen)
      .values({
        id: ulid(),
        userId,
        provider: 'RSS',
        providerItemId: prepared.item.newItem.providerId,
        sourceId: null,
        firstSeenAt: nowISO,
      })
      .onConflictDoNothing()
  );

  await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  return true;
}

async function ingestEntries(params: {
  db: Database;
  userId: string;
  feedId: string;
  entries: ParsedRssEntry[];
  maxEntries: number;
}): Promise<{ newItems: number; processedEntries: number }> {
  const sortedEntries = sortEntriesByPublishDate(params.entries).slice(0, params.maxEntries);
  let newItems = 0;

  for (const entry of sortedEntries) {
    try {
      const created = await ingestEntry({
        db: params.db,
        userId: params.userId,
        feedId: params.feedId,
        entry,
      });
      if (created) {
        newItems += 1;
      }
    } catch (error) {
      rssLogger.error('Failed to ingest RSS entry', {
        feedId: params.feedId,
        providerId: entry.providerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    newItems,
    processedEntries: sortedEntries.length,
  };
}

async function markFeedSuccess(params: {
  db: Database;
  feed: RssFeedRow;
  parsed: ParsedRssFeed;
  etag: string | null;
  lastModified: string | null;
}): Promise<void> {
  const now = Date.now();
  const safeStatus = params.feed.status === 'ERROR' ? 'ACTIVE' : params.feed.status;

  await params.db
    .update(rssFeeds)
    .set({
      title: params.parsed.title ?? params.feed.title ?? null,
      description: params.parsed.description ?? params.feed.description ?? null,
      siteUrl: params.parsed.siteUrl ?? params.feed.siteUrl ?? null,
      imageUrl: params.parsed.imageUrl ?? params.feed.imageUrl ?? null,
      etag: params.etag ?? params.feed.etag ?? null,
      lastModified: params.lastModified ?? params.feed.lastModified ?? null,
      lastPolledAt: now,
      lastSuccessAt: now,
      lastErrorAt: null,
      lastError: null,
      errorCount: 0,
      status: safeStatus,
      updatedAt: now,
    })
    .where(eq(rssFeeds.id, params.feed.id));
}

async function markFeedNotModified(params: { db: Database; feed: RssFeedRow }): Promise<void> {
  const now = Date.now();
  await params.db
    .update(rssFeeds)
    .set({
      lastPolledAt: now,
      lastSuccessAt: now,
      lastErrorAt: null,
      lastError: null,
      errorCount: 0,
      status: params.feed.status === 'ERROR' ? 'ACTIVE' : params.feed.status,
      updatedAt: now,
    })
    .where(eq(rssFeeds.id, params.feed.id));
}

async function markFeedError(params: {
  db: Database;
  feed: RssFeedRow;
  error: string;
}): Promise<void> {
  const now = Date.now();
  const nextErrorCount = (params.feed.errorCount ?? 0) + 1;
  const nextStatus = nextErrorCount >= ERROR_THRESHOLD ? 'ERROR' : params.feed.status;

  await params.db
    .update(rssFeeds)
    .set({
      lastPolledAt: now,
      lastErrorAt: now,
      lastError: params.error,
      errorCount: nextErrorCount,
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(rssFeeds.id, params.feed.id));
}

export async function syncRssFeed(
  db: Database,
  feed: RssFeedRow,
  options: SyncOptions = {}
): Promise<SyncRssFeedResult> {
  const maxEntries = options.maxEntries ?? MAX_ENTRIES_PER_SYNC;
  const normalizedFeedUrl = normalizeFeedUrl(feed.feedUrl);
  if (normalizedFeedUrl !== feed.feedUrl) {
    await db
      .update(rssFeeds)
      .set({
        feedUrl: normalizedFeedUrl,
        updatedAt: Date.now(),
      })
      .where(eq(rssFeeds.id, feed.id));
    feed = { ...feed, feedUrl: normalizedFeedUrl };
  }

  try {
    const fetched = await fetchFeed(feed, options.useConditional ?? true);

    if (fetched.notModified) {
      await markFeedNotModified({ db, feed });
      return { newItems: 0, processedEntries: 0, skipped: true, reason: 'not_modified' };
    }

    const parsed = fetched.parsed!;
    const { newItems, processedEntries } = await ingestEntries({
      db,
      userId: feed.userId,
      feedId: feed.id,
      entries: parsed.entries,
      maxEntries,
    });

    await markFeedSuccess({
      db,
      feed,
      parsed,
      etag: fetched.etag,
      lastModified: fetched.lastModified,
    });

    return {
      newItems,
      processedEntries,
      skipped: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFeedError({ db, feed, error: message });
    throw error;
  }
}

export async function syncRssFeedById(
  db: Database,
  userId: string,
  feedId: string,
  options: SyncOptions = {}
): Promise<SyncRssFeedResult> {
  const feed = await db.query.rssFeeds.findFirst({
    where: and(eq(rssFeeds.id, feedId), eq(rssFeeds.userId, userId)),
  });

  if (!feed) {
    throw new Error('RSS feed not found');
  }

  return syncRssFeed(db, feed, options);
}

export async function pollRssFeeds(env: Bindings, _ctx: ExecutionContext): Promise<RssPollResult> {
  const lockAcquired = await tryAcquireLock(
    env.OAUTH_STATE_KV,
    RSS_POLL_LOCK_KEY,
    RSS_POLL_LOCK_TTL
  );
  if (!lockAcquired) {
    rssLogger.info('Skipped RSS polling: lock held');
    return {
      skipped: true,
      processedFeeds: 0,
      newItems: 0,
      reason: 'lock_held',
    };
  }

  try {
    const db = createDb(env.DB);
    const now = Date.now();
    const dueFeeds = await db.query.rssFeeds.findMany({
      where: and(
        eq(rssFeeds.status, 'ACTIVE'),
        sql`${rssFeeds.pollIntervalSeconds} > 0`,
        sql`${rssFeeds.lastPolledAt} IS NULL OR ${rssFeeds.lastPolledAt} < ${now} - (${rssFeeds.pollIntervalSeconds} * 1000)`
      ),
      orderBy: [asc(rssFeeds.lastPolledAt)],
      limit: RSS_POLL_BATCH_SIZE,
    });

    if (dueFeeds.length === 0) {
      return {
        skipped: false,
        processedFeeds: 0,
        newItems: 0,
        reason: 'no_due_feeds',
      };
    }

    let processedFeeds = 0;
    let newItems = 0;

    for (const feed of dueFeeds) {
      try {
        const result = await syncRssFeed(db, feed, {
          maxEntries: MAX_ENTRIES_PER_SYNC,
          useConditional: true,
        });
        processedFeeds += 1;
        newItems += result.newItems;
      } catch (error) {
        rssLogger.error('Scheduled RSS sync failed', {
          feedId: feed.id,
          userId: feed.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      skipped: false,
      processedFeeds,
      newItems,
    };
  } finally {
    await releaseLock(env.OAUTH_STATE_KV, RSS_POLL_LOCK_KEY);
  }
}

export async function lookupRssFeedsByIds(
  db: Database,
  userId: string,
  ids: string[]
): Promise<RssFeedRow[]> {
  if (ids.length === 0) return [];

  return db.query.rssFeeds.findMany({
    where: and(eq(rssFeeds.userId, userId), inArray(rssFeeds.id, ids)),
  });
}
