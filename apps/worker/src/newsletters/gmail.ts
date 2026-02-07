import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { ContentType, Provider } from '@zine/shared';

import { createDb, type Database } from '../db';
import { findOrCreateCreator } from '../db/helpers/creators';
import {
  gmailMailboxes,
  newsletterFeeds,
  newsletterFeedMessages,
  items,
  providerConnections,
  userItems,
} from '../db/schema';
import { tryAcquireLock, releaseLock } from '../lib/locks';
import { logger } from '../lib/logger';
import type { ProviderConnection, TokenRefreshEnv } from '../lib/token-refresh';
import { getValidAccessToken } from '../lib/token-refresh';
import type { Bindings } from '../types';

const gmailLogger = logger.child('gmail-newsletters');

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DEFAULT_INITIAL_DAYS = 30;
const MAX_INITIAL_PAGES = 2;
const MAX_INCREMENTAL_PAGES = 3;
const MESSAGE_FETCH_CONCURRENCY = 5;
const NEWSLETTER_SCORE_THRESHOLD = 0.55;
const GMAIL_POLL_LOCK_KEY = 'cron:poll-gmail-newsletters:lock';
const GMAIL_POLL_LOCK_TTL = 900;

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessageListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
  nextPageToken?: string;
};

type GmailHistoryResponse = {
  historyId?: string;
  history?: Array<{
    messagesAdded?: Array<{
      message?: {
        id?: string;
      };
    }>;
  }>;
  nextPageToken?: string;
};

type GmailMessageMetadata = {
  id: string;
  threadId?: string;
  historyId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
  };
};

type GmailProfile = {
  historyId?: string;
  emailAddress?: string;
};

export type NewsletterFeedStatus = 'ACTIVE' | 'HIDDEN' | 'UNSUBSCRIBED';

export interface GmailSyncResult {
  mailboxId: string;
  mode: 'initial' | 'incremental';
  processedMessages: number;
  newItems: number;
  feedsUpserted: number;
  latestHistoryId: string | null;
}

export interface GmailPollResult {
  skipped: boolean;
  processedMailboxes?: number;
  newItems?: number;
  reason?: string;
}

type NewsletterDetection = {
  isNewsletter: boolean;
  score: number;
};

type ParsedMessage = {
  messageId: string;
  threadId: string;
  internalDateMs: number;
  historyId: string | null;
  fromAddress: string;
  fromDisplayName: string;
  subject: string;
  snippet: string;
  listId: string | null;
  unsubscribeMailto: string | null;
  unsubscribeUrl: string | null;
  unsubscribePostHeader: string | null;
  detection: NewsletterDetection;
  canonicalKey: string;
  issueUrl: string | null;
};

interface MessageIdFetchResult {
  mode: 'initial' | 'incremental';
  ids: string[];
  latestHistoryId: string | null;
}

class GmailApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'GmailApiError';
  }
}

class StaleHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleHistoryError';
  }
}

