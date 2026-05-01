import { and, count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { ContentType, Provider, UserItemState } from '@zine/shared';

import * as schema from '../db/schema';
import type { Database } from '../db';
import { findOrCreateCreator } from '../db/helpers/creators';
import {
  items,
  providerConnections,
  users,
  userItems,
  xBookmarkItems,
  xBookmarkSyncs,
} from '../db/schema';
import { logger } from '../lib/logger';
import {
  getValidAccessToken,
  persistConnectionExpired,
  type ProviderConnection,
  type TokenRefreshEnv,
} from '../lib/token-refresh';
import {
  fetchXBookmarksPage,
  XAuthError,
  X_BOOKMARKS_MAX_RESULTS,
  XRateLimitError,
  type XBookmarksPage,
  type XMedia,
  type XTweet,
  type XUser,
} from '../providers/x';

const xBookmarksLogger = logger.child('x-bookmarks');

export const X_BOOKMARK_SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type XBookmarkSyncStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR' | 'RATE_LIMITED';

export type XBookmarkSyncResult = {
  success: true;
  returned: number;
  created: number;
  skipped: number;
  estimatedBillableReads: number;
  nextCursor: string | null;
};

export class XBookmarkSyncBlockedError extends Error {
  readonly code: 'NOT_CONNECTED' | 'COOLDOWN' | 'RATE_LIMITED' | 'MISSING_PROVIDER_USER';
  readonly retryAt?: number;

  constructor(code: XBookmarkSyncBlockedError['code'], message: string, retryAt?: number) {
    super(message);
    this.name = 'XBookmarkSyncBlockedError';
    this.code = code;
    this.retryAt = retryAt;
  }
}

export async function getXBookmarkStatus(userId: string, db: Database) {
  const connection = await getXConnection(userId, db);
  if (!connection) {
    return {
      connected: false as const,
      connectionStatus: null,
      importedCount: 0,
      sync: null,
    };
  }

  const sync = await ensureXBookmarkSync(userId, connection, db);
  const importedCount = await countImportedBookmarks(userId, db);

  return {
    connected: connection.status === 'ACTIVE',
    connectionStatus: connection.status,
    importedCount,
    sync: {
      status: sync.status as XBookmarkSyncStatus,
      dailySyncEnabled: Boolean(sync.dailySyncEnabled),
      lastCursor: sync.lastCursor,
      lastSyncAt: sync.lastSyncAt,
      lastSuccessAt: sync.lastSuccessAt,
      lastErrorAt: sync.lastErrorAt,
      lastError: sync.lastError,
      rateLimitedUntil: sync.rateLimitedUntil,
      lastEstimatedBillableReads: sync.lastEstimatedBillableReads,
      updatedAt: sync.updatedAt,
    },
  };
}

export async function updateXBookmarkSettings(params: {
  userId: string;
  db: Database;
  dailySyncEnabled: boolean;
}) {
  const connection = await getXConnection(params.userId, params.db);
  if (!connection) {
    throw new XBookmarkSyncBlockedError(
      'NOT_CONNECTED',
      'Connect X before changing bookmark sync settings.'
    );
  }

  const sync = await ensureXBookmarkSync(params.userId, connection, params.db);
  const now = Date.now();
  await params.db
    .update(xBookmarkSyncs)
    .set({ dailySyncEnabled: params.dailySyncEnabled, updatedAt: now })
    .where(eq(xBookmarkSyncs.id, sync.id));

  return { success: true as const, dailySyncEnabled: params.dailySyncEnabled };
}

export async function syncXBookmarksForUser(params: {
  userId: string;
  db: Database;
  env: TokenRefreshEnv;
  mode: 'manual' | 'daily';
  bypassCooldown?: boolean;
}): Promise<XBookmarkSyncResult> {
  const connection = await getXConnection(params.userId, params.db);
  if (!connection || connection.status !== 'ACTIVE') {
    throw new XBookmarkSyncBlockedError('NOT_CONNECTED', 'Connect X before syncing bookmarks.');
  }
  if (!connection.providerUserId) {
    throw new XBookmarkSyncBlockedError(
      'MISSING_PROVIDER_USER',
      'X connection is missing the authenticated user ID. Reconnect X and try again.'
    );
  }

  const sync = await ensureXBookmarkSync(params.userId, connection, params.db);
  const now = Date.now();

  if (sync.rateLimitedUntil && sync.rateLimitedUntil > now) {
    throw new XBookmarkSyncBlockedError(
      'RATE_LIMITED',
      'X bookmark sync is rate limited. Try again after the reset time.',
      sync.rateLimitedUntil
    );
  }

  if (
    !params.bypassCooldown &&
    sync.lastSyncAt &&
    sync.lastSyncAt > now - X_BOOKMARK_SYNC_COOLDOWN_MS
  ) {
    throw new XBookmarkSyncBlockedError(
      'COOLDOWN',
      'X bookmarks can only be synced once every 24 hours.',
      sync.lastSyncAt + X_BOOKMARK_SYNC_COOLDOWN_MS
    );
  }

  await markSyncRunning(params.db, sync.id, now);

  try {
    const accessToken = await getValidAccessToken(connection, params.env);
    const page = await fetchXBookmarksPage({
      accessToken,
      userId: connection.providerUserId,
      maxResults: X_BOOKMARKS_MAX_RESULTS,
    });
    const result = await importBookmarksPage({
      userId: params.userId,
      db: params.db,
      page,
    });
    const completedAt = Date.now();

    await params.db
      .update(xBookmarkSyncs)
      .set({
        status: 'SUCCESS',
        lastSyncAt: completedAt,
        lastSuccessAt: completedAt,
        lastErrorAt: null,
        lastError: null,
        lastCursor: page.meta?.next_token ?? null,
        rateLimitedUntil: null,
        lastEstimatedBillableReads: result.estimatedBillableReads,
        updatedAt: completedAt,
      })
      .where(eq(xBookmarkSyncs.id, sync.id));

    xBookmarksLogger.info('X bookmark sync completed', {
      operation: 'xBookmarks.sync',
      event: 'xBookmarks.sync.completed',
      userId: params.userId,
      mode: params.mode,
      returned: result.returned,
      created: result.created,
      skipped: result.skipped,
      estimatedBillableReads: result.estimatedBillableReads,
      rateLimitRemaining: page.rateLimit.remaining,
      rateLimitResetAt: page.rateLimit.resetAt,
    });

    return {
      success: true,
      ...result,
      nextCursor: page.meta?.next_token ?? null,
    };
  } catch (error) {
    if (error instanceof XRateLimitError) {
      const failedAt = Date.now();
      await params.db
        .update(xBookmarkSyncs)
        .set({
          status: 'RATE_LIMITED',
          lastSyncAt: failedAt,
          lastErrorAt: failedAt,
          lastError: error.message,
          rateLimitedUntil: error.resetAt,
          updatedAt: failedAt,
        })
        .where(eq(xBookmarkSyncs.id, sync.id));

      xBookmarksLogger.warn('X bookmark sync rate limited', {
        operation: 'xBookmarks.sync',
        event: 'xBookmarks.sync.rate_limited',
        userId: params.userId,
        resetAt: error.resetAt,
        remaining: error.rateLimit.remaining,
      });
    } else if (error instanceof XAuthError) {
      await persistConnectionExpired(connection.id, params.env);
      await markSyncError(params.db, sync.id, error.message);
    } else {
      await markSyncError(
        params.db,
        sync.id,
        error instanceof Error ? error.message : String(error)
      );
    }

    throw error;
  }
}

export async function pollXBookmarkSyncs(env: TokenRefreshEnv): Promise<{
  processed: number;
  skipped: number;
  failed: number;
}> {
  const db = drizzle(env.DB, { schema });
  const now = Date.now();
  const dueRows = await db.query.xBookmarkSyncs.findMany({
    where: eq(xBookmarkSyncs.dailySyncEnabled, true),
    limit: 25,
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const sync of dueRows) {
    if (sync.status === 'RUNNING') {
      skipped++;
      continue;
    }

    if (sync.lastSyncAt && sync.lastSyncAt > now - X_BOOKMARK_SYNC_COOLDOWN_MS) {
      skipped++;
      continue;
    }

    try {
      await syncXBookmarksForUser({
        userId: sync.userId,
        db,
        env,
        mode: 'daily',
      });
      processed++;
    } catch (error) {
      failed++;
      xBookmarksLogger.warn('Daily X bookmark sync failed', {
        userId: sync.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed, skipped, failed };
}

async function getXConnection(userId: string, db: Database): Promise<ProviderConnection | null> {
  const connection = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.userId, userId),
      eq(providerConnections.provider, Provider.X)
    ),
  });

  return (connection as ProviderConnection | undefined) ?? null;
}

async function ensureXBookmarkSync(userId: string, connection: ProviderConnection, db: Database) {
  const existing = await db.query.xBookmarkSyncs.findFirst({
    where: and(
      eq(xBookmarkSyncs.userId, userId),
      eq(xBookmarkSyncs.providerConnectionId, connection.id)
    ),
  });

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const id = ulid();
  await db.insert(xBookmarkSyncs).values({
    id,
    userId,
    providerConnectionId: connection.id,
    status: 'IDLE',
    dailySyncEnabled: false,
    lastEstimatedBillableReads: 0,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.xBookmarkSyncs.findFirst({
    where: eq(xBookmarkSyncs.id, id),
  });

  if (!created) {
    throw new Error('Failed to create X bookmark sync state');
  }

  return created;
}

async function countImportedBookmarks(userId: string, db: Database): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(xBookmarkItems)
    .where(eq(xBookmarkItems.userId, userId));
  return rows[0]?.value ?? 0;
}

async function markSyncRunning(db: Database, syncId: string, now: number): Promise<void> {
  await db
    .update(xBookmarkSyncs)
    .set({ status: 'RUNNING', lastError: null, updatedAt: now })
    .where(eq(xBookmarkSyncs.id, syncId));
}

async function markSyncError(db: Database, syncId: string, message: string): Promise<void> {
  const now = Date.now();
  await db
    .update(xBookmarkSyncs)
    .set({
      status: 'ERROR',
      lastSyncAt: now,
      lastErrorAt: now,
      lastError: message,
      updatedAt: now,
    })
    .where(eq(xBookmarkSyncs.id, syncId));
}

async function importBookmarksPage(params: {
  userId: string;
  db: Database;
  page: XBookmarksPage;
}): Promise<{
  returned: number;
  created: number;
  skipped: number;
  estimatedBillableReads: number;
}> {
  const tweets = params.page.data ?? [];
  const usersById = new Map((params.page.includes?.users ?? []).map((user) => [user.id, user]));
  const mediaByKey = new Map(
    (params.page.includes?.media ?? []).map((media) => [media.media_key, media])
  );
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  await params.db
    .insert(users)
    .values({ id: params.userId, email: null, createdAt: nowIso, updatedAt: nowIso })
    .onConflictDoNothing();

  let created = 0;
  let skipped = 0;

  for (const tweet of tweets) {
    const author = tweet.author_id ? usersById.get(tweet.author_id) : undefined;
    const media = firstTweetMedia(tweet, mediaByKey);
    const itemId = await upsertXItem({
      db: params.db,
      tweet,
      author,
      media,
      nowIso,
    });
    const userItemCreated = await upsertXUserItem({
      db: params.db,
      userId: params.userId,
      itemId,
      nowIso,
    });

    await params.db
      .insert(xBookmarkItems)
      .values({
        id: ulid(),
        userId: params.userId,
        itemId,
        tweetId: tweet.id,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [xBookmarkItems.userId, xBookmarkItems.tweetId],
        set: { itemId, lastSeenAt: now },
      });

    if (userItemCreated) {
      created++;
    } else {
      skipped++;
    }
  }

  return {
    returned: tweets.length,
    created,
    skipped,
    estimatedBillableReads: tweets.length,
  };
}

async function upsertXItem(params: {
  db: Database;
  tweet: XTweet;
  author?: XUser;
  media?: XMedia;
  nowIso: string;
}): Promise<string> {
  const existing = await params.db.query.items.findFirst({
    where: and(eq(items.provider, Provider.X), eq(items.providerId, params.tweet.id)),
  });
  const creator = await findOrCreateCreator(
    { db: params.db },
    {
      provider: Provider.X,
      providerCreatorId:
        params.author?.id ?? `unknown:${params.tweet.author_id ?? params.tweet.id}`,
      name: params.author?.name ?? 'Unknown',
      imageUrl: params.author?.profile_image_url,
      handle: params.author?.username,
      externalUrl: params.author ? `https://x.com/${params.author.username}` : undefined,
    }
  );

  if (existing) {
    if (!existing.creatorId) {
      await params.db
        .update(items)
        .set({ creatorId: creator.id, updatedAt: params.nowIso })
        .where(eq(items.id, existing.id));
    }
    return existing.id;
  }

  const itemId = ulid();
  await params.db.insert(items).values({
    id: itemId,
    contentType: ContentType.POST,
    provider: Provider.X,
    providerId: params.tweet.id,
    canonicalUrl: canonicalTweetUrl(params.tweet, params.author),
    title: tweetTitle(params.tweet, params.author),
    thumbnailUrl: mediaThumbnail(params.media) ?? params.author?.profile_image_url ?? null,
    creatorId: creator.id,
    publisher: 'X',
    summary: tweetSummary(params.tweet),
    duration: params.media?.duration_ms ? Math.round(params.media.duration_ms / 1000) : null,
    publishedAt: params.tweet.created_at ?? null,
    rawMetadata: JSON.stringify({
      tweet: params.tweet,
      author: params.author ?? null,
      media: params.media ?? null,
    }),
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  });

  return itemId;
}

async function upsertXUserItem(params: {
  db: Database;
  userId: string;
  itemId: string;
  nowIso: string;
}): Promise<boolean> {
  const existing = await params.db.query.userItems.findFirst({
    where: and(eq(userItems.userId, params.userId), eq(userItems.itemId, params.itemId)),
  });

  if (existing) {
    return false;
  }

  await params.db.insert(userItems).values({
    id: ulid(),
    userId: params.userId,
    itemId: params.itemId,
    state: UserItemState.BOOKMARKED,
    ingestedAt: params.nowIso,
    bookmarkedAt: params.nowIso,
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  });

  return true;
}

function firstTweetMedia(tweet: XTweet, mediaByKey: Map<string, XMedia>): XMedia | undefined {
  const keys = tweet.attachments?.media_keys ?? [];
  for (const key of keys) {
    const media = mediaByKey.get(key);
    if (media) return media;
  }
  return undefined;
}

function canonicalTweetUrl(tweet: XTweet, author?: XUser): string {
  const username = author?.username ?? 'i';
  return `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(tweet.id)}`;
}

function tweetText(tweet: XTweet): string {
  return tweet.note_tweet?.text?.trim() || tweet.text?.trim() || '';
}

function tweetTitle(tweet: XTweet, author?: XUser): string {
  const text = tweetText(tweet);
  if (text) return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  return `Post by ${author?.name ?? 'Unknown'}`;
}

function tweetSummary(tweet: XTweet): string | null {
  const text = tweetText(tweet);
  return text || null;
}

function mediaThumbnail(media?: XMedia): string | null {
  if (!media) return null;
  return media.url ?? media.preview_image_url ?? null;
}
