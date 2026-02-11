import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { ContentType, Provider } from '@zine/shared';
import { parseHTML } from 'linkedom/worker';

import { createDb, type Database } from '../db';
import { findOrCreateCreator } from '../db/helpers/creators';
import {
  creators,
  gmailMailboxes,
  newsletterFeeds,
  newsletterFeedMessages,
  items,
  providerConnections,
  userItems,
} from '../db/schema';
import { parseLink } from '../lib/link-parser';
import { tryAcquireLock, releaseLock } from '../lib/locks';
import { logger } from '../lib/logger';
import type { ProviderConnection, TokenRefreshEnv } from '../lib/token-refresh';
import { getValidAccessToken } from '../lib/token-refresh';
import type { Bindings } from '../types';
import { buildNewsletterAvatarUrl } from './avatar';

const gmailLogger = logger.child('gmail-newsletters');

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DEFAULT_INITIAL_DAYS = 30;
const MAX_INITIAL_PAGES = 2;
const MAX_INCREMENTAL_PAGES = 3;
const MESSAGE_FETCH_CONCURRENCY = 5;
const NEWSLETTER_SCORE_THRESHOLD = 0.78;
const GMAIL_POLL_LOCK_KEY = 'cron:poll-gmail-newsletters:lock';
const GMAIL_POLL_LOCK_TTL = 900;

const NEWSLETTER_KEYWORD_PATTERN =
  /\b(newsletter|digest|briefing|roundup|edition|weekly|daily|issue|dispatch|substack)\b/i;
const NEWSLETTER_PLATFORM_PATTERN = /\b(substack|beehiiv|convertkit|mailchimp|ghost)\b/i;
const TRANSACTIONAL_SENDER_PATTERN =
  /\b(no-?reply|do-?not-?reply|notifications?|billing|receipts?|support|help|security|alerts?|accounts?)\b/i;
const TRANSACTIONAL_SUBJECT_PATTERN =
  /\b(receipt|invoice|statement|verification|verify|security|password|order|booking|reservation|tracking|shipment|shipped|delivery|refund|payment|bill|otp|one-time code|alert|login|sign[\s-]?in|pull request|mentioned|commented)\b/i;
const PROMOTIONAL_SUBJECT_PATTERN = /\b(sale|discount|coupon|deal|promo)\b/i;
const CONTENT_HINT_PATH_PATTERN =
  /\/(p|posts?|article|articles|blog|blogs?|stories?|issues?|newsletter|dispatch|edition|episode|watch|status)\b/i;
const NON_CONTENT_URL_PATTERN =
  /\b(unsubscribe|subscription|preferences?|manage|settings|account|billing|privacy|terms|login|sign[\s-]?in|view[\s_-]*in[\s_-]*browser|webview|support|help|feedback)\b/i;
const NON_CONTENT_ANCHOR_PATTERN =
  /\b(unsubscribe|manage|preferences?|privacy|terms|view\s+in\s+browser|login|sign[\s-]?in|support|help|share|follow)\b/i;
const EXCLUDED_HOST_PATTERN =
  /(^|\.)mail\.google\.com$|(^|\.)accounts\.google\.com$|(^|\.)googleusercontent\.com$/i;
const SUBSTACK_REDIRECT_HOST_PATTERN = /(^|\.)substack\.com$/i;
const OPEN_SUBSTACK_HOST_PATTERN = /(^|\.)open\.substack\.com$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const REDIRECT_PARAM_NAMES = [
  'url',
  'u',
  'q',
  'target',
  'to',
  'destination',
  'dest',
  'redirect',
  'redirect_url',
  'redirect_uri',
  'redirecturl',
  'link',
  'href',
];

type NewsletterUrlCandidateSource = 'html_anchor' | 'text' | 'snippet';

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
  payload?: GmailMessagePayloadPart;
};