function normalizeHeaderValue(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function normalizeKeySegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseAddress(value: string): { email: string; displayName: string } {
  const trimmed = value.trim();
  const bracketMatch = trimmed.match(/^(.*)<([^>]+)>$/);

  if (bracketMatch) {
    return {
      displayName: bracketMatch[1].replace(/"/g, '').trim() || bracketMatch[2].trim(),
      email: bracketMatch[2].trim().toLowerCase(),
    };
  }

  return {
    displayName: trimmed || 'Newsletter',
    email: trimmed.toLowerCase(),
  };
}

function getHeaderValue(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const lowerName = name.toLowerCase();
  const header = headers.find((entry) => entry.name?.toLowerCase() === lowerName);
  return normalizeHeaderValue(header?.value ?? null) || null;
}

function parseListUnsubscribe(value: string | null): { mailto: string | null; url: string | null } {
  if (!value) {
    return { mailto: null, url: null };
  }

  const tokens = value
    .split(',')
    .map((part) => part.replace(/[<>]/g, '').trim())
    .filter(Boolean);

  let mailto: string | null = null;
  let url: string | null = null;

  for (const token of tokens) {
    if (!mailto && token.toLowerCase().startsWith('mailto:')) {
      mailto = token;
      continue;
    }

    if (!url && /^https?:\/\//i.test(token)) {
      url = token;
    }
  }

  return { mailto, url };
}

function extractFirstUrl(snippet: string): string | null {
  const match = snippet.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

function computeNewsletterScore(params: {
  listId: string | null;
  listUnsubscribe: string | null;
  unsubscribePostHeader: string | null;
  fromAddress: string;
  subject: string;
}): NewsletterDetection {
  let score = 0;

  if (params.listId) {
    score += 0.65;
  }

  if (params.listUnsubscribe) {
    score += 0.35;
  }

  if (params.unsubscribePostHeader?.toLowerCase().includes('one-click')) {
    score += 0.1;
  }

  if (/newsletter|digest|updates|weekly|daily/i.test(params.fromAddress)) {
    score += 0.1;
  }

  if (/receipt|invoice|statement|verification|security|password|order/i.test(params.subject)) {
    score -= 0.5;
  }

  const clamped = Math.max(0, Math.min(1, score));
  return {
    isNewsletter: clamped >= NEWSLETTER_SCORE_THRESHOLD,
    score: clamped,
  };
}

function buildCanonicalKey(params: {
  listId: string | null;
  unsubscribeUrl: string | null;
  unsubscribeMailto: string | null;
  fromAddress: string;
}): string {
  if (params.listId) {
    return `list:${normalizeKeySegment(params.listId)}`;
  }

  if (params.unsubscribeUrl) {
    return `unsub-url:${normalizeKeySegment(params.unsubscribeUrl)}`;
  }

  if (params.unsubscribeMailto) {
    return `unsub-mailto:${normalizeKeySegment(params.unsubscribeMailto)}`;
  }

  return `from:${normalizeKeySegment(params.fromAddress)}`;
}

function buildGmailFallbackUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
}

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${GMAIL_API_BASE}/${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new GmailApiError(response.status, `Gmail API request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

async function fetchMessageIdsInitial(accessToken: string): Promise<MessageIdFetchResult> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_INITIAL_PAGES; page += 1) {
    const params = new URLSearchParams({
      maxResults: '100',
      q: `in:inbox newer_than:${DEFAULT_INITIAL_DAYS}d`,
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await gmailGet<GmailMessageListResponse>(
      accessToken,
      `messages?${params.toString()}`
    );

    for (const message of response.messages ?? []) {
      if (message.id) {
        messageIds.push(message.id);
      }
    }

    if (!response.nextPageToken) {
      break;
    }

    pageToken = response.nextPageToken;
  }

  const profile = await gmailGet<GmailProfile>(accessToken, 'profile');

  return {
    mode: 'initial',
    ids: Array.from(new Set(messageIds)),
    latestHistoryId: profile.historyId ?? null,
  };
}

async function fetchMessageIdsIncremental(
  accessToken: string,
  historyId: string
): Promise<MessageIdFetchResult> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;
  let latestHistoryId: string | null = historyId;

  for (let page = 0; page < MAX_INCREMENTAL_PAGES; page += 1) {
    const params = new URLSearchParams({
      startHistoryId: historyId,
      historyTypes: 'messageAdded',
      maxResults: '100',
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    let response: GmailHistoryResponse;
    try {
      response = await gmailGet<GmailHistoryResponse>(accessToken, `history?${params.toString()}`);
    } catch (error) {
      if (error instanceof GmailApiError && error.status === 404) {
        throw new StaleHistoryError('Stored Gmail history cursor is no longer valid');
      }
      throw error;
    }

    latestHistoryId = response.historyId ?? latestHistoryId;

    for (const historyEntry of response.history ?? []) {
      for (const added of historyEntry.messagesAdded ?? []) {
        if (added.message?.id) {
          messageIds.push(added.message.id);
        }
      }
    }

    if (!response.nextPageToken) {
      break;
    }

    pageToken = response.nextPageToken;
  }

  return {
    mode: 'incremental',
    ids: Array.from(new Set(messageIds)),
    latestHistoryId,
  };
}

async function fetchMessageMetadata(
  accessToken: string,
  messageId: string
): Promise<GmailMessageMetadata> {
  const params = new URLSearchParams({
    format: 'metadata',
  });

  const headerNames = ['From', 'Subject', 'List-Id', 'List-Unsubscribe', 'List-Unsubscribe-Post'];
  for (const name of headerNames) {
    params.append('metadataHeaders', name);
  }

  return gmailGet<GmailMessageMetadata>(
    accessToken,
    `messages/${encodeURIComponent(messageId)}?${params.toString()}`
  );
}

function parseMessage(metadata: GmailMessageMetadata): ParsedMessage | null {
  if (!metadata.id) {
    return null;
  }

  const headers = metadata.payload?.headers;
  const fromRaw = getHeaderValue(headers, 'From');
  const subject = getHeaderValue(headers, 'Subject') ?? '(No subject)';
  const listId = getHeaderValue(headers, 'List-Id');
  const listUnsubscribe = getHeaderValue(headers, 'List-Unsubscribe');
  const unsubscribePostHeader = getHeaderValue(headers, 'List-Unsubscribe-Post');

  if (!fromRaw) {
    return null;
  }

  const { email: fromAddress, displayName } = parseAddress(fromRaw);
  const parsedUnsubscribe = parseListUnsubscribe(listUnsubscribe);
  const detection = computeNewsletterScore({
    listId,
    listUnsubscribe,
    unsubscribePostHeader,
    fromAddress,
    subject,
  });

  const internalDateMs = Number.parseInt(metadata.internalDate ?? '', 10) || Date.now();
  const snippet = metadata.snippet?.trim() ?? '';
  const threadId = metadata.threadId ?? metadata.id;

  const issueUrl = extractFirstUrl(snippet);

  return {
    messageId: metadata.id,
    threadId,
    internalDateMs,
    historyId: metadata.historyId ?? null,
    fromAddress,
    fromDisplayName: displayName,
    subject,
    snippet,
    listId,
    unsubscribeMailto: parsedUnsubscribe.mailto,
    unsubscribeUrl: parsedUnsubscribe.url,
    unsubscribePostHeader,
    detection,
    canonicalKey: buildCanonicalKey({
      listId,
      unsubscribeUrl: parsedUnsubscribe.url,
      unsubscribeMailto: parsedUnsubscribe.mailto,
      fromAddress,
    }),
    issueUrl,
  };
}

async function getGmailConnection(
  userId: string,
  db: Database
): Promise<ProviderConnection | null> {
  const connection = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.userId, userId),
      eq(providerConnections.provider, Provider.GMAIL),
      eq(providerConnections.status, 'ACTIVE')
    ),
  });

  return (connection as ProviderConnection | undefined) ?? null;
}

async function ensureMailboxRecord(
  db: Database,
  userId: string,
  connectionId: string,
  accessToken: string
) {
  const existing = await db.query.gmailMailboxes.findFirst({
    where: and(
      eq(gmailMailboxes.userId, userId),
      eq(gmailMailboxes.providerConnectionId, connectionId)
    ),
  });

  const profile = await gmailGet<GmailProfile>(accessToken, 'profile');

  const googleSubResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!googleSubResponse.ok) {
    const body = await googleSubResponse.text();
    throw new Error(`Failed to load Google user info: ${googleSubResponse.status} ${body}`);
  }

  const googleUserInfo = (await googleSubResponse.json()) as { id?: string; email?: string };
  const googleSub = googleUserInfo.id ?? existing?.googleSub;
  const email = profile.emailAddress ?? googleUserInfo.email ?? existing?.email;

  if (!googleSub || !email) {
    throw new Error('Missing Google identity details while initializing Gmail mailbox');
  }

  const now = Date.now();

  if (existing) {
    await db
      .update(gmailMailboxes)
      .set({
        googleSub,
        email,
        updatedAt: now,
      })
      .where(eq(gmailMailboxes.id, existing.id));

    return {
      ...existing,
      googleSub,
      email,
    };
  }

  const mailboxId = ulid();
  await db.insert(gmailMailboxes).values({
    id: mailboxId,
    userId,
    providerConnectionId: connectionId,
    googleSub,
    email,
    historyId: profile.historyId ?? null,
    watchExpirationAt: null,
    lastSyncAt: null,
    lastSyncStatus: 'IDLE',
    lastSyncError: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: mailboxId,
    userId,
    providerConnectionId: connectionId,
    googleSub,
    email,
    historyId: profile.historyId ?? null,
    watchExpirationAt: null,
    lastSyncAt: null,
    lastSyncStatus: 'IDLE',
    lastSyncError: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function upsertNewsletterFeed(
  db: Database,
  userId: string,
  mailboxId: string,
  parsed: ParsedMessage
) {
  const now = Date.now();

  const existing = await db.query.newsletterFeeds.findFirst({
    where: and(
      eq(newsletterFeeds.userId, userId),
      eq(newsletterFeeds.canonicalKey, parsed.canonicalKey)
    ),
  });

  if (existing) {
    await db
      .update(newsletterFeeds)
      .set({
        listId: parsed.listId,
        fromAddress: parsed.fromAddress,
        displayName: parsed.fromDisplayName,
        unsubscribeMailto: parsed.unsubscribeMailto,
        unsubscribeUrl: parsed.unsubscribeUrl,
        unsubscribePostHeader: parsed.unsubscribePostHeader,
        detectionScore: Math.max(existing.detectionScore, parsed.detection.score),
        lastSeenAt: parsed.internalDateMs,
        updatedAt: now,
      })
      .where(eq(newsletterFeeds.id, existing.id));

    return {
      ...existing,
      status: existing.status as NewsletterFeedStatus,
    };
  }

  const feedId = ulid();
  await db.insert(newsletterFeeds).values({
    id: feedId,
    userId,
    gmailMailboxId: mailboxId,
    canonicalKey: parsed.canonicalKey,
    listId: parsed.listId,
    fromAddress: parsed.fromAddress,
    displayName: parsed.fromDisplayName,
    unsubscribeMailto: parsed.unsubscribeMailto,
    unsubscribeUrl: parsed.unsubscribeUrl,
    unsubscribePostHeader: parsed.unsubscribePostHeader,
    detectionScore: parsed.detection.score,
    status: 'ACTIVE',
    firstSeenAt: parsed.internalDateMs,
    lastSeenAt: parsed.internalDateMs,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: feedId,
    status: 'ACTIVE' as NewsletterFeedStatus,
  };
}

async function ingestNewsletterMessage(params: {
  db: Database;
  userId: string;
  mailboxId: string;
  googleSub: string;
  parsed: ParsedMessage;
  feedId: string;
}): Promise<boolean> {
  const existingMapping = await params.db.query.newsletterFeedMessages.findFirst({
    where: and(
      eq(newsletterFeedMessages.userId, params.userId),
      eq(newsletterFeedMessages.gmailMessageId, params.parsed.messageId)
    ),
    columns: { id: true },
  });

  if (existingMapping) {
    return false;
  }

  const providerId = `${params.googleSub}:${params.parsed.messageId}`;
  const issueUrl = params.parsed.issueUrl ?? buildGmailFallbackUrl(params.parsed.threadId);
  const publishedAtIso = new Date(params.parsed.internalDateMs).toISOString();
  const nowIso = new Date().toISOString();

  const creator = await findOrCreateCreator(
    { db: params.db },
    {
      provider: Provider.GMAIL,
      providerCreatorId: params.parsed.canonicalKey,
      name: params.parsed.fromDisplayName,
      handle: params.parsed.fromAddress,
      externalUrl: issueUrl,
    }
  );

  await params.db
    .insert(items)
    .values({
      id: ulid(),
      contentType: ContentType.ARTICLE,
      provider: Provider.GMAIL,
      providerId,
      canonicalUrl: issueUrl,
      title: params.parsed.subject,
      thumbnailUrl: null,
      creatorId: creator.id,
      publisher: params.parsed.fromDisplayName,
      summary: params.parsed.snippet || null,
      duration: null,
      publishedAt: publishedAtIso,
      rawMetadata: JSON.stringify({
        messageId: params.parsed.messageId,
        threadId: params.parsed.threadId,
        listId: params.parsed.listId,
        fromAddress: params.parsed.fromAddress,
        unsubscribeUrl: params.parsed.unsubscribeUrl,
      }),
      wordCount: null,
      readingTimeMinutes: null,
      articleContentKey: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .onConflictDoNothing({
      target: [items.provider, items.providerId],
    });

  const canonicalItem = await params.db.query.items.findFirst({
    where: and(eq(items.provider, Provider.GMAIL), eq(items.providerId, providerId)),
    columns: { id: true },
  });

  if (!canonicalItem) {
    throw new Error(`Failed to load created newsletter item for providerId=${providerId}`);
  }

  await params.db
    .insert(userItems)
    .values({
      id: ulid(),
      userId: params.userId,
      itemId: canonicalItem.id,
      state: 'INBOX',
      ingestedAt: nowIso,
      bookmarkedAt: null,
      archivedAt: null,
      lastOpenedAt: null,
      progressPosition: null,
      progressDuration: null,
      progressUpdatedAt: null,
      isFinished: false,
      finishedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .onConflictDoNothing({
      target: [userItems.userId, userItems.itemId],
    });

  await params.db
    .insert(newsletterFeedMessages)
    .values({
      id: ulid(),
      userId: params.userId,
      gmailMailboxId: params.mailboxId,
      newsletterFeedId: params.feedId,
      gmailMessageId: params.parsed.messageId,
      gmailThreadId: params.parsed.threadId,
      itemId: canonicalItem.id,
      internalDate: params.parsed.internalDateMs,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({
      target: [newsletterFeedMessages.userId, newsletterFeedMessages.gmailMessageId],
    });

  return true;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = [];
  let index = 0;

  const tasks = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const itemIndex = index;
      index += 1;
      results[itemIndex] = await worker(items[itemIndex]);
    }
  });

  await Promise.all(tasks);
  return results;
}

export async function syncGmailNewslettersForUser(
  userId: string,
  db: Database,
  env: TokenRefreshEnv,
  options?: {
    forceFull?: boolean;
    mailboxId?: string;
  }
): Promise<GmailSyncResult> {
  const connection = await getGmailConnection(userId, db);
  if (!connection) {
    throw new Error('No active Gmail connection found');
  }

  const accessToken = await getValidAccessToken(connection, env);

  const mailboxConditions = [
    eq(gmailMailboxes.userId, userId),
    eq(gmailMailboxes.providerConnectionId, connection.id),
  ];
  if (options?.mailboxId) {
    mailboxConditions.push(eq(gmailMailboxes.id, options.mailboxId));
  }

  let mailbox = await db.query.gmailMailboxes.findFirst({
    where: and(...mailboxConditions),
  });

  if (!mailbox) {
    mailbox = await ensureMailboxRecord(db, userId, connection.id, accessToken);
  }

  const now = Date.now();
  await db
    .update(gmailMailboxes)
    .set({
      lastSyncStatus: 'RUNNING',
      lastSyncError: null,
      updatedAt: now,
    })
    .where(eq(gmailMailboxes.id, mailbox.id));

  try {
    let messageIds: MessageIdFetchResult;

    if (mailbox.historyId && !options?.forceFull) {
      try {
        messageIds = await fetchMessageIdsIncremental(accessToken, mailbox.historyId);
      } catch (error) {
        if (error instanceof StaleHistoryError) {
          gmailLogger.warn('History cursor stale, falling back to initial sync', {
            mailboxId: mailbox.id,
            userId,
          });
          messageIds = await fetchMessageIdsInitial(accessToken);
        } else {
          throw error;
        }
      }
    } else {
      messageIds = await fetchMessageIdsInitial(accessToken);
    }

    const metadataResults = await runWithConcurrency(
      messageIds.ids,
      MESSAGE_FETCH_CONCURRENCY,
      async (messageId) => {
        try {
          return await fetchMessageMetadata(accessToken, messageId);
        } catch (error) {
          gmailLogger.warn('Failed to fetch Gmail message metadata', {
            mailboxId: mailbox.id,
            messageId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }
    );

    let processedMessages = 0;
    let newItems = 0;
    let feedsUpserted = 0;
    let latestHistoryId = messageIds.latestHistoryId;

    for (const metadata of metadataResults) {
      if (!metadata) {
        continue;
      }

      const parsed = parseMessage(metadata);
      if (!parsed || !parsed.detection.isNewsletter) {
        continue;
      }

      processedMessages += 1;
      if (parsed.historyId) {
        latestHistoryId = parsed.historyId;
      }

      const feed = await upsertNewsletterFeed(db, userId, mailbox.id, parsed);
      feedsUpserted += 1;

      if (feed.status !== 'ACTIVE') {
        continue;
      }

      const created = await ingestNewsletterMessage({
        db,
        userId,
        mailboxId: mailbox.id,
        googleSub: mailbox.googleSub,
        parsed,
        feedId: feed.id,
      });

      if (created) {
        newItems += 1;
      }
    }

    const completedAt = Date.now();
    await db
      .update(gmailMailboxes)
      .set({
        historyId: latestHistoryId ?? mailbox.historyId,
        lastSyncAt: completedAt,
        lastSyncStatus: 'SUCCESS',
        lastSyncError: null,
        updatedAt: completedAt,
      })
      .where(eq(gmailMailboxes.id, mailbox.id));

    return {
      mailboxId: mailbox.id,
      mode: messageIds.mode,
      processedMessages,
      newItems,
      feedsUpserted,
      latestHistoryId: latestHistoryId ?? null,
    };
  } catch (error) {
    const failedAt = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error);

    await db
      .update(gmailMailboxes)
      .set({
        lastSyncStatus: 'ERROR',
        lastSyncError: errorMessage,
        updatedAt: failedAt,
      })
      .where(eq(gmailMailboxes.id, mailbox.id));

    throw error;
  }
}

export async function ensureGmailMailboxForConnection(params: {
  db: Database;
  userId: string;
  connection: ProviderConnection;
  env: TokenRefreshEnv;
}) {
  const accessToken = await getValidAccessToken(params.connection, params.env);
  return ensureMailboxRecord(params.db, params.userId, params.connection.id, accessToken);
}

export async function pollGmailNewsletters(
  env: Bindings,
  _ctx: ExecutionContext
): Promise<GmailPollResult> {
  const lockAcquired = await tryAcquireLock(env.OAUTH_STATE_KV, GMAIL_POLL_LOCK_KEY, GMAIL_POLL_LOCK_TTL);
  if (!lockAcquired) {
    gmailLogger.info('Skipped Gmail newsletter polling: lock held');
    return { skipped: true, reason: 'lock_held' };
  }

  try {
    const db = createDb(env.DB);
    const mailboxes = await db.query.gmailMailboxes.findMany({
      limit: 25,
    });

    if (mailboxes.length === 0) {
      return { skipped: false, processedMailboxes: 0, newItems: 0, reason: 'no_mailboxes' };
    }

    let processedMailboxes = 0;
    let newItems = 0;

    for (const mailbox of mailboxes) {
      try {
        const result = await syncGmailNewslettersForUser(mailbox.userId, db, env as TokenRefreshEnv, {
          mailboxId: mailbox.id,
        });
        processedMailboxes += 1;
        newItems += result.newItems;
      } catch (error) {
        gmailLogger.error('Failed polling Gmail mailbox', {
          mailboxId: mailbox.id,
          userId: mailbox.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      skipped: false,
      processedMailboxes,
      newItems,
    };
  } finally {
    await releaseLock(env.OAUTH_STATE_KV, GMAIL_POLL_LOCK_KEY);
  }
}
