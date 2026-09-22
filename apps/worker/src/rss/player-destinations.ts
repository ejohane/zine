import { z } from 'zod';
import { logger } from '../lib/logger';
import { hashString, normalizeFeedUrl } from './url';
import { scrapeOpenGraph } from '../lib/opengraph';

export type PodcastPlayer = 'OVERCAST' | 'APPLE_PODCASTS' | 'POCKET_CASTS';
export interface PlayerDestination {
  url: string;
  kind: 'episode' | 'show' | 'subscribe';
}
export interface PlayerContext {
  feedUrl: string;
  showName: string;
  sourceUrl: string | null;
  audioUrl: string | null;
  rawGuid: string | null;
}
interface Episode {
  audioUrl?: string;
  guid?: string;
  url: string;
}
interface Catalog {
  show: PlayerDestination | null;
  episodes: Episode[];
}
class AppleEpisodeLookupError extends Error {
  constructor(
    readonly show: PlayerDestination,
    cause: unknown
  ) {
    super('Apple episode lookup failed', { cause });
  }
}
interface CachedCatalog {
  catalog: Catalog;
  refreshAfter: number;
  temporarilyUnavailable?: boolean;
}
const names = {
  OVERCAST: 'Overcast',
  APPLE_PODCASTS: 'Apple Podcasts',
  POCKET_CASTS: 'Pocket Casts',
};

function publicUrl(value: unknown, hosts: string[]): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && hosts.includes(u.hostname)
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
function sameUrl(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  try {
    return normalizeFeedUrl(a) === normalizeFeedUrl(b);
  } catch {
    return false;
  }
}
const appleSchema = z.object({
  results: z
    .array(
      z.object({
        kind: z.string().optional(),
        collectionId: z.number().optional(),
        feedUrl: z.string().optional(),
        episodeUrl: z.string().optional(),
        episodeGuid: z.string().optional(),
        trackViewUrl: z.string().optional(),
      })
    )
    .default([]),
});
const pocketDataSchema = z.object({
  podcasts: z
    .array(
      z.object({
        title: z.string(),
        uuid: z.string(),
        pocketcasts_url: z.object({ web: z.string().optional() }).optional(),
      })
    )
    .default([]),
  episodes: z
    .array(
      z.object({
        url: z.string().optional(),
        pocketcasts_url: z
          .object({ episode: z.object({ share: z.string().optional() }).optional() })
          .optional(),
      })
    )
    .default([]),
});
const pocketEnvelopeSchema = z.object({
  result: z.object({
    isError: z.boolean().optional(),
    structuredContent: pocketDataSchema,
  }),
});
async function appleJson(url: string) {
  return json(url, undefined, (value) => appleSchema.parse(value));
}

