import { googleToken } from '../connections';
import { creatorImageReference, identify } from '../identity';
import { ProviderError, providerJson } from '../remote';
import type { Env } from '../types';
import type { ContributionInput } from '../enrichment';
import type { Extraction } from './web';
import type { FeedEntry } from './feed';
type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => (value && typeof value === 'object' ? (value as Obj) : {});
const text = (value: unknown) => (typeof value === 'string' ? value : '');
interface Page {
  items: Obj[];
  nextPageToken?: string;
  pageInfo?: { totalResults: number };
}
export async function hasYouTubeApi(env: Env, owner?: string) {
  return !!env.YOUTUBE_API_KEY || !!(owner && (await googleToken(env, owner)));
}
export async function youtubeRequest(
  env: Env,
  owner: string | undefined,
  path: string,
  params: Record<string, string>
) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const token = owner ? await googleToken(env, owner) : null;
  if (!token && !env.YOUTUBE_API_KEY)
    throw new ProviderError('youtube_authorization_required', false);
  if (!token && env.YOUTUBE_API_KEY) url.searchParams.set('key', env.YOUTUBE_API_KEY);
  try {
    return await providerJson<Page>(url, token ? `Bearer ${token}` : undefined);
  } catch (error) {
    if (
      token &&
      owner &&
      error instanceof ProviderError &&
      error.code === 'provider_credentials_expired'
    ) {
      const renewed = await googleToken(env, owner, true);
      if (!renewed) throw new ProviderError('youtube_authorization_required', false);
      return providerJson<Page>(url, `Bearer ${renewed}`);
    }
    throw error;
  }
}
export function isoDuration(value: string) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  return match
    ? Number(match[1] ?? 0) * 86400 +
        Number(match[2] ?? 0) * 3600 +
        Number(match[3] ?? 0) * 60 +
        Number(match[4] ?? 0)
    : undefined;
}
export function descriptionChapters(description: string) {
  return description.split('\n').flatMap((line) => {
    const match = /^\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})\s+(.+)$/.exec(line);
    if (!match || Number(match[3]) > 59 || (match[1] && Number(match[2]) > 59)) return [];
    return [
      {
        startSeconds: Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]),
        title: match[4].trim(),
      },
    ];
  });
}
function member(value: Obj): FeedEntry | null {
  const snippet = object(value.snippet),
    details = object(value.contentDetails);
  const id = text(details.videoId) || text(object(snippet.resourceId).videoId);
  if (!id) return null;
  return {
    id: `youtube:video:${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: text(snippet.title),
    description: text(snippet.description),
    creator: text(snippet.videoOwnerChannelTitle) || text(snippet.channelTitle),
    publishedAt: text(details.videoPublishedAt) || text(snippet.publishedAt) || undefined,
    kind: 'video',
    enclosures: [],
    transcripts: [],
  };
}
/** YouTube's channel feed links a Short as `/shorts/<id>` and a regular upload as `/watch`. */
export function youtubeFeedEntryKind(url: string) {
  try {
    return new URL(url).pathname.startsWith('/shorts/') ? 'short_video' : 'video';
  } catch {
    return 'video';
  }
}
/** A channel's uploads playlist (`UU` + channel suffix) mixes Shorts with regular videos and
 * the API does not label them. YouTube keeps a Shorts-only playlist per channel (`UUSH` +
 * the same suffix), so membership there is the classification. Only entries published at or
 * after `since` need a verdict; `null` classifies the whole page. A channel without Shorts
 * has no such playlist. The lookup is bounded: an upload older than the Shorts it could
 * examine has no verdict and is withheld as `short_video` rather than delivered as a video. */
export async function markYouTubeShorts(
  env: Env,
  owner: string | undefined,
  routeUrl: string,
  entries: FeedEntry[],
  since?: string | null
) {
  const identity = identify(routeUrl);
  const uploads = identity.kind === 'playlist' ? (identity.externalId ?? '') : '';
  if (!/^UU[A-Za-z0-9_-]{22}$/.test(uploads)) return;
  const relevant = entries.filter(
    (entry) => !since || !entry.publishedAt || entry.publishedAt >= since
  );
  if (!relevant.length) return;
  const dates = relevant.map((entry) => entry.publishedAt ?? '');
  const oldest = dates.includes('') ? '' : dates.sort()[0];
  const shorts = new Set<string>();
  let cursor: string | undefined;
  let examinedSince = '';
  // Both playlists are newest first, so stop once the Shorts reach back past the page.
  for (let pages = 0; pages < 10; pages++) {
    let page: Page;
    try {
      page = await youtubeRequest(env, owner, 'playlistItems', {
        part: 'contentDetails',
        playlistId: `UUSH${uploads.slice(2)}`,
        maxResults: '50',
        ...(cursor ? { pageToken: cursor } : {}),
      });
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'source_not_found') break;
      throw error;
    }
    let covered = false;
    for (const item of page.items) {
      const details = object(item.contentDetails);
      if (text(details.videoId)) shorts.add(`youtube:video:${text(details.videoId)}`);
      const published = text(details.videoPublishedAt);
      if (oldest && published && published < oldest) covered = true;
      if (published && (!examinedSince || published < examinedSince)) examinedSince = published;
    }
    cursor = page.nextPageToken;
    if (!cursor || covered) {
      examinedSince = '';
      break;
    }
  }
  for (const entry of entries)
    if (shorts.has(entry.id) || (examinedSince && (entry.publishedAt ?? '') < examinedSince))
      entry.kind = 'short_video';
}
export async function youtubePlaylistPage(
  env: Env,
  owner: string | undefined,
  url: string,
  cursor?: string
) {
  const identity = identify(url);
  if (identity.kind !== 'playlist') throw new ProviderError('youtube_playlist_required', false);
  const page = await youtubeRequest(env, owner, 'playlistItems', {
    part: 'snippet,contentDetails',
    playlistId: identity.externalId!,
    maxResults: '50',
    ...(cursor ? { pageToken: cursor } : {}),
  });
  return {
    title: 'YouTube playlist',
    url,
    entries: page.items.map(member).filter((entry): entry is FeedEntry => !!entry),
    nextCursor: page.nextPageToken,
    total: page.pageInfo?.totalResults,
  };
}
// A video's creator image is its channel avatar, which needs one extra lookup (1 quota unit).
// The avatar is optional, so a failed lookup never fails the extraction.
async function channelAvatar(env: Env, owner: string | undefined, channelId: string) {
  try {
    const result = await youtubeRequest(env, owner, 'channels', { part: 'snippet', id: channelId });
    const thumbnails = object(object(result.items[0]?.snippet).thumbnails);
    return creatorImageReference(
      object(thumbnails.high ?? thumbnails.medium ?? thumbnails.default).url
    );
  } catch {
    return undefined;
  }
}
export async function youtubeApiExtraction(
  env: Env,
  owner: string | undefined,
  url: string
): Promise<Extraction> {
  const identity = identify(url);
  const params: Record<string, string> =
    identity.kind === 'channel'
      ? identity.externalId?.startsWith('@')
        ? { forHandle: identity.externalId }
        : identity.externalId?.startsWith('user:')
          ? { forUsername: identity.externalId.slice(5) }
          : { id: identity.externalId! }
      : { id: identity.externalId! };
  const path =
    identity.kind === 'video' ? 'videos' : identity.kind === 'playlist' ? 'playlists' : 'channels';
  const result = await youtubeRequest(env, owner, path, {
    part:
      identity.kind === 'playlist' ? 'snippet,contentDetails' : 'snippet,contentDetails,statistics',
    ...params,
  });
  const item = result.items[0];
  if (!item) throw new ProviderError('youtube_item_unavailable', false);
  const snippet = object(item.snippet),
    details = object(item.contentDetails);
  const contributions: ContributionInput[] = [];
  const add = (field: ContributionInput['field'], value: unknown) => {
    if (value !== undefined && value !== null && value !== '')
      contributions.push({
        field,
        value,
        category: 'source',
        provenance: {
          sourceUrl: identity.url,
          method: 'youtube-data-api',
          inputContributionIds: [],
        },
      });
  };
  add('title', snippet.title);
  add('description', snippet.description);
  add('creator', snippet.channelTitle ?? (identity.kind === 'channel' ? snippet.title : undefined));
  add('publishedAt', snippet.publishedAt);
  add('language', snippet.defaultAudioLanguage ?? snippet.defaultLanguage);
  add('topics', snippet.tags);
  const thumbnails = object(snippet.thumbnails);
  const thumbnail = object(
    thumbnails.maxres ?? thumbnails.high ?? thumbnails.medium ?? thumbnails.default
  ).url;
  add('thumbnail', thumbnail);
  const channelId = identity.kind === 'channel' ? text(item.id) : text(snippet.channelId);
  if (identity.kind === 'channel') add('creatorImageUrl', creatorImageReference(thumbnail));
  else if (identity.kind === 'video' && channelId)
    add('creatorImageUrl', await channelAvatar(env, owner, channelId));
  add('durationSeconds', isoDuration(text(details.duration)));
  add('structuredData', item);
  if (channelId)
    add('source', {
      id: channelId,
      name: identity.kind === 'channel' ? text(snippet.title) : text(snippet.channelTitle),
      url: `https://www.youtube.com/channel/${channelId}`,
      kind: 'channel',
    });
  const chapters = descriptionChapters(text(snippet.description));
  if (chapters.length) add('chapters', chapters);
  const links = [...text(snippet.description).matchAll(/https?:\/\/[^\s<>]+/g)].map((match) => ({
    url: match[0].replace(/[),.;]+$/, ''),
  }));
  if (links.length) add('links', links);
  if (identity.kind === 'playlist') {
    const page = await youtubePlaylistPage(env, owner, identity.url);
    add('members', {
      items: page.entries,
      total: page.total,
      nextCursor: page.nextCursor ?? null,
      complete: !page.nextCursor,
    });
  }
  const uploads = text(object(details.relatedPlaylists).uploads);
  return {
    ...(identity.kind === 'channel' && /^UC[A-Za-z0-9_-]+$/.test(text(item.id))
      ? {
          verifiedIdentity: {
            url: `https://www.youtube.com/channel/${text(item.id)}`,
            method: 'platform-identifier' as const,
          },
        }
      : {}),
    contributions,
    components: [
      { component: 'metadata', status: 'available' },
      ...(identity.kind === 'video'
        ? [
            {
              component: 'transcript',
              status: 'unavailable' as const,
              reasonCode: 'youtube_caption_download_requires_video_permissions',
            },
          ]
        : []),
    ],
    feedUrls: uploads ? [`https://www.youtube.com/playlist?list=${uploads}`] : [],
  };
}
