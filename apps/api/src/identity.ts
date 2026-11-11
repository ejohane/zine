import { ApiError, canonicalItemId, ownedItem, stableId, stmt } from './lib';
import type { Env } from './types';

export function creatorImageReference(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return undefined;
  try {
    const url = publicUrl(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function publicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ApiError(422, 'invalid_url', 'An absolute HTTP(S) URL is required');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['443', '80'].includes(url.port))
  ) {
    throw new ApiError(
      422,
      'unsafe_url',
      'Only public HTTP(S) references without credentials or custom ports are supported'
    );
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host.includes('.') ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.test') ||
    host.endsWith('.invalid') ||
    host === 'localhost' ||
    host.includes(':') ||
    /^\d+(\.\d+){3}$/.test(host)
  ) {
    // All literal IPs are excluded, not only private IPs, including URL-normalized numeric IP forms.
    throw new ApiError(422, 'unsafe_url', 'A public DNS hostname is required');
  }
  url.hash = '';
  return url;
}

export interface Identity {
  key: string;
  url: string;
  platform: string;
  kind: string;
  externalId?: string;
}
export function identify(input: string): Identity {
  const url = publicUrl(input);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
    if (url.pathname === '/feeds/videos.xml') {
      const parameter = url.searchParams.has('channel_id') ? 'channel_id' : 'playlist_id';
      const externalId = url.searchParams.get(parameter);
      if (!externalId || !/^[A-Za-z0-9_-]+$/.test(externalId))
        throw new ApiError(
          422,
          'unsupported_reference',
          'A YouTube feed requires a channel or playlist ID'
        );
      return {
        key: `youtube:feed:${parameter}:${externalId}`,
        url: `https://www.youtube.com/feeds/videos.xml?${parameter}=${externalId}`,
        platform: 'youtube',
        kind: 'feed',
        externalId,
      };
    }
    const videoId =
      host === 'youtu.be'
        ? parts[0]
        : ['shorts', 'embed', 'live'].includes(parts[0])
          ? parts[1]
          : url.searchParams.get('v');
    if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId))
      return {
        key: `youtube:video:${videoId}`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        platform: 'youtube',
        kind: 'video',
        externalId: videoId,
      };
    const playlistId = url.searchParams.get('list');
    if (playlistId && /^[A-Za-z0-9_-]+$/.test(playlistId))
      return {
        key: `youtube:playlist:${playlistId}`,
        url: `https://www.youtube.com/playlist?list=${playlistId}`,
        platform: 'youtube',
        kind: 'playlist',
        externalId: playlistId,
      };
    if (parts[0] === 'channel' && /^[A-Za-z0-9_-]+$/.test(parts[1] ?? ''))
      return {
        key: `youtube:channel:${parts[1]}`,
        url: `https://www.youtube.com/channel/${parts[1]}`,
        platform: 'youtube',
        kind: 'channel',
        externalId: parts[1],
      };
    if (['user', 'c'].includes(parts[0]) && /^[A-Za-z0-9_-]+$/.test(parts[1] ?? ''))
      return {
        key: `youtube:${parts[0] === 'user' ? 'username' : 'custom'}:${parts[1].toLowerCase()}`,
        url: `https://www.youtube.com/${parts[0]}/${parts[1]}`,
        platform: 'youtube',
        kind: 'channel',
        externalId: `${parts[0]}:${parts[1]}`,
      };
    if (/^@[\p{L}\p{N}\p{M}_.·-]+$/u.test(parts[0] ?? ''))
      return {
        key: `youtube:handle:${parts[0].toLowerCase()}`,
        url: `https://www.youtube.com/${parts[0].toLowerCase()}`,
        platform: 'youtube',
        kind: 'channel',
        externalId: parts[0],
      };
    throw new ApiError(
      422,
      'unsupported_reference',
      'Use a YouTube video, channel, or playlist URL'
    );
  }
  if (host === 'open.spotify.com') {
    if (parts[0]?.startsWith('intl-')) parts.shift();
    if (
      !['episode', 'show', 'track', 'album', 'playlist', 'artist'].includes(parts[0]) ||
      !/^[A-Za-z0-9]{22}$/.test(parts[1] ?? '')
    )
      throw new ApiError(422, 'unsupported_reference', 'Unsupported Spotify URL');
    return {
      key: `spotify:${parts[0]}:${parts[1]}`,
      url: `https://open.spotify.com/${parts[0]}/${parts[1]}`,
      platform: 'spotify',
      kind: parts[0] === 'episode' ? 'podcast_episode' : parts[0],
      externalId: parts[1],
    };
  }
  if (['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)) {
    if (
      parts.length === 3 &&
      /^[A-Za-z0-9_]{1,15}$/.test(parts[0]) &&
      parts[1] === 'article' &&
      /^\d+$/.test(parts[2])
    )
      return {
        key: `x:article:${parts[2]}`,
        url: `https://x.com/i/article/${parts[2]}`,
        platform: 'x',
        kind: 'article',
        externalId: parts[2],
      };
    const status = parts.indexOf('status');
    if (status >= 0 && /^\d+$/.test(parts[status + 1] ?? ''))
      return {
        key: `x:post:${parts[status + 1]}`,
        url: `https://x.com/i/status/${parts[status + 1]}`,
        platform: 'x',
        kind: 'post',
        externalId: parts[status + 1],
      };
    if (parts[0] === 'i' && parts[1] === 'user' && /^\d+$/.test(parts[2] ?? ''))
      return {
        key: `x:account_id:${parts[2]}`,
        url: `https://x.com/i/user/${parts[2]}`,
        platform: 'x',
        kind: 'account',
        externalId: parts[2],
      };
    if (parts[0] === 'i' && parts[1] === 'lists' && /^\d+$/.test(parts[2] ?? ''))
      return {
        key: `x:list:${parts[2]}`,
        url: `https://x.com/i/lists/${parts[2]}`,
        platform: 'x',
        kind: 'list',
        externalId: parts[2],
      };
    if (parts[0] === 'i' && parts[1] === 'broadcasts' && /^[A-Za-z0-9]+$/.test(parts[2] ?? ''))
      return {
        key: `x:broadcast:${parts[2]}`,
        url: `https://x.com/i/broadcasts/${parts[2]}`,
        platform: 'x',
        kind: 'video',
        externalId: parts[2],
      };
    if (parts.length === 1 && /^[A-Za-z0-9_]{1,15}$/.test(parts[0]))
      return {
        key: `x:account:${parts[0].toLowerCase()}`,
        url: `https://x.com/${parts[0].toLowerCase()}`,
        platform: 'x',
        kind: 'account',
        externalId: parts[0].toLowerCase(),
      };
    throw new ApiError(422, 'unsupported_reference', 'Use an X post, account, or list URL');
  }
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || ['fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid'].includes(key))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const normalized = url.toString();
  return {
    key: `url:${normalized}`,
    url: normalized,
    platform: host.endsWith('.substack.com') || host === 'substack.com' ? 'substack' : 'web',
    kind: 'article',
  };
}
export async function contentIdentity(input: string) {
  const identity = identify(input);
  return { ...identity, id: await stableId('cnt', identity.key) };
}

