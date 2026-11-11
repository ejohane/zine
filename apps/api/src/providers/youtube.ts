import { hasYouTubeApi, youtubeApiExtraction } from './youtube-api';
import { parsePublishedTranscript } from './transcript';
import { parseHTML } from 'linkedom';
import { acquireBudget, budgetScope, releaseBudget } from '../budgets';
import { id } from '../lib';
import { creatorImageReference, identify } from '../identity';
import { fetchPublic, ProviderError } from '../remote';
import type { Env } from '../types';
import type { ContributionInput } from '../enrichment';
import { extractWeb, type Extraction } from './web';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Extract a JSON object while respecting strings/escapes, not a greedy regex. */
export function embeddedObject(html: string, marker: string): Obj | null {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const open = html.indexOf('{', start + marker.length);
  if (open < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') {
      quoted = true;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) {
      try {
        return obj(JSON.parse(html.slice(open, i + 1)));
      } catch {
        return null;
      }
    }
  }
  return null;
}
function findObject(value: unknown, key: string): Obj | null {
  if (!value || typeof value !== 'object') return null;
  const record = obj(value);
  if (record[key]) return obj(record[key]);
  for (const child of Object.values(record)) {
    const result = findObject(child, key);
    if (result) return result;
  }
  return null;
}
export function parseTimedTranscript(value: unknown) {
  const events = arr(obj(value).events);
  return {
    segments: events
      .map((event) => {
        const e = obj(event);
        const text = arr(e.segs)
          .map((seg) => str(obj(seg).utf8))
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        const startSeconds = Number(e.tStartMs ?? 0) / 1000;
        return { text, startSeconds, endSeconds: startSeconds + Number(e.dDurationMs ?? 0) / 1000 };
      })
      .filter((segment) => segment.text),
  };
}

async function pageTranscript(html: string, initial: Obj | null) {
  const endpoint = findObject(initial, 'getTranscriptEndpoint');
  if (!endpoint?.params) throw new ProviderError('transcript_endpoint_not_available', false);
  const config = embeddedObject(html, 'ytcfg.set(');
  const client = obj(obj(config?.INNERTUBE_CONTEXT).client);
  if (!client.clientVersion) throw new ProviderError('transcript_client_context_missing', false);
  const response = await fetchPublic(
    'https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: { client }, params: endpoint.params }),
    }
  );
  const data = JSON.parse(response.text);
  const segments: { text: string; startSeconds: number; endSeconds: number }[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const record = obj(value);
    if (record.transcriptSegmentRenderer) {
      const segment = obj(record.transcriptSegmentRenderer);
      const snippet = obj(segment.snippet);
      const text =
        str(snippet.simpleText) ||
        arr(snippet.runs)
          .map((run) => str(obj(run).text))
          .join('');
      if (text)
        segments.push({
          text,
          startSeconds: Number(segment.startMs ?? 0) / 1000,
          endSeconds: Number(segment.endMs ?? segment.startMs ?? 0) / 1000,
        });
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(data);
  if (!segments.length) throw new ProviderError('transcript_endpoint_empty', false);
  return { segments };
}

async function youtubeEmbedMetadata(url: string): Promise<Extraction> {
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('format', 'json');
  const response = await fetchPublic(endpoint.toString(), {
    accept: 'application/json',
    maxBytes: 128 * 1024,
  });
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(response.text);
  } catch {
    throw new ProviderError('youtube_metadata_unavailable', false);
  }
  if (typeof value.title !== 'string')
    throw new ProviderError('youtube_metadata_unavailable', false);
  const provenance = { method: 'youtube-oembed', sourceUrl: url, inputContributionIds: [] };
  const fields: [ContributionInput['field'], unknown][] = [
    ['title', value.title],
    ['creator', value.author_name],
    ['thumbnail', value.thumbnail_url],
  ];
  if (typeof value.author_url === 'string')
    fields.push(['source', { name: value.author_name, url: value.author_url, kind: 'channel' }]);
  return {
    contributions: fields
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => ({ field, value, category: 'source', provenance })),
    components: [
      { component: 'metadata', status: 'available' },
      {
        component: 'transcript',
        status: 'unavailable',
        reasonCode: 'public_watch_page_unavailable',
      },
    ],
    feedUrls: [],
  };
}

