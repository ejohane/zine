import { scrapeOpenGraph } from '../lib/opengraph';
import { parseRssFeedXml, type ParsedRssEntry, type ParsedRssFeed } from './parser';
import { normalizeFeedUrl } from './url';

const DIRECTORY_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 5_000_000;

type PodcastPlayer = 'APPLE_PODCASTS' | 'OVERCAST' | 'POCKET_CASTS' | 'RSS';

interface ApplePodcastResult {
  kind?: string;
  collectionId?: number;
  trackId?: number;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  episodeUrl?: string;
  trackTimeMillis?: number;
}

interface AppleLookupResponse {
  results?: ApplePodcastResult[];
}

export interface PodcastResolutionHints {
  episodeTitle?: string;
  showName?: string;
  durationSeconds?: number;
}

export interface PodcastShowResolution {
  feedUrl: string;
  title: string;
  description: string | null;
  artworkUrl: string | null;
  siteUrl: string | null;
  sourceUrl: string;
  sourcePlayer: PodcastPlayer;
  externalShowUrl: string | null;
  externalShowLabel: string | null;
  matchedEntryId: string | null;
  matchedEntry: {
    entryId: string;
    publisherUrl: string;
    publishedAt: number | null;
  } | null;
  recentEpisodes: Array<{
    title: string;
    publishedAt: number | null;
    durationSeconds: number | null;
    publisherUrl: string;
  }>;
  baselineEntryIds: string[];
}

export class PodcastResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PodcastResolutionError';
  }
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function playerForUrl(url: URL): PodcastPlayer | null {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname === 'podcasts.apple.com') return 'APPLE_PODCASTS';
  if (hostname === 'overcast.fm') return 'OVERCAST';
  if (hostname === 'pca.st' || hostname === 'pocketcasts.com') return 'POCKET_CASTS';
  return null;
}

function appleShowId(url: URL): string | null {
  if (url.hostname.toLowerCase().replace(/^www\./, '') === 'podcasts.apple.com') {
    return url.pathname.match(/\/id(\d+)(?:\/|$)/)?.[1] ?? null;
  }
  if (url.hostname.toLowerCase().replace(/^www\./, '') === 'overcast.fm') {
    return url.pathname.match(/^\/itunes(\d+)(?:\/|$)/)?.[1] ?? null;
  }
  return null;
}

async function fetchJson(url: URL): Promise<AppleLookupResponse> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ZinePodcastResolver/1.0' },
    signal: AbortSignal.timeout(DIRECTORY_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new PodcastResolutionError(`Podcast directory request failed (${response.status})`);
  return (await response.json()) as AppleLookupResponse;
}

async function fetchParsedFeed(
  rawFeedUrl: string
): Promise<{ feedUrl: string; parsed: ParsedRssFeed }> {
  const feedUrl = normalizeFeedUrl(rawFeedUrl);
  const response = await fetch(feedUrl, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      'User-Agent': 'ZinePodcastResolver/1.0 (+https://myzine.app)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(DIRECTORY_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new PodcastResolutionError(`Podcast feed request failed (${response.status})`);
  const payload = await response.arrayBuffer();
  if (payload.byteLength > MAX_FEED_BYTES)
    throw new PodcastResolutionError('Podcast feed is too large');
  const resolvedFeedUrl = normalizeFeedUrl(response.url || feedUrl);
  const parsed = parseRssFeedXml(new TextDecoder().decode(payload), resolvedFeedUrl);
  if (parsed.contentType !== 'PODCAST') {
    throw new PodcastResolutionError('The selected feed does not contain public podcast audio');
  }
  return { feedUrl: resolvedFeedUrl, parsed };
}

function exactEntryMatch(
  feedTitle: string | null | undefined,
  entries: ParsedRssEntry[],
  evidence: {
    audioUrl?: string | null;
    title?: string;
    showName?: string;
    durationSeconds?: number;
  }
): ParsedRssEntry | null {
  if (evidence.audioUrl) {
    const audioUrl = normalizeFeedUrl(evidence.audioUrl);
    const match = entries.find((entry) => entry.audioUrl === audioUrl);
    if (match) return match;
  }

  if (
    evidence.title &&
    evidence.showName &&
    feedTitle &&
    normalizedText(feedTitle) === normalizedText(evidence.showName) &&
    evidence.durationSeconds != null
  ) {
    const title = normalizedText(evidence.title);
    return (
      entries.find(
        (entry) =>
          normalizedText(entry.title) === title &&
          entry.durationSeconds != null &&
          // Player pages commonly round a displayed duration to the nearest minute.
          Math.abs(entry.durationSeconds - evidence.durationSeconds!) <= 90
      ) ?? null
    );
  }
  return null;
}

function buildResolution(params: {
  feedUrl: string;
  parsed: ParsedRssFeed;
  sourceUrl: string;
  sourcePlayer: PodcastPlayer;
  directory?: ApplePodcastResult;
  matchedEntry?: ParsedRssEntry | null;
}): PodcastShowResolution {
  const { parsed } = params;
  const externalShowUrl = params.directory?.trackViewUrl ?? null;
  return {
    feedUrl: params.feedUrl,
    title: parsed.title ?? params.directory?.collectionName ?? 'Podcast',
    description: parsed.description ?? null,
    artworkUrl:
      parsed.imageUrl ?? params.directory?.artworkUrl600 ?? params.directory?.artworkUrl100 ?? null,
    siteUrl: parsed.siteUrl ?? null,
    sourceUrl: params.sourceUrl,
    sourcePlayer: params.sourcePlayer,
    externalShowUrl,
    externalShowLabel: externalShowUrl ? 'Open show in Apple Podcasts' : null,
    matchedEntryId: params.matchedEntry?.entryId ?? null,
    matchedEntry: params.matchedEntry
      ? {
          entryId: params.matchedEntry.entryId,
          publisherUrl: params.matchedEntry.canonicalUrl,
          publishedAt: params.matchedEntry.publishedAt ?? null,
        }
      : null,
    recentEpisodes: [...parsed.entries]
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, 3)
      .map((entry) => ({
        title: entry.title,
        publishedAt: entry.publishedAt ?? null,
        durationSeconds: entry.durationSeconds ?? null,
        publisherUrl: entry.canonicalUrl,
      })),
    baselineEntryIds: parsed.entries.map((entry) => entry.entryId),
  };
}

