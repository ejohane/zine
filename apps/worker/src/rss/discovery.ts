import { eq } from 'drizzle-orm';

import type { Database } from '../db';
import { rssDiscoveryCache } from '../db/schema';
import { logger } from '../lib/logger';
import { parseRssFeedXml } from './parser';
import { hashString, normalizeFeedUrl } from './url';

const discoveryLogger = logger.child('rss-discovery');

const FEED_ACCEPT_HEADER =
  'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8';
const HTML_ACCEPT_HEADER =
  'text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7';

const FEED_MIME_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/xml',
  'text/xml',
]);

const COMMON_FEED_PATHS = [
  '/feed',
  '/rss',
  '/rss.xml',
  '/atom.xml',
  '/feed.xml',
  '/index.xml',
] as const;

const LINK_TAG_REGEX = /<link\b[^>]*>/gi;
const ATTRIBUTE_REGEX =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_FEED_BYTES = 1_500_000;
const MAX_VALIDATED_CANDIDATES = 5;
const MAX_CANDIDATES_TO_VALIDATE = 12;
const SUCCESS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type DiscoverySource = 'page_link' | 'site_link' | 'common_path';
type CacheStatus = 'SUCCESS' | 'EMPTY' | 'ERROR';

interface DiscoveryCandidateSeed {
  feedUrl: string;
  score: number;
  discoveredFrom: DiscoverySource;
}

export interface DiscoveredFeedCandidate {
  feedUrl: string;
  title: string | null;
  description: string | null;
  siteUrl: string | null;
  discoveredFrom: DiscoverySource;
  score: number;
}

export interface DiscoverFeedsResult {
  sourceUrl: string;
  sourceOrigin: string;
  checkedAt: number;
  cached: boolean;
  candidates: DiscoveredFeedCandidate[];
}

interface DiscoverFeedsOptions {
  refresh?: boolean;
}

function parseLinkTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let match: RegExpExecArray | null;

  ATTRIBUTE_REGEX.lastIndex = 0;
  while ((match = ATTRIBUTE_REGEX.exec(tag)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (key) {
      attributes[key] = value.trim();
    }
  }

  return attributes;
}

function looksLikeFeedHref(href: string): boolean {
  const value = href.toLowerCase();
  return (
    value.includes('/feed') ||
    value.includes('/rss') ||
    value.includes('/atom') ||
    value.endsWith('.xml')
  );
}

export function extractFeedLinksFromHtml(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  let match: RegExpExecArray | null;

  LINK_TAG_REGEX.lastIndex = 0;
  while ((match = LINK_TAG_REGEX.exec(html)) !== null) {
    const tag = match[0];
    const attrs = parseLinkTagAttributes(tag);
    const href = attrs.href;
    if (!href) continue;

    const rel = attrs.rel?.toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel?.includes('alternate')) continue;

    const mimeType = attrs.type?.toLowerCase().split(';')[0].trim() ?? null;
    if (mimeType && !FEED_MIME_TYPES.has(mimeType) && !looksLikeFeedHref(href)) {
      continue;
    }
    if (!mimeType && !looksLikeFeedHref(href)) {
      continue;
    }

    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        links.add(resolved.toString());
      }
    } catch {
      // Ignore malformed link hrefs.
    }
  }

  return [...links];
}

function parseCachedCandidates(value: string): DiscoveredFeedCandidate[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const candidate = entry as Partial<DiscoveredFeedCandidate>;
        if (
          typeof candidate.feedUrl !== 'string' ||
          typeof candidate.score !== 'number' ||
          (candidate.discoveredFrom !== 'page_link' &&
            candidate.discoveredFrom !== 'site_link' &&
            candidate.discoveredFrom !== 'common_path')
        ) {
          return null;
        }

        return {
          feedUrl: candidate.feedUrl,
          score: candidate.score,
          discoveredFrom: candidate.discoveredFrom,
          title: typeof candidate.title === 'string' ? candidate.title : null,
          description: typeof candidate.description === 'string' ? candidate.description : null,
          siteUrl: typeof candidate.siteUrl === 'string' ? candidate.siteUrl : null,
        } satisfies DiscoveredFeedCandidate;
      })
      .filter((candidate): candidate is DiscoveredFeedCandidate => candidate !== null);
  } catch {
    return [];
  }
}

async function fetchText(url: string, accept: string, maxBytes: number): Promise<string> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: accept,
      'User-Agent': 'ZineRSSDiscoveryBot/1.0 (+https://myzine.app)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const payload = await response.arrayBuffer();
  if (payload.byteLength > maxBytes) {
    throw new Error(`Payload too large (${payload.byteLength} bytes)`);
  }

  return new TextDecoder().decode(payload);
}

function addCandidate(
  candidates: Map<string, DiscoveryCandidateSeed>,
  rawUrl: string,
  discoveredFrom: DiscoverySource,
  score: number
) {
  let normalizedFeedUrl: string;
  try {
    normalizedFeedUrl = normalizeFeedUrl(rawUrl);
  } catch {
    return;
  }

  const existing = candidates.get(normalizedFeedUrl);
  if (!existing || score > existing.score) {
    candidates.set(normalizedFeedUrl, {
      feedUrl: normalizedFeedUrl,
      discoveredFrom,
      score,
    });
  }
}

