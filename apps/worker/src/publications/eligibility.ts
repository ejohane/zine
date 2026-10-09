import { isSafePublicArticleUrl } from '../article-body/url-safety';
import { PublicationError } from './errors';
import type { SelectionMetadata } from './model';

export interface SavedSource {
  id: string;
  item_id: string;
  user_id: string;
  state: string;
  canonical_url: string;
  provider: string;
  provider_id: string;
  content_type: string;
  title: string;
  creator_name: string | null;
  publisher: string | null;
  updated_at: string;
  raw_metadata: string | null;
}
export function safeDestination(value: string): boolean {
  if (!isSafePublicArticleUrl(value)) return false;
  const u = new URL(value);
  if (
    !u.hostname.includes('.') ||
    u.hostname.endsWith('.test') ||
    /(?:token|secret|signature|password|auth|key|credential|email|subscriber|jwt)/i.test(u.search)
  )
    return false;
  if (/\/(?:private|secret|signed|token)\//i.test(u.pathname)) return false;
  return true;
}
export async function fingerprint(source: SavedSource): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(source))
  );
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** Metadata from Gmail/private feeds is never made public through an editor supplied URL. */
export function publicMetadata(source: SavedSource): SelectionMetadata {
  const reject = (reason: string): never => {
    throw new PublicationError('INELIGIBLE_SELECTIONS', 422, { reason });
  };
  if (source.provider === 'GMAIL') return reject('PRIVATE_SOURCE');
  if (!safeDestination(source.canonical_url)) return reject('PRIVATE_DESTINATION');
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(source.raw_metadata || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed;
  } catch {
    /* no evidence */
  }
  if (
    raw.isPrivate === true ||
    raw.private === true ||
    raw.visibility === 'private' ||
    raw.isPublic === false
  )
    return reject('PRIVATE_SOURCE');
  const u = new URL(source.canonical_url);
  const hosts: Record<string, string[]> = {
    YOUTUBE: ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'],
    SPOTIFY: ['open.spotify.com'],
    X: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'],
  };
  if (hosts[source.provider] && !hosts[source.provider].includes(u.hostname))
    return reject('UNVERIFIED_PUBLIC_SOURCE');
  if (!['YOUTUBE', 'SPOTIFY', 'X', 'WEB', 'RSS', 'SUBSTACK'].includes(source.provider))
    return reject('UNVERIFIED_PUBLIC_SOURCE');
  if (!['ARTICLE', 'VIDEO', 'PODCAST', 'POST'].includes(source.content_type))
    return reject('UNVERIFIED_PUBLIC_SOURCE');
  // Podcast feed credentials and personal enclosures can be hidden in ingestion provenance.
  if (source.content_type === 'PODCAST' && (raw.isPrivateFeed === true || raw.privateFeed === true))
    return reject('PRIVATE_SOURCE');
  return {
    contentType: source.content_type as SelectionMetadata['contentType'],
    title: source.title,
    creatorName: source.creator_name || source.publisher || u.hostname,
    sourceName: source.publisher || u.hostname,
    originalUrl: source.canonical_url,
    artworkUrl: null,
    originalAvailability: 'UNKNOWN',
  };
}
export async function savedSource(
  db: D1Database,
  owner: string,
  bookmarkId: string
): Promise<SavedSource | null> {
  return db
    .prepare(
      `SELECT ui.id,ui.item_id,ui.user_id,ui.state,i.canonical_url,i.provider,i.provider_id,i.content_type,i.title,c.name AS creator_name,i.publisher,i.updated_at,i.raw_metadata
 FROM user_items ui JOIN items i ON i.id=ui.item_id LEFT JOIN creators c ON c.id=i.creator_id WHERE ui.id=? AND ui.user_id=?`
    )
    .bind(bookmarkId, owner)
    .first<SavedSource>();
}

/** Fetch without credentials so public snapshots never copy private library metadata. */
export async function resolvePublicMetadata(source: SavedSource): Promise<SelectionMetadata> {
  let url = source.canonical_url;
  if (source.provider === 'GMAIL') {
    let raw: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(source.raw_metadata || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed;
    } catch {
      /* no public edition */
    }
    const edition = raw.publicWebUrl;
    if (typeof edition !== 'string')
      throw new PublicationError('INELIGIBLE_SELECTIONS', 422, { reason: 'PRIVATE_SOURCE' });
    url = edition;
  }
  // Validate provenance and destination before any network access.
  publicMetadata({
    ...source,
    provider: source.provider === 'GMAIL' ? 'WEB' : source.provider,
    canonical_url: url,
  });
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (!safeDestination(url))
      throw new PublicationError('INELIGIBLE_SELECTIONS', 422, { reason: 'PRIVATE_DESTINATION' });
    try {
      response = await fetch(url, {
        redirect: 'manual',
        headers: { Accept: 'text/html', 'User-Agent': 'Zine-Publication/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new PublicationError('INELIGIBLE_SELECTIONS', 422, {
        reason: 'PUBLIC_SOURCE_UNAVAILABLE',
      });
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) break;
      url = new URL(location, url).href;
      continue;
    }
    break;
  }
  if (response?.status === 404 || response?.status === 410) {
    await response.body?.cancel();
    throw new PublicationError('INELIGIBLE_SELECTIONS', 422, { reason: 'ORIGINAL_UNAVAILABLE' });
  }
  if (!response?.ok || !response.headers.get('content-type')?.includes('text/html')) {
    await response?.body?.cancel();
    throw new PublicationError('INELIGIBLE_SELECTIONS', 422, {
      reason: 'UNVERIFIED_PUBLIC_SOURCE',
    });
  }
  const reader = response.body?.getReader();
  if (!reader) throw new PublicationError('INELIGIBLE_SELECTIONS', 422);
  const decoder = new TextDecoder();
  let html = '',
    size = 0;
  try {
    while (true) {
      const v = await reader.read();
      if (v.done) break;
      size += v.value.byteLength;
      if (size > 2 * 1024 * 1024)
        throw new PublicationError('INELIGIBLE_SELECTIONS', 422, {
          reason: 'PUBLIC_SOURCE_TOO_LARGE',
        });
      html += decoder.decode(v.value, { stream: true });
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const { parseHTML } = await import('linkedom');
  const { document } = parseHTML(html);
  const meta = (name: string) =>
    document
      .querySelector(`meta[property="${name}"],meta[name="${name}"]`)
      ?.getAttribute('content')
      ?.trim();
  const title = meta('og:title') || document.querySelector('title')?.textContent?.trim();
  if (!title)
    throw new PublicationError('INELIGIBLE_SELECTIONS', 422, {
      reason: 'UNVERIFIED_PUBLIC_SOURCE',
    });
  const host = new URL(url).hostname,
    artwork = meta('og:image');
  let artworkUrl: string | null = null;
  try {
    artworkUrl = artwork ? new URL(artwork, url).href : null;
  } catch {
    /* omit malformed artwork */
  }
  return {
    contentType: source.content_type as SelectionMetadata['contentType'],
    title: title.slice(0, 500),
    creatorName: (meta('author') || meta('article:author') || host).slice(0, 200),
    sourceName: (meta('og:site_name') || host).slice(0, 200),
    originalUrl: url,
    artworkUrl: artworkUrl && safeDestination(artworkUrl) ? artworkUrl : null,
    originalAvailability: 'AVAILABLE',
  };
}