export async function extractYouTube(env: Env, url: string, owner?: string): Promise<Extraction> {
  const identity = identify(url);
  if (identity.platform !== 'youtube') throw new ProviderError('youtube_invalid_reference', false);
  if (identity.kind === 'feed') return extractWeb(identity.url);
  const provenance = {
    sourceUrl: identity.url,
    method: 'youtube-public-page',
    inputContributionIds: [],
  };
  const contributions: ContributionInput[] = [];
  const add = (field: ContributionInput['field'], value: unknown) => {
    if (value !== undefined && value !== null && value !== '')
      contributions.push({ field, value, category: 'source', provenance });
  };
  const apiAvailable = await hasYouTubeApi(env, owner);
  let apiExtraction =
    apiAvailable && !identity.externalId?.startsWith('c:')
      ? await youtubeApiExtraction(env, owner, url)
      : null;
  // Account-authorized metadata survives a public-page restriction. Public
  // captions remain a separate best-effort component, never invented from metadata.
  let publicLease: string | undefined;
  let publicRetryAfter: number | undefined;
  const publicScope = budgetScope(url);
  if (apiAvailable && env.DB) {
    const token = id('publiclease');
    const budget = await acquireBudget(env, publicScope, token);
    if (!budget.acquired) {
      if (apiExtraction)
        return {
          ...apiExtraction,
          components: apiExtraction.components.map((component) =>
            component.component === 'transcript'
              ? { ...component, reasonCode: 'youtube_public_access_deferred' }
              : component
          ),
        };
      throw new ProviderError(
        'youtube_public_access_deferred',
        true,
        Math.max(1, Math.ceil((Date.parse(budget.availableAt) - Date.now()) / 1000))
      );
    }
    publicLease = token;
  }
  try {
    let page;
    try {
      page = await fetchPublic(identity.url, { maxBytes: 8 * 1024 * 1024 });
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'rate_limited')
        publicRetryAfter = error.retryAfterSeconds;
      if (apiExtraction) return apiExtraction;
      if (identity.kind === 'video') {
        try {
          return await youtubeEmbedMetadata(identity.url);
        } catch {
          /* Preserve the underlying source restriction if both paths fail. */
        }
      }
      throw error;
    }
    const { document } = parseHTML(page.text);
    const meta = (name: string) =>
      document
        .querySelector(`meta[property="${name}"],meta[name="${name}"]`)
        ?.getAttribute('content');
    const player = embeddedObject(page.text, 'ytInitialPlayerResponse');
    const details = obj(player?.videoDetails);
    const micro = obj(obj(player?.microformat).playerMicroformatRenderer);
    const initial = embeddedObject(page.text, 'ytInitialData');
    const channel = findObject(initial, 'channelMetadataRenderer');
    add('title', str(details.title) || str(channel?.title) || meta('og:title'));
    add(
      'description',
      str(details.shortDescription) || str(channel?.description) || meta('og:description')
    );
    const thumbnail = arr(obj(details.thumbnail).thumbnails).at(-1);
    add('thumbnail', str(obj(thumbnail).url) || meta('og:image'));
    const author =
      str(details.author) ||
      str(channel?.title) ||
      (identity.kind === 'channel' ? (meta('og:title') ?? '') : '');
    if (author) add('creator', author);
    if (details.lengthSeconds !== undefined && Number.isFinite(Number(details.lengthSeconds)))
      add('durationSeconds', Number(details.lengthSeconds));
    const published = str(micro.publishDate) || str(micro.uploadDate);
    if (published && Number.isFinite(Date.parse(published)))
      add('publishedAt', new Date(published).toISOString());
    if (Array.isArray(details.keywords)) add('topics', details.keywords);
    const channelId =
      str(details.channelId) ||
      str(channel?.externalId) ||
      (identity.kind === 'channel' && /^UC[A-Za-z0-9_-]+$/.test(identity.externalId ?? '')
        ? identity.externalId!
        : '') ||
      document.querySelector('meta[itemprop="channelId"]')?.getAttribute('content') ||
      '';
    const videoOwner = findObject(initial, 'videoOwnerRenderer');
    const ownerChannelId = str(obj(obj(videoOwner?.navigationEndpoint).browseEndpoint).browseId);
    const channelAvatar =
      identity.kind === 'channel'
        ? channel?.avatar
        : ownerChannelId && ownerChannelId === channelId
          ? videoOwner?.thumbnail
          : undefined;
    add(
      'creatorImageUrl',
      creatorImageReference(obj(arr(obj(channelAvatar).thumbnails).at(-1)).url)
    );
    if (channelId)
      add('source', {
        id: channelId,
        name: author,
        url: `https://www.youtube.com/channel/${channelId}`,
        kind: 'channel',
      });
    const components: Extraction['components'] = [];
    if (identity.kind === 'video') {
      const captions = obj(obj(player?.captions).playerCaptionsTracklistRenderer);
      const tracks = arr(captions.captionTracks).map(obj);
      const track =
        tracks.find((t) => str(t.languageCode) === 'en' && t.kind !== 'asr') ??
        tracks.find((t) => str(t.languageCode) === 'en') ??
        tracks[0];
      if (track?.baseUrl) {
        try {
          const trackUrl = new URL(str(track.baseUrl));
          if (
            !['www.youtube.com', 'youtube.com'].includes(trackUrl.hostname) ||
            trackUrl.pathname !== '/api/timedtext'
          )
            throw new ProviderError('caption_url_invalid', false);
          trackUrl.searchParams.set('fmt', 'json3');
          const response = await fetchPublic(trackUrl.toString());
          const transcript = response.text.trimStart().startsWith('<')
            ? parsePublishedTranscript(response.text, 'text/xml')
            : parseTimedTranscript(JSON.parse(response.text));
          if (!transcript.segments.length) throw new ProviderError('caption_track_empty', false);
          add('transcript', { language: str(track.languageCode) || undefined, ...transcript });
          components.push({ component: 'transcript', status: 'available' });
        } catch (error) {
          if (error instanceof ProviderError && error.code === 'rate_limited')
            publicRetryAfter = error.retryAfterSeconds;
          components.push({
            component: 'transcript',
            status: 'unavailable',
            reasonCode: error instanceof ProviderError ? error.code : 'caption_retrieval_failed',
          });
        }
      } else
        components.push({
          component: 'transcript',
          status: 'unavailable',
          reasonCode: 'public_caption_track_not_available',
        });
      if (!contributions.some((contribution) => contribution.field === 'transcript')) {
        try {
          const transcript = await pageTranscript(page.text, initial);
          add('transcript', transcript);
          const component = components.find((component) => component.component === 'transcript')!;
          component.status = 'available';
          delete component.reasonCode;
        } catch (error) {
          if (error instanceof ProviderError && error.code === 'rate_limited')
            publicRetryAfter = error.retryAfterSeconds;
          /* Metadata remains available; the component retains its explicit restriction. */
        }
      }
    }
    if (!contributions.some((c) => c.field === 'title')) {
      if (identity.kind === 'video') return youtubeEmbedMetadata(identity.url);
      throw new ProviderError('youtube_metadata_unavailable', false);
    }
    if (
      apiAvailable &&
      !apiExtraction &&
      identity.kind === 'channel' &&
      /^UC[A-Za-z0-9_-]+$/.test(channelId)
    )
      apiExtraction = await youtubeApiExtraction(
        env,
        owner,
        `https://www.youtube.com/channel/${channelId}`
      );
    components.unshift({ component: 'metadata', status: 'available' });
    return {
      ...(apiExtraction?.verifiedIdentity
        ? { verifiedIdentity: apiExtraction.verifiedIdentity }
        : identity.kind === 'channel' && /^UC[A-Za-z0-9_-]+$/.test(channelId)
          ? {
              verifiedIdentity: {
                url: `https://www.youtube.com/channel/${channelId}`,
                method: 'platform-identifier' as const,
              },
            }
          : {}),
      contributions: apiExtraction
        ? [
            ...apiExtraction.contributions,
            ...contributions.filter(
              (value) =>
                value.field === 'transcript' ||
                (value.field === 'creatorImageUrl' &&
                  !apiExtraction?.contributions.some((entry) => entry.field === 'creatorImageUrl'))
            ),
          ]
        : contributions,
      components: apiExtraction
        ? [
            ...apiExtraction.components.filter((value) => value.component !== 'transcript'),
            ...components.filter((value) => value.component === 'transcript'),
          ]
        : components,
      feedUrls: apiExtraction?.feedUrls.length
        ? apiExtraction.feedUrls
        : channelId
          ? [`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`]
          : [],
    };
  } finally {
    if (publicLease) await releaseBudget(env, publicScope, publicLease, publicRetryAfter);
  }
}