async function json<T = unknown>(
  url: string,
  body?: unknown,
  parse?: (value: unknown) => T
): Promise<T> {
  const startedAt = Date.now();
  const endpoint = new URL(url);
  const stage =
    endpoint.hostname === 'itunes.apple.com'
      ? endpoint.searchParams.get('entity') === 'podcastEpisode'
        ? 'apple_episode_lookup'
        : 'apple_show_lookup'
      : 'pocket_catalog_lookup';
  let status: number | undefined;
  let retryAfter: string | null = null;
  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Accept: body ? 'application/json, text/event-stream' : 'application/json',
        'User-Agent': 'ZinePodcastResolver/1.0 (+https://myzine.app)',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    status = response.status;
    retryAfter = response.headers.get('Retry-After');
    if (!response.ok) throw new Error(`Podcast directory unavailable (${status})`);
    const value: unknown = await response.json();
    return parse ? parse(value) : (value as T);
  } catch (error) {
    logger.warn('Podcast directory lookup failed', {
      operation: 'podcast_destination',
      stage,
      status,
      retryAfter,
      durationMs: Date.now() - startedAt,
      errorType: error instanceof Error ? error.name : typeof error,
      // Zod messages can contain response values; log only structural issue details.
      error:
        error instanceof z.ZodError
          ? error.issues.map(({ code, path }) => ({ code, path }))
          : error instanceof Error
            ? error.message
            : 'Unknown error',
    });
    throw error;
  }
}
async function pocket(name: string, args: unknown) {
  const result = pocketEnvelopeSchema.parse(
    await json('https://mcp.pocketcasts.com', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    })
  );
  if (result.result.isError) {
    throw new Error('Pocket Casts unavailable');
  }
  return result.result.structuredContent;
}
async function appleId(context: PlayerContext): Promise<string | null> {
  if (context.sourceUrl) {
    const source = new URL(context.sourceUrl);
    const directId =
      source.hostname === 'podcasts.apple.com'
        ? source.pathname.match(/\/id(\d+)(?:\/|$)/)?.[1]
        : source.hostname === 'overcast.fm'
          ? source.pathname.match(/^\/\+?itunes(\d+)(?:\/|$)/)?.[1]
          : null;
    if (directId) {
      // Manual RSS entry can associate a different feed with an original player link.
      const lookup = await appleJson(
        `https://itunes.apple.com/lookup?id=${directId}&entity=podcast`
      );
      return (lookup.results ?? []).some(
        (r) => r.kind === 'podcast' && sameUrl(r.feedUrl, context.feedUrl)
      )
        ? directId
        : null;
    }
    if (source.hostname === 'overcast.fm') {
      const page = await scrapeOpenGraph(source.toString());
      // The feed must agree with the saved follow context before trusting its badge.
      if (sameUrl(page.podcastFeedUrl, context.feedUrl) && page.podcastAppleId)
        return page.podcastAppleId;
    }
  }
  const search = new URL('https://itunes.apple.com/search');
  search.search = new URLSearchParams({
    term: context.showName,
    media: 'podcast',
    entity: 'podcast',
    limit: '10',
  }).toString();
  const data = await appleJson(search.toString());
  const matches = (data.results ?? []).filter((r) => sameUrl(r.feedUrl, context.feedUrl));
  return matches.length === 1 && Number.isSafeInteger(matches[0].collectionId)
    ? String(matches[0].collectionId)
    : null;
}
async function loadCatalog(player: PodcastPlayer, context: PlayerContext): Promise<Catalog> {
  if (player === 'OVERCAST') {
    const id = await appleId(context);
    return {
      episodes: [],
      show: id ? { kind: 'show', url: `https://overcast.fm/+itunes${id}` } : null,
    };
  }

  if (player === 'POCKET_CASTS') {
    const search = await pocket('search_podcasts', { query: context.showName, limit: 5 });
    const candidates = (search.podcasts ?? []).filter(
      (p) =>
        typeof p.title === 'string' &&
        p.title.trim().toLowerCase() === context.showName.trim().toLowerCase() &&
        typeof p.uuid === 'string'
    );
    const results = await Promise.allSettled(
      candidates.map(async (p) => {
        const data = await pocket('get_podcast_episodes', { uuid: p.uuid, limit: 50, offset: 0 });
        const episodes: Episode[] = (data.episodes ?? []).flatMap((e) => {
          const url = publicUrl(e.pocketcasts_url?.episode?.share, ['pocketcasts.com', 'pca.st']);
          return url && typeof e.url === 'string' ? [{ audioUrl: e.url, url }] : [];
        });
        const showUrl = publicUrl(p.pocketcasts_url?.web, ['pocketcasts.com', 'pca.st']);
        return { episodes, show: showUrl ? { url: showUrl, kind: 'show' as const } : null };
      })
    );
    const catalogs = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    // Duplicate names are common. Only an exact audio match establishes which show is ours.
    const verified = catalogs.filter((c: Catalog) =>
      c.episodes.some((e) => sameUrl(e.audioUrl, context.audioUrl))
    );
    if (verified.length === 1) return verified[0];
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Pocket Casts temporarily unavailable');
    return { episodes: [], show: null };
  }
  const id = await appleId(context);
  if (!id) return { episodes: [], show: null };

  let data: z.infer<typeof appleSchema>;
  try {
    data = await appleJson(
      `https://itunes.apple.com/lookup?id=${id}&entity=podcastEpisode&limit=200`
    );
  } catch (error) {
    // appleId already verified this show against the RSS feed. Keep that usable link.
    throw new AppleEpisodeLookupError(
      { kind: 'show', url: `https://podcasts.apple.com/podcast/id${id}` },
      error
    );
  }
  const show = (data.results ?? []).find(
    (r) => r.kind === 'podcast' && sameUrl(r.feedUrl, context.feedUrl)
  );
  if (!show) return { episodes: [], show: null };
  const episodes = (data.results ?? []).flatMap((e) => {
    const url = publicUrl(e.trackViewUrl, ['podcasts.apple.com']);
    return e.kind === 'podcast-episode' && e.collectionId === Number(id) && url
      ? [{ url, audioUrl: e.episodeUrl, guid: e.episodeGuid }]
      : [];
  });
  return { episodes, show: { kind: 'show', url: `https://podcasts.apple.com/podcast/id${id}` } };
}

export async function resolvePlayerDestination(
  player: PodcastPlayer,
  context: PlayerContext,
  cache: KVNamespace,
  now = Date.now()
) {
  // Catalog entries are public; never cache user identity, private URLs, or share timestamps.
  normalizeFeedUrl(context.feedUrl);
  const key = `podcast-player:v2:${player}:${hashString(context.feedUrl)}`;
  let cached: CachedCatalog | null = null;
  try {
    cached = await cache.get<CachedCatalog>(key, 'json');
  } catch {
    /* cache is best-effort */
  }
  let catalog = cached?.catalog ?? { show: null, episodes: [] };
  let temporarilyUnavailable = cached?.temporarilyUnavailable ?? false;
  if (!cached || cached.refreshAfter <= now) {
    try {
      catalog = await loadCatalog(player, context);
      temporarilyUnavailable = false;
      const refreshAfter = now + (catalog.episodes.length || catalog.show ? 3600000 : 300000);
      await cache
        .put(key, JSON.stringify({ catalog, refreshAfter }), { expirationTtl: 604800 })
        .catch(() => {});
    } catch (error) {
      if (error instanceof AppleEpisodeLookupError) {
        catalog = { ...catalog, show: error.show };
      }
      logger.warn('Podcast destination resolution deferred', {
        operation: 'podcast_destination',
        player,
        stage: 'catalog_resolution',
        feedHash: hashString(context.feedUrl),
        errorType: error instanceof Error ? error.name : typeof error,
        retainedShow: Boolean(catalog.show),
        retainedEpisodes: catalog.episodes.length,
        retryAt: now + 300000,
      });
      temporarilyUnavailable = true;
      // Preserve stale verified links and suppress repeated requests during directory outages.
      await cache
        .put(
          key,
          JSON.stringify({ catalog, refreshAfter: now + 300000, temporarilyUnavailable: true }),
          {
            expirationTtl: 604800,
          }
        )
        .catch(() => {});
    }
  }
  const matches = catalog.episodes.filter(
    (e) => sameUrl(e.audioUrl, context.audioUrl) || (context.rawGuid && e.guid === context.rawGuid)
  );
  const destination: PlayerDestination | null =
    matches.length === 1 ? { kind: 'episode', url: matches[0].url } : catalog.show;
  return { player, playerName: names[player], destination, temporarilyUnavailable };
}