export async function personalContentIdentity(env: Env, owner: string, input: string) {
  let content = await contentIdentity(input);
  const original = await stableId('itm', owner, content.id);
  const itemId = await canonicalItemId(env, owner, original);
  if (itemId !== original) {
    const personal = await ownedItem(env, owner, itemId, true);
    const url = await stmt(
      env.DB,
      'SELECT canonical_url FROM content_items WHERE id=?',
      personal.content_id
    ).first<string>('canonical_url');
    if (!url) throw new ApiError(409, 'identity_unavailable', 'Canonical identity is unavailable');
    content = await contentIdentity(url);
  }
  return { content, itemId };
}

export function mutablePlatformIdentity(identity: ReturnType<typeof identify>) {
  return (
    /^youtube:(handle|username|custom):/.test(identity.key) || identity.key.startsWith('x:account:')
  );
}

const shortenerHosts = new Set([
  'bit.ly',
  't.co',
  'tinyurl.com',
  'lnkd.in',
  'spoti.fi',
  'spotify.link',
  'yt.be',
]);
/** A login gate or missing-page fallback does not establish content identity. */
export function unrelatedRedirect(source: string, target: string) {
  const a = new URL(source),
    b = new URL(target);
  if (a.pathname === b.pathname && a.hostname === b.hostname) return false;
  const parts = b.pathname.toLowerCase().split('/').filter(Boolean);
  if (
    [
      'login',
      'signin',
      'sign-in',
      'signup',
      'sign-up',
      'subscribe',
      'auth',
      'oauth',
      'consent',
      'captcha',
    ].includes(parts[0]) ||
    (['account', 'accounts', 'user', 'users', 'cdn-cgi'].includes(parts[0]) &&
      /login|signin|auth|challenge/.test(parts[1] ?? '')) ||
    /^(accounts|consent)\./.test(b.hostname)
  )
    return true;
  return b.pathname === '/' && a.pathname !== '/' && !shortenerHosts.has(a.hostname);
}
export function strongRedirect(source: string, target: string, chain: { status: number }[]) {
  if (!chain.length || unrelatedRedirect(source, target)) return false;
  const a = new URL(source),
    b = new URL(target);
  a.searchParams.sort();
  b.searchParams.sort();
  const transportAlias =
    a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '') &&
    a.pathname === b.pathname &&
    a.search === b.search;
  return (
    transportAlias ||
    shortenerHosts.has(a.hostname) ||
    chain.every((step) => step.status === 301 || step.status === 308)
  );
}