async function validateFeedCandidate(
  seed: DiscoveryCandidateSeed
): Promise<DiscoveredFeedCandidate | null> {
  try {
    const xml = await fetchText(seed.feedUrl, FEED_ACCEPT_HEADER, MAX_FEED_BYTES);
    const parsed = parseRssFeedXml(xml, seed.feedUrl);

    return {
      feedUrl: seed.feedUrl,
      title: parsed.title ?? null,
      description: parsed.description ?? null,
      siteUrl: parsed.siteUrl ?? null,
      discoveredFrom: seed.discoveredFrom,
      score: seed.score,
    };
  } catch (error) {
    discoveryLogger.debug('Rejected invalid feed candidate', {
      feedUrl: seed.feedUrl,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function upsertDiscoveryCache(params: {
  db: Database;
  sourceOrigin: string;
  sourceUrl: string;
  candidates: DiscoveredFeedCandidate[];
  checkedAt: number;
  status: CacheStatus;
  lastError: string | null;
  ttlMs: number;
}) {
  const { db, sourceOrigin, sourceUrl, candidates, checkedAt, status, lastError, ttlMs } = params;
  const sourceOriginHash = hashString(sourceOrigin);
  const expiresAt = checkedAt + ttlMs;

  await db
    .insert(rssDiscoveryCache)
    .values({
      id: sourceOriginHash,
      sourceOrigin,
      sourceOriginHash,
      sourceUrl,
      candidatesJson: JSON.stringify(candidates),
      status,
      lastError,
      checkedAt,
      expiresAt,
      createdAt: checkedAt,
      updatedAt: checkedAt,
    })
    .onConflictDoUpdate({
      target: rssDiscoveryCache.sourceOrigin,
      set: {
        sourceOriginHash,
        sourceUrl,
        candidatesJson: JSON.stringify(candidates),
        status,
        lastError,
        checkedAt,
        expiresAt,
        updatedAt: checkedAt,
      },
    });
}

export async function discoverFeedsForUrl(
  db: Database,
  rawUrl: string,
  options: DiscoverFeedsOptions = {}
): Promise<DiscoverFeedsResult> {
  const sourceUrl = normalizeFeedUrl(rawUrl);
  const sourceOrigin = new URL(sourceUrl).origin;
  const now = Date.now();

  const cached = await db.query.rssDiscoveryCache.findFirst({
    where: eq(rssDiscoveryCache.sourceOrigin, sourceOrigin),
  });

  if (cached && !options.refresh && cached.expiresAt > now) {
    return {
      sourceUrl,
      sourceOrigin,
      checkedAt: cached.checkedAt,
      cached: true,
      candidates: parseCachedCandidates(cached.candidatesJson),
    };
  }

  const candidateSeeds = new Map<string, DiscoveryCandidateSeed>();
  let lastError: string | null = null;

  try {
    try {
      const sourceHtml = await fetchText(sourceUrl, HTML_ACCEPT_HEADER, MAX_HTML_BYTES);
      const pageLinks = extractFeedLinksFromHtml(sourceHtml, sourceUrl);
      for (const link of pageLinks) {
        addCandidate(candidateSeeds, link, 'page_link', 100);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      discoveryLogger.debug('Failed to inspect article page for feed links', {
        sourceUrl,
        error: lastError,
      });
    }

    const homepageUrl = `${sourceOrigin}/`;
    if (homepageUrl !== sourceUrl) {
      try {
        const homepageHtml = await fetchText(homepageUrl, HTML_ACCEPT_HEADER, MAX_HTML_BYTES);
        const homepageLinks = extractFeedLinksFromHtml(homepageHtml, homepageUrl);
        for (const link of homepageLinks) {
          addCandidate(candidateSeeds, link, 'site_link', 80);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!lastError) {
          lastError = message;
        }
        discoveryLogger.debug('Failed to inspect homepage for feed links', {
          sourceOrigin,
          error: message,
        });
      }
    }

    for (let index = 0; index < COMMON_FEED_PATHS.length; index += 1) {
      const path = COMMON_FEED_PATHS[index];
      const url = new URL(path, sourceOrigin).toString();
      addCandidate(candidateSeeds, url, 'common_path', 50 - index);
    }

    const rankedCandidates = [...candidateSeeds.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES_TO_VALIDATE);

    const candidates: DiscoveredFeedCandidate[] = [];
    for (const seed of rankedCandidates) {
      const validated = await validateFeedCandidate(seed);
      if (!validated) continue;
      candidates.push(validated);
      if (candidates.length >= MAX_VALIDATED_CANDIDATES) {
        break;
      }
    }

    const checkedAt = Date.now();
    const status: CacheStatus = candidates.length > 0 ? 'SUCCESS' : 'EMPTY';
    const ttlMs = candidates.length > 0 ? SUCCESS_CACHE_TTL_MS : EMPTY_CACHE_TTL_MS;

    await upsertDiscoveryCache({
      db,
      sourceOrigin,
      sourceUrl,
      candidates,
      checkedAt,
      status,
      lastError,
      ttlMs,
    });

    return {
      sourceUrl,
      sourceOrigin,
      checkedAt,
      cached: false,
      candidates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const checkedAt = Date.now();
    await upsertDiscoveryCache({
      db,
      sourceOrigin,
      sourceUrl,
      candidates: [],
      checkedAt,
      status: 'ERROR',
      lastError: message,
      ttlMs: ERROR_CACHE_TTL_MS,
    });

    discoveryLogger.error('RSS discovery failed', {
      sourceUrl,
      error: message,
    });

    return {
      sourceUrl,
      sourceOrigin,
      checkedAt,
      cached: false,
      candidates: [],
    };
  }
}