export async function youtubeSource(env: Env, url: string, owner?: string) {
  const supplied = identify(url);
  if (supplied.kind === 'feed') {
    const feed = await extractWeb(supplied.url);
    const parameter = new URL(supplied.url).searchParams.has('channel_id') ? 'channel' : 'playlist';
    return {
      url:
        parameter === 'channel'
          ? `https://www.youtube.com/channel/${supplied.externalId}`
          : `https://www.youtube.com/playlist?list=${supplied.externalId}`,
      name: String(feed.contributions.find((c) => c.field === 'title')?.value ?? 'YouTube feed'),
      feedUrl: supplied.url,
      kind: 'youtube_feed',
    };
  }
  const extraction = await extractYouTube(env, url, owner);
  const value = extraction.contributions.find((c) => c.field === 'source')?.value as
    | { id: string; name: string; url: string }
    | undefined;
  const identity = identify(url);
  if (identity.kind === 'playlist')
    return {
      url: identity.url,
      name: String(
        extraction.contributions.find((c) => c.field === 'title')?.value ?? 'YouTube playlist'
      ),
      feedUrl: identity.url,
      kind: 'youtube_playlist',
    };
  if (value && (await hasYouTubeApi(env, owner))) {
    const channel = await youtubeApiExtraction(env, owner, value.url);
    if (channel.feedUrls[0])
      return {
        url: value.url,
        name: value.name,
        feedUrl: channel.feedUrls[0],
        kind: 'youtube_playlist',
      };
  }
  if (!value || !extraction.feedUrls.length)
    throw new ProviderError('youtube_channel_unavailable', false);
  return {
    url: value.url,
    name: value.name,
    feedUrl: extraction.feedUrls[0],
    kind: extraction.feedUrls[0].includes('/playlist?') ? 'youtube_playlist' : 'youtube_feed',
  };
}
