import type { BookMetadata } from './book-metadata';

export interface AmazonProductLink {
  asin: string;
  canonicalUrl: string;
  providerId: string;
}

export function isAmazonShortLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'a.co' &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^\/[a-z0-9]+\/?$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/** Stop at the product redirect: following further can land on Kindle sign-in. */
export async function resolveAmazonProductLink(value: string): Promise<AmazonProductLink | null> {
  const direct = parseAmazonProductLink(value);
  if (direct || !isAmazonShortLink(value)) return direct;
  let current = value;
  const seen = new Set<string>();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (!isAmazonShortLink(current) || seen.has(current)) return null;
      seen.add(current);
      const response = await fetch(current, { redirect: 'manual', signal: controller.signal });
      await response.body?.cancel();
      if (![301, 302, 303, 307, 308].includes(response.status)) return null;
      const location = response.headers.get('location');
      if (!location) return null;
      current = new URL(location, current).href;
      const product = parseAmazonProductLink(current);
      if (product && new URL(current).protocol === 'https:') return product;
      const kindle = new URL(current);
      if (
        kindle.protocol === 'https:' &&
        kindle.hostname === 'read.amazon.com' &&
        !kindle.username &&
        !kindle.password &&
        !kindle.port &&
        kindle.pathname === '/kp/kshare' &&
        /^[a-z0-9]{10}$/i.test(kindle.searchParams.get('asin') ?? '')
      )
        return parseAmazonProductLink(
          `https://www.amazon.com/dp/${kindle.searchParams.get('asin')}`
        );
    }
  } catch {
    // Failed resolution keeps ordinary-link handling available.
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

/** A product URL identifies an ASIN; it does not establish that the product is a book. */
export function parseAmazonProductLink(value: string): AmazonProductLink | null {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !['amazon.com', 'www.amazon.com'].includes(url.hostname)
    )
      return null;
    const asin = url.pathname
      .match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([a-z0-9]{10})(?:\/|$)/i)?.[1]
      ?.toUpperCase();
    return asin
      ? {
          asin,
          canonicalUrl: `https://www.amazon.com/dp/${asin}`,
          providerId: `amazon.com:${asin}`,
        }
      : null;
  } catch {
    return null;
  }
}

export function amazonBookCover(asin: string): string {
  return `https://m.media-amazon.com/images/P/${asin}.01.L.jpg`;
}

/** Kindle's explicit book recommendation is user-supplied metadata, tied to this exact ASIN. */
export function bookFromKindleShare(
  text: string | undefined,
  target: AmazonProductLink,
  resolvedFrom?: string
): BookMetadata | null {
  if (!text || text.length > 4096) return null;
  const match = text
    .trim()
    .match(/^I think you might like this book:\s*([\s\S]+?)(https?:\/\/[^\s<>"“”]+)/i);
  if (!match) return null;
  const sharedTarget = parseAmazonProductLink(match[2]);
  const matchesResolvedShortLink =
    resolvedFrom &&
    isAmazonShortLink(resolvedFrom) &&
    isAmazonShortLink(match[2]) &&
    new URL(match[2]).href === new URL(resolvedFrom).href;
  if (sharedTarget?.providerId !== target.providerId && !matchesResolvedShortLink) return null;
  const metadata = match[1].trim();
  const by = metadata.toLowerCase().lastIndexOf(' by ');
  if (by < 1) return null;
  const title = metadata.slice(0, by).trim();
  const author = metadata.slice(by + 4).trim();
  if (!title || !author || title.length > 1000 || author.length > 300) return null;
  return {
    title,
    author,
    coverUrl: amazonBookCover(target.asin),
    description: null,
    publisher: null,
    isbn: null,
  };
}
