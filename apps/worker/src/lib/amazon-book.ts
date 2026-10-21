import type { BookMetadata } from './book-metadata';

export interface AmazonProductLink {
  asin: string;
  canonicalUrl: string;
  providerId: string;
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
  target: AmazonProductLink
): BookMetadata | null {
  if (!text || text.length > 4096) return null;
  const match = text
    .trim()
    .match(/^I think you might like this book:\s*([\s\S]+?)(https?:\/\/[^\s<>"“”]+)/i);
  if (!match) return null;
  const sharedTarget = parseAmazonProductLink(match[2]);
  if (sharedTarget?.providerId !== target.providerId) return null;
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
