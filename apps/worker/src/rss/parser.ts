import { XMLParser } from 'fast-xml-parser';

import { deriveIdentityHash, normalizeContentUrl } from './url';

export interface ParsedRssEntry {
  entryId: string;
  providerId: string;
  canonicalUrl: string;
  title: string;
  summary?: string;
  creator?: string;
  creatorImageUrl?: string;
  publishedAt?: number;
  imageUrl?: string;
}

export interface ParsedRssFeed {
  title?: string;
  description?: string;
  siteUrl?: string;
  imageUrl?: string;
  entries: ParsedRssEntry[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  parseTagValue: true,
  parseAttributeValue: false,
  processEntities: true,
});

const IMG_SRC_REGEX = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'<>`]+))/i;

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = ['#text', '__cdata', '$text', 'text'];
    for (const key of candidates) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }

  return null;
}

function firstText(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = textValue(record[key]);
    if (value) return value;
  }
  return null;
}

function toTimestamp(value: string | null): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return timestamp;
}

function decodeCommonHtmlEntities(input: string): string {
  return input
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function extractImageFromHtmlSnippet(value: string): string | null {
  const extractFrom = (candidate: string): string | null => {
    const match = IMG_SRC_REGEX.exec(candidate);
    if (!match) return null;
    return match[1] ?? match[2] ?? match[3] ?? null;
  };

  const directMatch = extractFrom(value);
  if (directMatch) return directMatch;

  const decoded = decodeCommonHtmlEntities(value);
  if (decoded !== value) {
    return extractFrom(decoded);
  }

  return null;
}

function resolveEntryIdentity(params: {
  feedUrl: string;
  guid: string | null;
  link: string | null;
  title: string;
  summary: string;
  publishedAt: number | null;
}): Pick<ParsedRssEntry, 'entryId' | 'providerId' | 'canonicalUrl'> {
  const canonicalFromLink = normalizeContentUrl(params.link, params.feedUrl);
  const canonicalFromGuid = normalizeContentUrl(params.guid, params.feedUrl);
  const fallbackHash = deriveIdentityHash({
    feedUrl: params.feedUrl,
    title: params.title,
    summary: params.summary,
    publishedAt: params.publishedAt,
  });

  const canonicalUrl =
    canonicalFromLink ?? canonicalFromGuid ?? `${params.feedUrl}#entry-${fallbackHash}`;
  const entryId = params.guid ?? canonicalFromLink ?? canonicalFromGuid ?? fallbackHash;
  const providerId = canonicalFromLink ?? canonicalFromGuid ?? params.guid ?? fallbackHash;

  return { entryId, providerId, canonicalUrl };
}

function parseRssChannel(channel: Record<string, unknown>, feedUrl: string): ParsedRssFeed {
  const title = firstText(channel, ['title']) ?? undefined;
  const description = firstText(channel, ['description', 'subtitle']) ?? undefined;
  const siteUrl = normalizeContentUrl(firstText(channel, ['link']), feedUrl) ?? undefined;

  const imageNode = (channel.image as Record<string, unknown> | undefined) ?? {};
  const imageUrl =
    normalizeContentUrl(
      firstText(imageNode, ['url', 'href']) ?? firstText(channel, ['itunes:image']),
      feedUrl
    ) ?? undefined;

  const items = asArray<Record<string, unknown>>(channel.item as Record<string, unknown>[]);
  const entries = items
    .map((item) => {
      const itemTitle = firstText(item, ['title']) ?? 'Untitled';
      const summary =
        firstText(item, ['description', 'content:encoded', 'content', 'summary']) ?? '';
      const publishedAt = toTimestamp(
        firstText(item, ['pubDate', 'published', 'updated', 'dc:date'])
      );
      const creator = firstText(item, ['dc:creator', 'author', 'creator']) ?? title ?? 'Unknown';

      const enclosure = (item.enclosure as Record<string, unknown> | undefined) ?? {};
      const mediaContent = (item['media:content'] as Record<string, unknown> | undefined) ?? {};
      const mediaThumbnail = (item['media:thumbnail'] as Record<string, unknown> | undefined) ?? {};

      const imageCandidate =
        textValue(mediaContent.url) ??
        textValue(mediaThumbnail.url) ??
        textValue(enclosure.url) ??
        firstText(item, ['image']) ??
        extractImageFromHtmlSnippet(summary);

      const identity = resolveEntryIdentity({
        feedUrl,
        guid: firstText(item, ['guid', 'id']),
        link: firstText(item, ['link']),
        title: itemTitle,
        summary,
        publishedAt: publishedAt ?? null,
      });

      return {
        entryId: identity.entryId,
        providerId: identity.providerId,
        canonicalUrl: identity.canonicalUrl,
        title: itemTitle,
        summary: summary || undefined,
        creator,
        creatorImageUrl: imageUrl,
        publishedAt,
        imageUrl: normalizeContentUrl(imageCandidate, feedUrl) ?? undefined,
      } satisfies ParsedRssEntry;
    })
    .filter((entry) => entry.title && entry.providerId);

  return {
    title,
    description,
    siteUrl,
    imageUrl,
    entries,
  };
}

function parseAtomFeed(feed: Record<string, unknown>, feedUrl: string): ParsedRssFeed {
  const title = firstText(feed, ['title']) ?? undefined;
  const description = firstText(feed, ['subtitle']) ?? undefined;

  const feedLinks = asArray<Record<string, unknown>>(feed.link as Record<string, unknown>[]);
  const siteUrl =
    normalizeContentUrl(
      textValue(
        feedLinks.find((link) => (textValue(link.rel) ?? 'alternate') === 'alternate')?.href
      ) ?? textValue(feedLinks[0]?.href),
      feedUrl
    ) ?? undefined;

  const iconUrl =
    normalizeContentUrl(
      firstText(feed, ['icon', 'logo']) ??
        textValue(
          feedLinks.find((link) => (textValue(link.rel) ?? '').toLowerCase() === 'icon')?.href
        ),
      feedUrl
    ) ?? undefined;

  const entries = asArray<Record<string, unknown>>(feed.entry as Record<string, unknown>[])
    .map((entry) => {
      const entryLinks = asArray<Record<string, unknown>>(entry.link as Record<string, unknown>[]);
      const link =
        textValue(
          entryLinks.find((candidate) => (textValue(candidate.rel) ?? 'alternate') === 'alternate')
            ?.href
        ) ?? textValue(entryLinks[0]?.href);
      const summary = firstText(entry, ['summary', 'content', 'description']) ?? '';
      const publishedAt = toTimestamp(firstText(entry, ['published', 'updated']));
      const authorNode = (entry.author as Record<string, unknown> | undefined) ?? {};
      const creator =
        firstText(authorNode, ['name']) ?? firstText(entry, ['dc:creator']) ?? title ?? 'Unknown';

      const mediaContent = (entry['media:content'] as Record<string, unknown> | undefined) ?? {};
      const mediaThumbnail =
        (entry['media:thumbnail'] as Record<string, unknown> | undefined) ?? {};

      const imageCandidate =
        textValue(mediaContent.url) ??
        textValue(mediaThumbnail.url) ??
        firstText(entry, ['image']) ??
        extractImageFromHtmlSnippet(summary);

      const itemTitle = firstText(entry, ['title']) ?? 'Untitled';
      const identity = resolveEntryIdentity({
        feedUrl,
        guid: firstText(entry, ['id']),
        link,
        title: itemTitle,
        summary,
        publishedAt: publishedAt ?? null,
      });

      return {
        entryId: identity.entryId,
        providerId: identity.providerId,
        canonicalUrl: identity.canonicalUrl,
        title: itemTitle,
        summary: summary || undefined,
        creator,
        creatorImageUrl: iconUrl,
        publishedAt,
        imageUrl: normalizeContentUrl(imageCandidate, feedUrl) ?? undefined,
      } satisfies ParsedRssEntry;
    })
    .filter((entry) => entry.title && entry.providerId);

  return {
    title,
    description,
    siteUrl,
    imageUrl: iconUrl,
    entries,
  };
}

function parseRdfFeed(rdf: Record<string, unknown>, feedUrl: string): ParsedRssFeed {
  const channel = (rdf.channel as Record<string, unknown> | undefined) ?? {};
  const parsed = parseRssChannel(
    {
      ...channel,
      item: rdf.item,
    },
    feedUrl
  );

  return parsed;
}

export function parseRssFeedXml(xml: string, feedUrl: string): ParsedRssFeed {
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(xml) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid XML feed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (parsed.rss && typeof parsed.rss === 'object') {
    const rss = parsed.rss as Record<string, unknown>;
    const channel = rss.channel as Record<string, unknown> | undefined;
    if (!channel) {
      throw new Error('Invalid RSS feed: missing channel');
    }
    return parseRssChannel(channel, feedUrl);
  }

  if (parsed.feed && typeof parsed.feed === 'object') {
    return parseAtomFeed(parsed.feed as Record<string, unknown>, feedUrl);
  }

  const rdfKey = Object.keys(parsed).find(
    (key) => key.toLowerCase().endsWith('rdf') || key.toLowerCase() === 'rdf:rdf'
  );
  if (rdfKey) {
    const rdf = parsed[rdfKey];
    if (rdf && typeof rdf === 'object') {
      return parseRdfFeed(rdf as Record<string, unknown>, feedUrl);
    }
  }

  throw new Error('Unsupported feed format (expected RSS, Atom, or RDF)');
}