async function resolveViaAppleId(sourceUrl: string, sourcePlayer: PodcastPlayer, id: string) {
  const lookup = new URL('https://itunes.apple.com/lookup');
  lookup.searchParams.set('id', id);
  lookup.searchParams.set('entity', 'podcastEpisode');
  lookup.searchParams.set('limit', '200');
  const results = (await fetchJson(lookup)).results ?? [];
  const directory = results.find(
    (result) => result.feedUrl && result.collectionId === Number(id) && result.kind === 'podcast'
  );
  if (!directory?.feedUrl)
    throw new PodcastResolutionError('Apple does not expose a public RSS feed for this show');
  const { feedUrl, parsed } = await fetchParsedFeed(directory.feedUrl);
  const episodeId = new URL(sourceUrl).searchParams.get('i');
  const episode = episodeId
    ? results.find((result) => result.trackId === Number(episodeId) && result.episodeUrl)
    : null;
  const matchedEntry = episode
    ? exactEntryMatch(parsed.title, parsed.entries, {
        audioUrl: episode.episodeUrl,
        title: episode.trackName,
        showName: directory.collectionName,
        durationSeconds:
          episode.trackTimeMillis != null ? Math.floor(episode.trackTimeMillis / 1000) : undefined,
      })
    : null;
  return buildResolution({ feedUrl, parsed, sourceUrl, sourcePlayer, directory, matchedEntry });
}

export async function resolvePodcastShow(params: {
  sourceUrl: string;
  manualFeedUrl?: string;
  hints?: PodcastResolutionHints;
}): Promise<PodcastShowResolution> {
  let source: URL;
  try {
    source = new URL(params.sourceUrl);
  } catch {
    throw new PodcastResolutionError('Invalid podcast link');
  }
  if (source.protocol !== 'http:' && source.protocol !== 'https:') {
    throw new PodcastResolutionError('Podcast links must use http or https');
  }

  const sourcePlayer = playerForUrl(source);
  if (!sourcePlayer && !params.manualFeedUrl) {
    throw new PodcastResolutionError('Paste the public RSS feed to follow this show');
  }

  if (params.manualFeedUrl) {
    const { feedUrl, parsed } = await fetchParsedFeed(params.manualFeedUrl);
    const matchedEntry = exactEntryMatch(parsed.title, parsed.entries, {
      title: params.hints?.episodeTitle,
      showName: params.hints?.showName,
      durationSeconds: params.hints?.durationSeconds,
    });
    return buildResolution({
      feedUrl,
      parsed,
      sourceUrl: source.toString(),
      sourcePlayer: sourcePlayer ?? 'RSS',
      matchedEntry,
    });
  }

  const showId = appleShowId(source);
  if (showId) return resolveViaAppleId(source.toString(), sourcePlayer!, showId);

  const page = await scrapeOpenGraph(source.toString());
  if ((page.responseStatus && page.responseStatus >= 400) || page.resolvedUrl?.includes('/login')) {
    throw new PodcastResolutionError(
      'This player did not expose enough public show information. Paste the public RSS feed instead.'
    );
  }

  const showName = page.podcastEpisode?.showName ?? params.hints?.showName;
  const episodeTitle = page.podcastEpisode?.title ?? params.hints?.episodeTitle;
  const durationSeconds = page.podcastEpisode?.duration ?? params.hints?.durationSeconds;
  if (!showName)
    throw new PodcastResolutionError(
      'Zine could not identify the show. Paste the public RSS feed instead.'
    );

  const search = new URL('https://itunes.apple.com/search');
  search.searchParams.set('term', showName);
  search.searchParams.set('media', 'podcast');
  search.searchParams.set('entity', 'podcast');
  search.searchParams.set('limit', '10');
  const candidates = (await fetchJson(search)).results ?? [];

  for (const directory of candidates) {
    if (!directory.feedUrl || normalizedText(directory.collectionName) !== normalizedText(showName))
      continue;
    try {
      const { feedUrl, parsed } = await fetchParsedFeed(directory.feedUrl);
      if (normalizedText(parsed.title) !== normalizedText(showName)) continue;
      const matchedEntry = exactEntryMatch(parsed.title, parsed.entries, {
        audioUrl: page.podcastEpisode?.audioUrl,
        title: episodeTitle,
        showName,
        durationSeconds,
      });
      if (!matchedEntry) continue;
      return buildResolution({
        feedUrl,
        parsed,
        sourceUrl: source.toString(),
        sourcePlayer: sourcePlayer!,
        directory,
        matchedEntry,
      });
    } catch {
      // Try the next exact-name directory candidate.
    }
  }

  throw new PodcastResolutionError(
    'Zine could not verify this player episode against a public feed. Paste the public RSS feed instead.'
  );
}
