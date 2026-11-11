import { creatorImageReference, identify } from '../identity';
import { providerJson, ProviderError } from '../remote';
import type { Env } from '../types';
import type { FeedEntry } from './feed';
import type { Extraction } from './web';
import type { ContributionInput } from '../enrichment';

interface Image {
  url: string;
  width?: number;
  height?: number;
}
interface Artist {
  id: string;
  name: string;
  external_urls?: { spotify?: string };
}
interface SpotifyItem {
  id: string;
  name: string;
  type: string;
  description?: string;
  html_description?: string;
  duration_ms?: number;
  release_date?: string;
  release_date_precision?: string;
  images?: Image[];
  artists?: Artist[];
  publisher?: string;
  languages?: string[];
  external_urls?: { spotify?: string };
  external_ids?: Record<string, string>;
  show?: SpotifyItem;
  album?: SpotifyItem;
  owner?: { display_name?: string; id: string };
  episodes?: SpotifyPage;
  tracks?: SpotifyPage;
  items?: SpotifyPage;
  snapshot_id?: string;
}
interface SpotifyPage {
  items: (SpotifyItem | { track?: SpotifyItem; item?: SpotifyItem; added_at?: string } | null)[];
  next: string | null;
  total: number;
  offset?: number;
}
const tokens = new Map<string, { value: string; expiresAt: number }>();
async function accessToken(env: Env) {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET)
    throw new ProviderError('spotify_credentials_missing', false);
  const previous = tokens.get(env.SPOTIFY_CLIENT_ID);
  if (previous && previous.expiresAt > Date.now() + 60000) return previous.value;
  const token = await providerJson<{ access_token: string; expires_in: number }>(
    new URL('https://accounts.spotify.com/api/token'),
    `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    }
  );
  if (!token.access_token) throw new ProviderError('spotify_invalid_token_response', false);
  tokens.set(env.SPOTIFY_CLIENT_ID, {
    value: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  });
  return token.access_token;
}
export async function spotifyRequest<T>(
  env: Env,
  path: string,
  params: Record<string, string> = {}
) {
  const url = new URL(`https://api.spotify.com/v1/${path}`);
  for (const [key, value] of Object.entries({ market: 'US', ...params }))
    url.searchParams.set(key, value);
  try {
    return await providerJson<T>(url, `Bearer ${await accessToken(env)}`);
  } catch (error) {
    if (
      error instanceof ProviderError &&
      error.code === 'provider_credentials_expired' &&
      env.SPOTIFY_CLIENT_ID
    ) {
      tokens.delete(env.SPOTIFY_CLIENT_ID);
      return providerJson<T>(url, `Bearer ${await accessToken(env)}`);
    }
    throw error;
  }
}
function releaseDate(item: SpotifyItem) {
  const value = item.release_date;
  if (!value) return undefined;
  const normalized =
    value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
function unwrap(value: SpotifyPage['items'][number]) {
  return value && 'id' in value ? value : (value?.item ?? value?.track ?? null);
}
function validItem(item: SpotifyItem | null): item is SpotifyItem {
  return !!item && typeof item.id === 'string' && /^[A-Za-z0-9]{22}$/.test(item.id);
}
function member(item: SpotifyItem): FeedEntry {
  return {
    id: `spotify:${item.type}:${item.id}`,
    url: `https://open.spotify.com/${item.type}/${item.id}`,
    title: item.name,
    description: item.description,
    creator: item.artists?.map((a) => a.name).join(', ') || item.publisher,
    creatorImageUrl: creatorImageReference(item.show?.images?.[0]?.url),
    publishedAt: releaseDate(item),
    ...(['day', 'month', 'year'].includes(item.release_date_precision ?? '')
      ? { publishedPrecision: item.release_date_precision as 'day' | 'month' | 'year' }
      : {}),
    kind: item.type === 'episode' ? 'podcast_episode' : item.type,
    durationSeconds: item.duration_ms === undefined ? undefined : item.duration_ms / 1000,
    enclosures: [],
    transcripts: [],
  };
}

export async function extractSpotify(env: Env, url: string): Promise<Extraction> {
  const identity = identify(url);
  if (identity.platform !== 'spotify' || !identity.externalId)
    throw new ProviderError('spotify_invalid_reference', false);
  const kind = identity.kind === 'podcast_episode' ? 'episode' : identity.kind;
  const endpoint: Record<string, string> = {
    episode: 'episodes',
    show: 'shows',
    track: 'tracks',
    album: 'albums',
    playlist: 'playlists',
    artist: 'artists',
  };
  const item = await spotifyRequest<SpotifyItem>(env, `${endpoint[kind]}/${identity.externalId}`);
  const provenance = {
    sourceUrl: identity.url,
    method: 'spotify-web-api',
    inputContributionIds: [],
  };
  const contributions: ContributionInput[] = [];
  const add = (field: ContributionInput['field'], value: unknown) => {
    if (value !== undefined && value !== null && value !== '')
      contributions.push({ field, value, category: 'source', provenance });
  };
  add('title', item.name);
  add('description', item.description);
  add('thumbnail', item.images?.[0]?.url ?? item.album?.images?.[0]?.url);
  const show = item.type === 'show' ? item : item.show;
  add('creatorImageUrl', creatorImageReference(show?.images?.[0]?.url));
  add(
    'creator',
    item.artists?.map((artist) => artist.name).join(', ') ||
      item.publisher ||
      item.show?.publisher ||
      item.owner?.display_name
  );
  if (item.duration_ms !== undefined) add('durationSeconds', item.duration_ms / 1000);
  add('publishedAt', releaseDate(item.album ?? item));
  add('language', item.languages?.[0]);
  if (item.show)
    add('source', {
      id: item.show.id,
      name: item.show.name,
      url: `https://open.spotify.com/show/${item.show.id}`,
      kind: 'show',
    });
  add('structuredData', item);
  const page = item.episodes ?? item.tracks ?? item.items;
  if (page)
    add('members', {
      items: page.items.map(unwrap).filter(validItem).map(member),
      total: page.total,
      nextOffset: page.next ? Number(new URL(page.next).searchParams.get('offset')) : null,
      complete: !page.next,
    });
  return {
    contributions,
    components: [
      { component: 'metadata', status: 'available' },
      ...(kind === 'episode'
        ? [
            {
              component: 'transcript',
              status: 'unavailable' as const,
              reasonCode: 'spotify_web_api_does_not_expose_episode_transcript',
            },
          ]
        : []),
    ],
    feedUrls: [],
  };
}

export async function spotifySource(env: Env, url: string) {
  const identity = identify(url);
  if (identity.kind === 'podcast_episode') {
    const episode = await spotifyRequest<SpotifyItem>(env, `episodes/${identity.externalId}`);
    if (!episode.show) throw new ProviderError('spotify_show_unavailable', false);
    return {
      url: `https://open.spotify.com/show/${episode.show.id}`,
      name: episode.show.name,
      kind: 'spotify_show',
    };
  }
  if (!['show', 'playlist', 'artist'].includes(identity.kind))
    throw new ProviderError('spotify_source_not_subscribable', false);
  const endpoints: Record<string, string> = {
    show: 'shows',
    playlist: 'playlists',
    artist: 'artists',
  };
  const item = await spotifyRequest<SpotifyItem>(
    env,
    `${endpoints[identity.kind]}/${identity.externalId}`
  );
  return { url: identity.url, name: item.name, kind: `spotify_${identity.kind}` };
}
export async function spotifySourcePage(env: Env, url: string, offset = 0) {
  const identity = identify(url);
  const paths: Record<string, string> = {
    show: `shows/${identity.externalId}/episodes`,
    playlist: `playlists/${identity.externalId}/items`,
    artist: `artists/${identity.externalId}/albums`,
  };
  if (!paths[identity.kind]) throw new ProviderError('spotify_source_not_subscribable', false);
  const page = await spotifyRequest<SpotifyPage>(env, paths[identity.kind], {
    limit: '50',
    offset: String(offset),
  });
  return {
    title: 'Spotify source',
    url,
    entries: page.items.flatMap((raw) => {
      const item = unwrap(raw);
      if (!validItem(item)) return [];
      const entry = member(item);
      if (
        identity.kind === 'playlist' &&
        raw &&
        'added_at' in raw &&
        raw.added_at &&
        Number.isFinite(Date.parse(raw.added_at))
      ) {
        entry.eventAt = new Date(raw.added_at).toISOString();
        entry.id = `${entry.id}:added:${entry.eventAt}`;
      }
      return [entry];
    }),
    newestFirst: identity.kind === 'show' || identity.kind === 'artist',
    nextOffset: page.next ? Number(new URL(page.next).searchParams.get('offset')) : null,
  };
}

/** Explicit collection reads do not save members or create subscriptions. */
export async function spotifyMemberPage(env: Env, url: string, offset = 0) {
  const identity = identify(url);
  const paths: Record<string, string> = {
    show: `shows/${identity.externalId}/episodes`,
    album: `albums/${identity.externalId}/tracks`,
    playlist: `playlists/${identity.externalId}/items`,
    artist: `artists/${identity.externalId}/albums`,
  };
  if (!paths[identity.kind]) throw new ProviderError('spotify_reference_has_no_members', false);
  const page = await spotifyRequest<SpotifyPage>(env, paths[identity.kind], {
    limit: '50',
    offset: String(offset),
  });
  return {
    items: page.items.map(unwrap).filter(validItem).map(member),
    total: page.total,
    nextOffset: page.next ? Number(new URL(page.next).searchParams.get('offset')) : null,
    complete: !page.next,
  };
}
