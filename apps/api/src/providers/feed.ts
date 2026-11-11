import { XMLParser } from 'fast-xml-parser';
import { parseHTML } from 'linkedom';
import { creatorImageReference, publicUrl } from '../identity';
import { ProviderError } from '../remote';

export interface FeedEntry {
  id: string;
  url: string;
  title: string;
  description?: string;
  text?: string;
  html?: string;
  creator?: string;
  publishedAt?: string;
  publishedPrecision?: 'day' | 'month' | 'year';
  eventAt?: string;
  kind: string;
  durationSeconds?: number;
  thumbnail?: string;
  creatorImageUrl?: string;
  enclosures: { url: string; type?: string }[];
  transcripts: { url: string; type?: string; language?: string }[];
}
export interface Feed {
  title: string;
  url: string;
  homeUrl?: string;
  description?: string;
  entries: FeedEntry[];
  nextUrl?: string;
}
type Obj = Record<string, unknown>;
const array = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const object = (value: unknown): Obj => (value && typeof value === 'object' ? (value as Obj) : {});
function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const v = object(value);
  return typeof v['#text'] === 'string' ? v['#text'] : '';
}
function date(value: unknown) {
  const input = text(value);
  const timestamp = Date.parse(input);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
function clean(input: string) {
  const { document } = parseHTML(`<html><body>${input}</body></html>`);
  for (const n of document.querySelectorAll('script,style,noscript')) n.remove();
  return document.body.textContent?.trim() ?? '';
}
function absolute(input: string, base: string) {
  try {
    return publicUrl(new URL(input, base).toString()).toString();
  } catch {
    return undefined;
  }
}
function duration(input: unknown) {
  const value = text(input);
  if (!value) return undefined;
  const parts = value.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return undefined;
  return parts.reduce((total, n) => total * 60 + n, 0);
}
function enclosureKind(types: (string | undefined)[]) {
  return types.some((t) => t?.startsWith('audio/'))
    ? 'podcast_episode'
    : types.some((t) => t?.startsWith('video/'))
      ? 'video'
      : 'article';
}

function mediaMetadata(item: Obj, base: string) {
  const groups = [...array(item['media:group']).map(object), item];
  const content = groups.flatMap((group) => array(group['media:content']).map(object));
  const thumbnails = groups.flatMap((group) => array(group['media:thumbnail']).map(object));
  thumbnails.sort(
    (a, b) =>
      Number(b['@_width'] ?? 0) * Number(b['@_height'] ?? 0) -
      Number(a['@_width'] ?? 0) * Number(a['@_height'] ?? 0)
  );
  const thumbnail =
    thumbnails.map((t) => absolute(text(t['@_url']), base)).find(Boolean) ??
    absolute(text(object(item['itunes:image'])['@_href']), base);
  return {
    description: groups.map((group) => clean(text(group['media:description']))).find(Boolean),
    thumbnail,
    durationSeconds: duration(content[0]?.['@_duration']),
    enclosures: content
      .map((value) => ({
        url: absolute(text(value['@_url']), base) ?? '',
        type: text(value['@_type']) || undefined,
      }))
      .filter((value) => value.url),
  };
}
function uniqueEnclosures(values: FeedEntry['enclosures']) {
  return values.filter(
    (entry, index) => values.findIndex((other) => other.url === entry.url) === index
  );
}

export function parseFeed(body: string, url: string): Feed {
  if (/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(body))
    throw new ProviderError('unsupported_feed', false);
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) throw new ProviderError('feed_entities_forbidden', false);
  if (body.trimStart().startsWith('{')) return jsonFeed(JSON.parse(body), url);
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    processEntities: true,
    htmlEntities: true,
  }).parse(body) as Obj;
  const rss = object(parsed.rss);
  const channel = object(rss.channel);
  if (Object.keys(channel).length) return rssFeed(channel, url);
  const feed = object(parsed.feed);
  if (Object.keys(feed).length) return atomFeed(feed, url);
  throw new ProviderError('unsupported_feed', false);
}
function rssFeed(channel: Obj, url: string): Feed {
  const feedImage =
    mediaMetadata(channel, url).thumbnail ?? absolute(text(object(channel.image).url), url);
  const entries = array(channel.item)
    .map((value): FeedEntry => {
      const item = object(value);
      const media = mediaMetadata(item, url);
      const enclosures = array(item.enclosure)
        .map((e) => object(e))
        .map((e) => ({
          url: absolute(text(e['@_url']), url) ?? '',
          type: text(e['@_type']) || undefined,
        }))
        .filter((e) => e.url);
      const transcripts = array(item['podcast:transcript'])
        .map(object)
        .map((t) => ({
          url: absolute(text(t['@_url']), url) ?? '',
          type: text(t['@_type']) || undefined,
          language: text(t['@_language']) || undefined,
        }))
        .filter((t) => t.url);
      const guid = text(item.guid);
      const entryUrl = absolute(text(item.link), url) || absolute(guid, url) || enclosures[0]?.url;
      if (!entryUrl) return null as unknown as FeedEntry;
      const html = text(item['content:encoded']) || text(item.description);
      return {
        id: guid || entryUrl,
        url: entryUrl,
        title: text(item.title) || 'Untitled',
        description: clean(text(item.description)) || media.description,
        text: clean(html),
        html,
        creator:
          text(item['dc:creator']) || text(item['itunes:author']) || text(item.author) || undefined,
        publishedAt: date(item.pubDate) || date(item['dc:date']),
        kind: text(item['yt:videoId'])
          ? 'video'
          : enclosureKind([...enclosures, ...media.enclosures].map((e) => e.type)),
        durationSeconds: duration(item['itunes:duration']) ?? media.durationSeconds,
        thumbnail: media.thumbnail ?? feedImage,
        creatorImageUrl: creatorImageReference(feedImage),
        enclosures: uniqueEnclosures([...enclosures, ...media.enclosures]),
        transcripts,
      };
    })
    .filter(Boolean);
  const next = array(channel['atom:link'])
    .map(object)
    .find((link) => link['@_rel'] === 'next');
  return {
    title: text(channel.title) || 'Feed',
    url,
    homeUrl: absolute(text(channel.link), url),
    description: clean(text(channel.description)),
    entries,
    nextUrl: next ? absolute(text(next['@_href']), url) : undefined,
  };
}
function atomFeed(feed: Obj, url: string): Feed {
  const links = (value: unknown) => array(value).map(object);
  const alternate = (value: unknown) => {
    const values = links(value);
    return values.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? values[0];
  };
  const entries = array(feed.entry)
    .map((value): FeedEntry => {
      const item = object(value);
      const media = mediaMetadata(item, url);
      const link = alternate(item.link);
      const entryUrl = absolute(text(link?.['@_href']) || text(item.id), url);
      if (!entryUrl) return null as unknown as FeedEntry;
      const enclosures = links(item.link)
        .filter((l) => l['@_rel'] === 'enclosure')
        .map((l) => ({
          url: absolute(text(l['@_href']), url) ?? '',
          type: text(l['@_type']) || undefined,
        }))
        .filter((e) => e.url);
      const content = object(item.content);
      const html = text(item.content) || text(item.summary) || text(content['#text']);
      return {
        id: text(item.id) || entryUrl,
        url: entryUrl,
        title: text(item.title) || 'Untitled',
        description: clean(text(item.summary)) || media.description,
        text: clean(html),
        html,
        creator: text(object(item.author).name) || text(object(feed.author).name) || undefined,
        publishedAt: date(item.published) || date(item.updated),
        kind: text(item['yt:videoId'])
          ? 'video'
          : enclosureKind([...enclosures, ...media.enclosures].map((e) => e.type)),
        thumbnail: media.thumbnail ?? mediaMetadata(feed, url).thumbnail,
        creatorImageUrl: creatorImageReference(absolute(text(feed.icon) || text(feed.logo), url)),
        durationSeconds: media.durationSeconds,
        enclosures: uniqueEnclosures([...enclosures, ...media.enclosures]),
        transcripts: [],
      };
    })
    .filter(Boolean);
  const home = alternate(feed.link);
  const next = links(feed.link).find((l) => l['@_rel'] === 'next');
  return {
    title: text(feed.title) || 'Feed',
    url,
    homeUrl: home ? absolute(text(home['@_href']), url) : undefined,
    description: clean(text(feed.subtitle)),
    entries,
    nextUrl: next ? absolute(text(next['@_href']), url) : undefined,
  };
}
function jsonFeed(value: unknown, url: string): Feed {
  const feed = object(value);
  if (typeof feed.version !== 'string' || !feed.version.startsWith('https://jsonfeed.org/version/'))
    throw new ProviderError('unsupported_feed', false);
  const entries = array(feed.items)
    .map((v): FeedEntry => {
      const item = object(v);
      const attachments = array(item.attachments).map(object);
      const enclosures = attachments
        .map((a) => ({
          url: absolute(text(a.url), url) ?? '',
          type: text(a.mime_type) || undefined,
        }))
        .filter((e) => e.url);
      const entryUrl =
        absolute(text(item.url) || text(item.external_url), url) || enclosures[0]?.url;
      if (!entryUrl) return null as unknown as FeedEntry;
      const author = object(array(item.authors)[0] ?? item.author ?? array(feed.authors)[0]);
      return {
        id: text(item.id) || entryUrl,
        url: entryUrl,
        title: text(item.title) || 'Untitled',
        description: text(item.summary) || undefined,
        thumbnail: absolute(text(item.image) || text(item.banner_image) || text(feed.icon), url),
        creatorImageUrl: creatorImageReference(
          absolute(text(author.avatar) || text(feed.icon) || text(feed.favicon), url)
        ),
        text: text(item.content_text) || clean(text(item.content_html)),
        html: text(item.content_html) || undefined,
        creator: text(author.name) || undefined,
        publishedAt: date(item.date_published),
        kind: enclosureKind(enclosures.map((e) => e.type)),
        durationSeconds:
          typeof attachments[0]?.duration_in_seconds === 'number'
            ? attachments[0].duration_in_seconds
            : undefined,
        enclosures,
        transcripts: [],
      };
    })
    .filter(Boolean);
  return {
    title: text(feed.title) || 'Feed',
    url,
    homeUrl: absolute(text(feed.home_page_url), url),
    description: text(feed.description) || undefined,
    entries,
    nextUrl: absolute(text(feed.next_url), url),
  };
}

export function newestFirst(entries: FeedEntry[]) {
  return [...entries].sort((a, b) => {
    const left = a.eventAt ?? a.publishedAt,
      right = b.eventAt ?? b.publishedAt;
    if (left && right) return right.localeCompare(left);
    return 0;
  });
}