type GmailMessagePayloadPart = {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: {
    data?: string;
    size?: number;
    attachmentId?: string;
  };
  parts?: GmailMessagePayloadPart[];
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

type NewsletterUrlCandidate = {
  url: string;
  anchorText: string | null;
  source: NewsletterUrlCandidateSource;
  index: number;
};

interface MessageIdFetchResult {
  mode: 'initial' | 'incremental';
  ids: string[];
  latestHistoryId: string | null;
}

interface FeedSeedResult {
  created: boolean;
  reason:
    | 'created'
    | 'already_exists'
    | 'restored_from_archive'
    | 'no_matching_message'
    | 'no_search_query';
}

export interface FeedBackfillResult {
  createdCount: number;
  restoredCount: number;
  matchedCount: number;
  reason: 'completed' | 'no_matching_message' | 'no_search_query';
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

function decodeBase64Url(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function normalizeCandidateUrl(rawUrl: string): string | null {
  const trimmed = rawUrl
    .trim()
    .replace(/^[<("'[]+/, '')
    .replace(/[>"')\].,;!?]+$/, '');

  if (!trimmed) {
    return null;
  }

  let current = trimmed;

  for (let depth = 0; depth < 3; depth += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    let redirected: string | null = null;
    for (const key of REDIRECT_PARAM_NAMES) {
      const value = parsed.searchParams.get(key);
      if (!value) {
        continue;
      }

      const candidates = [value];
      try {
        candidates.push(decodeURIComponent(value));
      } catch {
        // Keep best-effort raw value when URL decoding fails.
      }

      redirected =
        candidates.find((candidate) => /^https?:\/\//i.test(candidate)) ??
        candidates.find((candidate) => /^https?%3A%2F%2F/i.test(candidate)) ??
        null;
      if (redirected) {
        break;
      }
    }

    if (!redirected) {
      break;
    }

    try {
      current = redirected.startsWith('http')
        ? redirected
        : decodeURIComponent(redirected.replace(/\+/g, '%20'));
    } catch {
      current = redirected;
    }
  }

  if (!/^https?:\/\//i.test(current)) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(current);
  } catch {
    return null;
  }

  // Convert Substack "open" share URLs to direct publication article URLs.
  if (OPEN_SUBSTACK_HOST_PATTERN.test(parsedUrl.hostname)) {
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    if (pathSegments.length >= 4 && pathSegments[0] === 'pub' && pathSegments[2] === 'p') {
      const publication = pathSegments[1];
      const slug = pathSegments[3];
      if (publication && slug) {
        current = `https://${publication}.substack.com/p/${slug}`;
      }
    }
  }

  const parsed = parseLink(current);
  return parsed?.canonicalUrl ?? current;
}

function extractRootDomain(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) {
    return null;
  }

  const hostLike = raw.includes('@') ? (raw.split('@').pop() ?? '') : raw;
  const normalized = hostLike.replace(/^www\./, '').replace(/[<>]/g, '');
  const parts = normalized.split('.').filter(Boolean);
  if (parts.length < 2) {
    return normalized || null;
  }

  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

function isNonContentUrl(url: string, unsubscribeUrl: string | null): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  if (EXCLUDED_HOST_PATTERN.test(parsed.hostname)) {
    return true;
  }

  const text = `${parsed.pathname} ${parsed.search}`.toLowerCase();
  if (NON_CONTENT_URL_PATTERN.test(text)) {
    return true;
  }

  if (unsubscribeUrl) {
    const normalizedUnsubscribeUrl = normalizeCandidateUrl(unsubscribeUrl);
    if (normalizedUnsubscribeUrl && normalizedUnsubscribeUrl === url) {
      return true;
    }
  }

  return false;
}

function scoreNewsletterCandidate(
  candidate: NewsletterUrlCandidate,
  params: {
    unsubscribeUrl: string | null;
    fromAddress: string;
    listId: string | null;
  }
): number {
  const normalizedUrl = normalizeCandidateUrl(candidate.url);
  if (!normalizedUrl || isNonContentUrl(normalizedUrl, params.unsubscribeUrl)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (candidate.source === 'html_anchor') {
    score += 1.3;
  } else if (candidate.source === 'text') {
    score += 1;
  } else {
    score += 0.7;
  }

  const anchorText = (candidate.anchorText ?? '').trim().toLowerCase();
  if (anchorText) {
    if (NON_CONTENT_ANCHOR_PATTERN.test(anchorText)) {
      score -= 1.1;
    } else if (anchorText.length > 8) {
      score += 0.35;
    }
  }

  try {
    const url = new URL(normalizedUrl);
    const path = url.pathname.toLowerCase();
    const rootDomain = extractRootDomain(url.hostname);
    const senderRootDomain = extractRootDomain(params.fromAddress);
    const listRootDomain = extractRootDomain(params.listId);

    if (CONTENT_HINT_PATH_PATTERN.test(path)) {
      score += 1.35;
    }

    if (url.hostname.endsWith('.substack.com')) {
      score += 0.75;
      if (path.startsWith('/p/')) {
        score += 1.1;
      }
    }

    if (rootDomain && senderRootDomain && rootDomain === senderRootDomain) {
      score += 0.5;
    }

    if (rootDomain && listRootDomain && rootDomain === listRootDomain) {
      score += 0.35;
    }
  } catch {
    return Number.NEGATIVE_INFINITY;
  }

  score -= candidate.index * 0.015;

  return score;
}

export function selectBestNewsletterIssueUrl(params: {
  candidates: NewsletterUrlCandidate[];
  unsubscribeUrl: string | null;
  fromAddress: string;
  listId: string | null;
}): string | null {
  let bestUrl: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestIndex = Number.MAX_SAFE_INTEGER;
  const seen = new Set<string>();

  for (const candidate of params.candidates) {
    const normalizedUrl = normalizeCandidateUrl(candidate.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      continue;
    }
    seen.add(normalizedUrl);

    const score = scoreNewsletterCandidate(
      {
        ...candidate,
        url: normalizedUrl,
      },
      {
        unsubscribeUrl: params.unsubscribeUrl,
        fromAddress: params.fromAddress,
        listId: params.listId,
      }
    );

    if (!Number.isFinite(score)) {
      continue;
    }

    if (score > bestScore || (score === bestScore && candidate.index < bestIndex)) {
      bestScore = score;
      bestIndex = candidate.index;
      bestUrl = normalizedUrl;
    }
  }

  return bestUrl;
}

function collectDecodedBodies(
  part: GmailMessagePayloadPart | undefined,
  buffers: { htmlBodies: string[]; textBodies: string[] }
): void {
  if (!part) {
    return;
  }

  const decoded = decodeBase64Url(part.body?.data);
  if (decoded) {
    const mimeType = (part.mimeType ?? '').toLowerCase();
    if (mimeType.includes('text/html')) {
      buffers.htmlBodies.push(decoded);
    } else if (mimeType.includes('text/plain')) {
      buffers.textBodies.push(decoded);
    }
  }

  for (const nestedPart of part.parts ?? []) {
    collectDecodedBodies(nestedPart, buffers);
  }
}

function extractAnchorCandidatesFromHtml(
  html: string,
  startIndex: number
): NewsletterUrlCandidate[] {
  try {
    const { document } = parseHTML(html);
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const candidates: NewsletterUrlCandidate[] = [];

    for (const [index, anchor] of anchors.entries()) {
      const href = anchor.getAttribute('href');
      if (!href) {
        continue;
      }

      candidates.push({
        url: href,
        anchorText: anchor.textContent ? anchor.textContent.trim() : null,
        source: 'html_anchor',
        index: startIndex + index,
      });
    }

    return candidates;
  } catch {
    return [];
  }
}

function extractTextCandidates(
  text: string,
  source: NewsletterUrlCandidateSource,
  startIndex: number
) {
  const matches = Array.from(text.matchAll(URL_PATTERN));
  return matches.map((match, index) => ({
    url: match[0],
    anchorText: null,
    source,
    index: startIndex + index,
  }));
}

async function fetchMessageFull(
  accessToken: string,
  messageId: string
): Promise<GmailMessageMetadata> {
  const params = new URLSearchParams({
    format: 'full',
  });

  return gmailGet<GmailMessageMetadata>(
    accessToken,
    `messages/${encodeURIComponent(messageId)}?${params.toString()}`
  );
}

function isSubstackRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      SUBSTACK_REDIRECT_HOST_PATTERN.test(parsed.hostname) &&
      parsed.pathname.startsWith('/redirect/')
    );
  } catch {
    return false;
  }
}

async function resolveRedirectTarget(url: string): Promise<string | null> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const response = await fetch(url, {
        method,
        redirect: 'manual',
      });
      const location = response.headers.get('location');
      if (location) {
        return new URL(location, url).toString();
      }
    } catch {
      // Best effort only.
    }
  }

  return null;
}

async function resolveKnownRedirectUrl(url: string): Promise<string> {
  let current = url;

  for (let depth = 0; depth < 2; depth += 1) {
    if (!isSubstackRedirectUrl(current)) {
      break;
    }

    const target = await resolveRedirectTarget(current);
    if (!target) {
      break;
    }

    const normalizedTarget = normalizeCandidateUrl(target);
    if (!normalizedTarget || normalizedTarget === current) {
      break;
    }

    current = normalizedTarget;
  }

  return current;
}

async function resolveIssueUrl(params: {
  accessToken: string | null;
  parsed: ParsedMessage;
}): Promise<{ url: string; source: 'full_message' | 'snippet' | 'gmail_fallback' }> {
  const snippetCandidates: NewsletterUrlCandidate[] = params.parsed.issueUrl
    ? [
        {
          url: params.parsed.issueUrl,
          anchorText: null,
          source: 'snippet',
          index: 0,
        },
      ]
    : [];

  if (params.accessToken) {
    try {
      const fullMessage = await fetchMessageFull(params.accessToken, params.parsed.messageId);
      const buffers = { htmlBodies: [] as string[], textBodies: [] as string[] };
      collectDecodedBodies(fullMessage.payload, buffers);

      const allCandidates: NewsletterUrlCandidate[] = [];
      let runningIndex = 0;

      for (const htmlBody of buffers.htmlBodies) {
        const anchorCandidates = extractAnchorCandidatesFromHtml(htmlBody, runningIndex);
        runningIndex += anchorCandidates.length;
        allCandidates.push(...anchorCandidates);

        const textCandidates = extractTextCandidates(htmlBody, 'text', runningIndex);
        runningIndex += textCandidates.length;
        allCandidates.push(...textCandidates);
      }

      for (const textBody of buffers.textBodies) {
        const textCandidates = extractTextCandidates(textBody, 'text', runningIndex);
        runningIndex += textCandidates.length;
        allCandidates.push(...textCandidates);
      }

      allCandidates.push(...snippetCandidates.map((candidate, index) => ({ ...candidate, index })));

      const bestFromFullMessage = selectBestNewsletterIssueUrl({
        candidates: allCandidates,
        unsubscribeUrl: params.parsed.unsubscribeUrl,
        fromAddress: params.parsed.fromAddress,
        listId: params.parsed.listId,
      });

      if (bestFromFullMessage) {
        return {
          url: await resolveKnownRedirectUrl(bestFromFullMessage),
          source: 'full_message',
        };
      }
    } catch (error) {
      gmailLogger.warn('Failed to resolve newsletter issue URL from full Gmail message', {
        messageId: params.parsed.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const bestFromSnippet = selectBestNewsletterIssueUrl({
    candidates: snippetCandidates,
    unsubscribeUrl: params.parsed.unsubscribeUrl,
    fromAddress: params.parsed.fromAddress,
    listId: params.parsed.listId,
  });

  if (bestFromSnippet) {
    return {
      url: await resolveKnownRedirectUrl(bestFromSnippet),
      source: 'snippet',
    };
  }

  return {
    url: buildGmailFallbackUrl(params.parsed.threadId),
    source: 'gmail_fallback',
  };
}

async function maybeUpgradeExistingNewsletterItem(params: {
  db: Database;
  itemId: string;
  parsed: ParsedMessage;
  accessToken: string | null;
}): Promise<void> {
  const existingItem = await params.db.query.items.findFirst({
    where: eq(items.id, params.itemId),
    columns: {
      id: true,
      canonicalUrl: true,
      creatorId: true,
      thumbnailUrl: true,
      rawMetadata: true,
    },
  });

  if (!existingItem) {
    return;
  }

  let canonicalUrl = existingItem.canonicalUrl;
  let rawMetadata = existingItem.rawMetadata;
  let shouldPersistCanonicalUpdate = false;

  const shouldAttemptUpgrade =
    isGmailFallbackUrl(existingItem.canonicalUrl) ||
    isSubstackRedirectUrl(existingItem.canonicalUrl) ||
    isOpenSubstackUrl(existingItem.canonicalUrl);

  if (shouldAttemptUpgrade) {
    const resolved = await resolveIssueUrl({
      accessToken: params.accessToken,
      parsed: params.parsed,
    });

    if (shouldUpgradeNewsletterIssueUrl(existingItem.canonicalUrl, resolved.url)) {
      let metadata: Record<string, unknown> = {};
      if (existingItem.rawMetadata) {
        try {
          const parsedMetadata = JSON.parse(existingItem.rawMetadata);
          if (
            parsedMetadata &&
            typeof parsedMetadata === 'object' &&
            !Array.isArray(parsedMetadata)
          ) {
            metadata = parsedMetadata as Record<string, unknown>;
          }
        } catch {
          metadata = {};
        }
      }

      metadata.issueUrlSource = resolved.source;
      metadata.previousCanonicalUrl = existingItem.canonicalUrl;
      metadata.issueUrlUpgradedAt = new Date().toISOString();

      canonicalUrl = resolved.url;
      rawMetadata = JSON.stringify(metadata);
      shouldPersistCanonicalUpdate = true;
    }
  }

  const newsletterAvatarUrl = buildNewsletterAvatarUrl({
    canonicalUrl,
    listId: params.parsed.listId,
    fromAddress: params.parsed.fromAddress,
    unsubscribeUrl: params.parsed.unsubscribeUrl,
    creatorHandle: params.parsed.fromAddress,
  });

  const itemUpdates: Partial<typeof items.$inferInsert> = {};
  if (shouldPersistCanonicalUpdate) {
    itemUpdates.canonicalUrl = canonicalUrl;
    itemUpdates.rawMetadata = rawMetadata;
  }

  let creatorId = existingItem.creatorId;
  if (!creatorId) {
    const creator = await findOrCreateCreator(
      { db: params.db },
      {
        provider: Provider.GMAIL,
        providerCreatorId: params.parsed.canonicalKey,
        name: params.parsed.fromDisplayName,
        handle: params.parsed.fromAddress,
        externalUrl: canonicalUrl,
        imageUrl: newsletterAvatarUrl ?? undefined,
      }
    );
    creatorId = creator.id;
    itemUpdates.creatorId = creator.id;
  }

  if (!existingItem.thumbnailUrl && newsletterAvatarUrl) {
    itemUpdates.thumbnailUrl = newsletterAvatarUrl;
  }

  if (Object.keys(itemUpdates).length > 0) {
    itemUpdates.updatedAt = new Date().toISOString();
    await params.db.update(items).set(itemUpdates).where(eq(items.id, existingItem.id));
  }

  if (newsletterAvatarUrl && creatorId) {
    const creator = await params.db.query.creators.findFirst({
      where: eq(creators.id, creatorId),
      columns: {
        id: true,
        imageUrl: true,
      },
    });

    if (creator && !creator.imageUrl) {
      await params.db
        .update(creators)
        .set({
          imageUrl: newsletterAvatarUrl,
          updatedAt: Date.now(),
        })
        .where(eq(creators.id, creator.id));
    }
  }
}

function containsPattern(pattern: RegExp, ...values: Array<string | null | undefined>): boolean {
  return values.some((value) => !!value && pattern.test(value));
}

export function isLikelyNewsletterFeedIdentity(params: {
  listId: string | null;
  unsubscribeMailto: string | null;
  unsubscribeUrl: string | null;
  fromAddress: string | null;
  displayName: string | null;
}): boolean {
  const hasListId = !!params.listId;
  const hasListUnsubscribe = !!params.unsubscribeMailto || !!params.unsubscribeUrl;
  const hasNewsletterKeywords = containsPattern(
    NEWSLETTER_KEYWORD_PATTERN,
    params.fromAddress,
    params.displayName,
    params.listId
  );
  const hasPlatformSignal = containsPattern(
    NEWSLETTER_PLATFORM_PATTERN,
    params.fromAddress,
    params.listId,
    params.unsubscribeMailto,
    params.unsubscribeUrl
  );
  const hasSemanticNewsletterSignal = hasNewsletterKeywords || hasPlatformSignal;
  const isTransactionalSender = containsPattern(
    TRANSACTIONAL_SENDER_PATTERN,
    params.fromAddress,
    params.displayName
  );

  if (isTransactionalSender && !hasNewsletterKeywords && !hasPlatformSignal) {
    return false;
  }

  if (!hasListId && !hasListUnsubscribe && !hasPlatformSignal) {
    return false;
  }

  // Structural headers alone are too noisy (e.g., transactional brands like Uber/GitHub).
  // Require at least one semantic newsletter signal for feed-level visibility.
  if (!hasSemanticNewsletterSignal) {
    return false;
  }

  return hasListId || hasListUnsubscribe || hasSemanticNewsletterSignal;
}

export function computeNewsletterScore(params: {
  listId: string | null;
  listUnsubscribe: string | null;
  unsubscribeMailto: string | null;
  unsubscribeUrl: string | null;
  unsubscribePostHeader: string | null;
  fromAddress: string;
  fromDisplayName: string;
  subject: string;
}): NewsletterDetection {
  const hasListId = !!params.listId;
  const hasListUnsubscribe =
    !!params.listUnsubscribe || !!params.unsubscribeMailto || !!params.unsubscribeUrl;
  const hasOneClick = params.unsubscribePostHeader?.toLowerCase().includes('one-click') ?? false;
  const hasNewsletterKeywords = containsPattern(
    NEWSLETTER_KEYWORD_PATTERN,
    params.subject,
    params.fromAddress,
    params.fromDisplayName,
    params.listId
  );
  const hasPlatformSignal = containsPattern(
    NEWSLETTER_PLATFORM_PATTERN,
    params.fromAddress,
    params.listId,
    params.unsubscribeMailto,
    params.unsubscribeUrl
  );
  const isTransactionalSender = containsPattern(
    TRANSACTIONAL_SENDER_PATTERN,
    params.fromAddress,
    params.fromDisplayName
  );
  const isTransactionalSubject = containsPattern(TRANSACTIONAL_SUBJECT_PATTERN, params.subject);
  const isPromotionalSubject = containsPattern(PROMOTIONAL_SUBJECT_PATTERN, params.subject);

  let score = 0;

  if (hasListId) {
    score += 0.33;
  }

  if (hasListUnsubscribe) {
    score += 0.22;
  }

  if (hasOneClick) {
    score += 0.1;
  }

  if (hasNewsletterKeywords) {
    score += 0.24;
  }

  if (hasPlatformSignal) {
    score += 0.2;
  }

  if (hasListId && hasListUnsubscribe) {
    score += 0.12;
  }

  if (isTransactionalSender) {
    score -= 0.45;
  }

  if (isTransactionalSubject) {
    score -= 0.65;
  }

  if (isPromotionalSubject) {
    score -= 0.2;
  }

  if (!hasListId && !hasPlatformSignal) {
    score -= 0.2;
  }

  if (!hasListUnsubscribe && !hasNewsletterKeywords) {
    score -= 0.2;
  }

  const clamped = Math.max(0, Math.min(1, score));
  const transactionalReject =
    (isTransactionalSender || isTransactionalSubject) &&
    !hasNewsletterKeywords &&
    !hasPlatformSignal;
  const identityReject = !isLikelyNewsletterFeedIdentity({
    listId: params.listId,
    unsubscribeMailto: params.unsubscribeMailto,
    unsubscribeUrl: params.unsubscribeUrl,
    fromAddress: params.fromAddress,
    displayName: params.fromDisplayName,
  });

  return {
    isNewsletter: clamped >= NEWSLETTER_SCORE_THRESHOLD && !transactionalReject && !identityReject,
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

function isGmailFallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'mail.google.com' && parsed.pathname.startsWith('/mail/u/');
  } catch {
    return false;
  }
}

function isOpenSubstackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return OPEN_SUBSTACK_HOST_PATTERN.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function shouldUpgradeNewsletterIssueUrl(currentUrl: string, nextUrl: string): boolean {
  if (!currentUrl || !nextUrl || currentUrl === nextUrl) {
    return false;
  }

  const currentIsGmailFallback = isGmailFallbackUrl(currentUrl);
  const nextIsGmailFallback = isGmailFallbackUrl(nextUrl);
  if (currentIsGmailFallback && !nextIsGmailFallback) {
    return true;
  }

  const currentIsSubstackRedirect = isSubstackRedirectUrl(currentUrl);
  const nextIsSubstackRedirect = isSubstackRedirectUrl(nextUrl);
  if (currentIsSubstackRedirect && !nextIsSubstackRedirect) {
    return true;
  }

  const currentIsOpenSubstack = isOpenSubstackUrl(currentUrl);
  const nextIsOpenSubstack = isOpenSubstackUrl(nextUrl);
  if (currentIsOpenSubstack && !nextIsOpenSubstack) {
    return true;
  }

  return false;
}

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${GMAIL_API_BASE}/${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new GmailApiError(
      response.status,
      `Gmail API request failed (${response.status}): ${body}`
    );
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

async function fetchMessageIdsForQuery(
  accessToken: string,
  query: string,
  maxResults: number = 10
): Promise<string[]> {
  const params = new URLSearchParams({
    maxResults: String(Math.max(1, Math.min(100, maxResults))),
    q: query,
  });

  const response = await gmailGet<GmailMessageListResponse>(
    accessToken,
    `messages?${params.toString()}`
  );

  return Array.from(
    new Set(
      (response.messages ?? []).map((message) => message.id).filter((id): id is string => !!id)
    )
  );
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
    unsubscribeMailto: parsedUnsubscribe.mailto,
    unsubscribeUrl: parsedUnsubscribe.url,
    unsubscribePostHeader,
    fromAddress,
    fromDisplayName: displayName,
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
    status: 'UNSUBSCRIBED',
    firstSeenAt: parsed.internalDateMs,
    lastSeenAt: parsed.internalDateMs,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: feedId,
    status: 'UNSUBSCRIBED' as NewsletterFeedStatus,
  };
}

async function ingestNewsletterMessage(params: {
  db: Database;
  userId: string;
  mailboxId: string;
  googleSub: string;
  parsed: ParsedMessage;
  feedId: string;
  accessToken: string | null;
}): Promise<boolean> {
  const existingMapping = await params.db.query.newsletterFeedMessages.findFirst({
    where: and(
      eq(newsletterFeedMessages.userId, params.userId),
      eq(newsletterFeedMessages.gmailMessageId, params.parsed.messageId)
    ),
    columns: { id: true, itemId: true },
  });

  if (existingMapping) {
    await maybeUpgradeExistingNewsletterItem({
      db: params.db,
      itemId: existingMapping.itemId,
      parsed: params.parsed,
      accessToken: params.accessToken,
    });
    return false;
  }

  const providerId = `${params.googleSub}:${params.parsed.messageId}`;
  const issueUrlResolution = await resolveIssueUrl({
    accessToken: params.accessToken,
    parsed: params.parsed,
  });
  const issueUrl = issueUrlResolution.url;
  const newsletterAvatarUrl = buildNewsletterAvatarUrl({
    canonicalUrl: issueUrl,
    listId: params.parsed.listId,
    fromAddress: params.parsed.fromAddress,
    unsubscribeUrl: params.parsed.unsubscribeUrl,
    creatorHandle: params.parsed.fromAddress,
  });
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
      imageUrl: newsletterAvatarUrl ?? undefined,
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
      thumbnailUrl: newsletterAvatarUrl,
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
        issueUrlSource: issueUrlResolution.source,
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

function normalizeListIdForSearch(listId: string | null): string | null {
  if (!listId) {
    return null;
  }

  return listId.replace(/[<>]/g, '').trim() || null;
}

function buildFeedSearchQueries(feed: {
  listId: string | null;
  fromAddress: string | null;
}): string[] {
  const queries: string[] = [];
  const normalizedListId = normalizeListIdForSearch(feed.listId);

  if (normalizedListId) {
    queries.push(`in:inbox list:${normalizedListId}`);
  }

  if (feed.fromAddress) {
    const normalizedFromAddress = feed.fromAddress.trim().toLowerCase();
    if (normalizedFromAddress) {
      queries.push(`in:inbox from:${normalizedFromAddress}`);
    }
  }

  return Array.from(new Set(queries));
}

export async function seedLatestNewsletterItemForFeed(params: {
  db: Database;
  userId: string;
  feedId: string;
  env: TokenRefreshEnv;
}): Promise<FeedSeedResult> {
  const result = await backfillNewsletterItemsForFeedInternal({
    ...params,
    maxItems: 1,
    maxResultsPerQuery: 12,
  });

  if (result.reason === 'no_search_query') {
    return { created: false, reason: 'no_search_query' };
  }

  if (result.reason === 'no_matching_message') {
    return { created: false, reason: 'no_matching_message' };
  }

  if (result.restoredCount > 0) {
    return {
      created: true,
      reason: 'restored_from_archive',
    };
  }

  if (result.createdCount > 0) {
    return {
      created: true,
      reason: 'created',
    };
  }

  return {
    created: false,
    reason: 'already_exists',
  };
}

export async function backfillNewsletterItemsForFeed(params: {
  db: Database;
  userId: string;
  feedId: string;
  env: TokenRefreshEnv;
  maxItems?: number;
  maxResultsPerQuery?: number;
}): Promise<FeedBackfillResult> {
  return backfillNewsletterItemsForFeedInternal({
    ...params,
    maxItems: params.maxItems ?? 20,
    maxResultsPerQuery: params.maxResultsPerQuery ?? 60,
  });
}

async function backfillNewsletterItemsForFeedInternal(params: {
  db: Database;
  userId: string;
  feedId: string;
  env: TokenRefreshEnv;
  maxItems: number;
  maxResultsPerQuery: number;
}): Promise<FeedBackfillResult> {
  const connection = await getGmailConnection(params.userId, params.db);
  if (!connection) {
    throw new Error('No active Gmail connection found');
  }

  const feed = await params.db.query.newsletterFeeds.findFirst({
    where: and(eq(newsletterFeeds.id, params.feedId), eq(newsletterFeeds.userId, params.userId)),
    columns: {
      id: true,
      gmailMailboxId: true,
      canonicalKey: true,
      listId: true,
      fromAddress: true,
    },
  });

  if (!feed) {
    throw new Error('Newsletter feed not found');
  }

  const mailbox = await params.db.query.gmailMailboxes.findFirst({
    where: and(
      eq(gmailMailboxes.id, feed.gmailMailboxId),
      eq(gmailMailboxes.userId, params.userId)
    ),
    columns: {
      id: true,
      googleSub: true,
    },
  });

  if (!mailbox) {
    throw new Error('Gmail mailbox not found for newsletter feed');
  }

  const accessToken = await getValidAccessToken(connection, params.env);
  const searchQueries = buildFeedSearchQueries({
    listId: feed.listId,
    fromAddress: feed.fromAddress,
  });

  if (searchQueries.length === 0) {
    return {
      createdCount: 0,
      restoredCount: 0,
      matchedCount: 0,
      reason: 'no_search_query',
    };
  }

  const candidateMessageIds: string[] = [];
  const maxResultsPerQuery = Math.max(1, Math.min(100, params.maxResultsPerQuery));
  for (const query of searchQueries) {
    const ids = await fetchMessageIdsForQuery(accessToken, query, maxResultsPerQuery);
    candidateMessageIds.push(...ids);
  }

  const uniqueCandidateIds = Array.from(new Set(candidateMessageIds));
  let createdCount = 0;
  let restoredCount = 0;
  let matchedCount = 0;
  const maxItems = Math.max(1, params.maxItems);

  for (const messageId of uniqueCandidateIds) {
    if (createdCount + restoredCount >= maxItems) {
      break;
    }

    let metadata: GmailMessageMetadata;
    try {
      metadata = await fetchMessageMetadata(accessToken, messageId);
    } catch (error) {
      gmailLogger.warn('Failed to fetch candidate newsletter message while seeding latest item', {
        userId: params.userId,
        feedId: feed.id,
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const parsed = parseMessage(metadata);

    if (!parsed || !parsed.detection.isNewsletter) {
      continue;
    }

    if (parsed.canonicalKey !== feed.canonicalKey) {
      continue;
    }

    matchedCount += 1;

    const created = await ingestNewsletterMessage({
      db: params.db,
      userId: params.userId,
      mailboxId: mailbox.id,
      googleSub: mailbox.googleSub,
      parsed,
      feedId: feed.id,
      accessToken,
    });

    if (created) {
      createdCount += 1;
      continue;
    }

    // If this item already existed in ARCHIVED state from prior experimentation,
    // bring it back into INBOX when the user explicitly subscribes.
    const providerId = `${mailbox.googleSub}:${parsed.messageId}`;
    const existingItem = await params.db.query.items.findFirst({
      where: and(eq(items.provider, Provider.GMAIL), eq(items.providerId, providerId)),
      columns: { id: true },
    });

    if (existingItem) {
      const userItem = await params.db.query.userItems.findFirst({
        where: and(eq(userItems.userId, params.userId), eq(userItems.itemId, existingItem.id)),
        columns: { id: true, state: true },
      });

      if (userItem?.state === 'ARCHIVED') {
        const nowIso = new Date().toISOString();
        await params.db
          .update(userItems)
          .set({
            state: 'INBOX',
            archivedAt: null,
            ingestedAt: nowIso,
            updatedAt: nowIso,
          })
          .where(eq(userItems.id, userItem.id));
        restoredCount += 1;
      }
    }
  }

  if (matchedCount === 0) {
    return {
      createdCount,
      restoredCount,
      matchedCount,
      reason: 'no_matching_message',
    };
  }

  return {
    createdCount,
    restoredCount,
    matchedCount,
    reason: 'completed',
  };
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
        accessToken,
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
  const lockAcquired = await tryAcquireLock(
    env.OAUTH_STATE_KV,
    GMAIL_POLL_LOCK_KEY,
    GMAIL_POLL_LOCK_TTL
  );
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
        const result = await syncGmailNewslettersForUser(
          mailbox.userId,
          db,
          env as TokenRefreshEnv,
          {
            mailboxId: mailbox.id,
          }
        );
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
