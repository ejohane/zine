import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { creatorImageReference, publicUrl, strongRedirect, unrelatedRedirect } from '../identity';
import { fetchPublic, ProviderError } from '../remote';
import { parseFeed } from './feed';
import type { ContributionInput } from '../enrichment';

export interface Extraction {
  resolvedUrl?: string;
  verifiedIdentity?: { url: string; method: 'platform-identifier' };
  contributions: ContributionInput[];
  components: { component: string; status: 'available' | 'unavailable'; reasonCode?: string }[];
  feedUrls: string[];
}
export async function extractWeb(url: string): Promise<Extraction> {
  const response = await fetchPublic(url);
  if (response.redirectChain.length && unrelatedRedirect(url, response.url))
    throw new ProviderError('source_redirect_unrelated', false);
  const extraction = extractWebDocument(response);
  extraction.resolvedUrl = strongRedirect(url, response.url, response.redirectChain)
    ? response.url
    : undefined;
  return extraction;
}
export function extractWebDocument(response: {
  url: string;
  headers: Headers;
  text: string;
}): Extraction {
  const method = 'web-extraction';
  const provenance = { sourceUrl: response.url, method, inputContributionIds: [] };
  const contributions: ContributionInput[] = [];
  const add = (field: ContributionInput['field'], value: unknown) => {
    if (value !== undefined && value !== null && value !== '')
      contributions.push({ field, value, category: 'source', provenance });
  };
  if (
    /(?:application\/(?:rss\+xml|atom\+xml|feed\+json)|text\/xml)/i.test(
      response.headers.get('content-type') ?? ''
    ) ||
    /^\s*<\?xml/.test(response.text) ||
    /^\s*<(rss|feed)[\s>]/.test(response.text) ||
    response.text.trimStart().startsWith('{')
  ) {
    const feed = parseFeed(response.text, response.url);
    add('title', feed.title);
    add('type', 'feed');
    add('description', feed.description);
    add('members', feed.entries);
    return {
      resolvedUrl: response.url,
      contributions,
      components: [{ component: 'metadata', status: 'available' }],
      feedUrls: [response.url],
    };
  }
  const mime = (response.headers.get('content-type') ?? 'text/html')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (mime === 'text/plain') {
    add(
      'title',
      response.text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 5)
        ?.slice(0, 200) ?? new URL(response.url).pathname
    );
    add('article', { text: response.text, coverage: 'unknown' });
    return {
      resolvedUrl: response.url,
      contributions,
      components: [
        { component: 'metadata', status: 'available' },
        { component: 'article', status: 'available' },
      ],
      feedUrls: [],
    };
  }
  if (!['text/html', 'application/xhtml+xml'].includes(mime))
    return {
      resolvedUrl: response.url,
      contributions,
      components: [
        { component: 'metadata', status: 'unavailable', reasonCode: 'unsupported_content_type' },
        { component: 'article', status: 'unavailable', reasonCode: 'unsupported_content_type' },
      ],
      feedUrls: [],
    };
  const { document } = parseHTML(response.text);
  if (document.querySelector('#challenge-form,#cf-challenge-running'))
    throw new ProviderError('source_access_restricted', false);
  const meta = (...names: string[]) => {
    for (const name of names) {
      const node = document.querySelector(`meta[property="${name}"],meta[name="${name}"]`);
      const value = node?.getAttribute('content');
      if (value) return value;
    }
    return undefined;
  };
  const resolve = (value: string | undefined) => {
    try {
      return value ? publicUrl(new URL(value, response.url).toString()).toString() : undefined;
    } catch {
      return undefined;
    }
  };
  add(
    'title',
    meta('og:title', 'twitter:title') || document.querySelector('title')?.textContent?.trim()
  );
  add('description', meta('og:description', 'description', 'twitter:description'));
  add('creator', meta('author', 'article:author'));
  // Exactly one thumbnail contribution: social-card metadata first, structured data and
  // in-article fallbacks further down once the rest of the document has been read.
  const socialImage = resolve(meta('og:image', 'twitter:image'));
  add('thumbnail', socialImage);
  const date = meta('article:published_time', 'date', 'datePublished');
  if (date && Number.isFinite(Date.parse(date))) add('publishedAt', new Date(date).toISOString());
  const language = document.documentElement.lang || meta('og:locale');
  if (language) add('language', language);
  const structured = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      structured.push(JSON.parse(script.textContent ?? ''));
    } catch {
      /* Invalid publisher JSON is ignored; other metadata remains useful. */
    }
  }
  if (structured.length) add('structuredData', structured);
  const objects: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value)) objects.push(value as Record<string, unknown>);
    for (const child of Object.values(value)) visit(child);
  };
  for (const value of structured) visit(value);
  const paywalled = objects.some(
    (value) => value.isAccessibleForFree === false || value.isAccessibleForFree === 'false'
  );
  const articleData = objects.find((value) =>
    ['Article', 'NewsArticle', 'BlogPosting'].includes(String(value['@type']))
  );
  if (articleData) {
    if (!contributions.some((value) => value.field === 'creator')) {
      const author = Array.isArray(articleData.author) ? articleData.author[0] : articleData.author;
      if (typeof author === 'string') add('creator', author);
      else if (author && typeof author === 'object' && 'name' in author)
        add('creator', String(author.name));
    }
    if (
      !contributions.some((value) => value.field === 'publishedAt') &&
      typeof articleData.datePublished === 'string' &&
      Number.isFinite(Date.parse(articleData.datePublished))
    )
      add('publishedAt', new Date(articleData.datePublished).toISOString());
  }
  const linkImage = resolve(
    [...document.querySelectorAll('link[rel][href]')]
      .find((link) => relTokens(link).includes('image_src'))
      ?.getAttribute('href') ?? undefined
  );
  const structuredImage = [articleData, ...structured.flatMap(topLevelObjects)]
    .map((value) => resolve(imageReference(value?.image)))
    .find(Boolean);
  // Readability drops classes, so in-article cover candidates are chosen and marked first.
  if (!socialImage && !structuredImage && !linkImage)
    for (const image of document.querySelectorAll('img')) {
      const cover = resolve(articleImage(image));
      if (cover) image.setAttribute(COVER_ATTRIBUTE, cover);
    }
  // Capture links before Readability mutates the document.
  const originalLinks = [...document.querySelectorAll('a[href]')]
    .map((node) => ({
      url: resolve(node.getAttribute('href') ?? undefined),
      text: node.textContent?.trim().slice(0, 500),
    }))
    .filter((link) => link.url)
    .slice(0, 200);

  const feedUrls = [...document.querySelectorAll('link[rel="alternate"]')]
    .filter((link) => /rss|atom|feed\+json/i.test(link.getAttribute('type') ?? ''))
    .map((link) => resolve(link.getAttribute('href') ?? undefined))
    .filter((value): value is string => !!value);
  const publisher =
    articleData?.publisher && typeof articleData.publisher === 'object'
      ? (articleData.publisher as Record<string, unknown>)
      : null;
  const publicationUrl = resolve(typeof publisher?.url === 'string' ? publisher.url : undefined);
  if (publicationUrl && new URL(publicationUrl).hostname === new URL(response.url).hostname)
    add('source', {
      name:
        typeof publisher?.name === 'string'
          ? publisher.name
          : (meta('og:site_name') ?? new URL(response.url).hostname),
      url: publicationUrl,
      kind: 'publication',
    });
  else if (new URL(response.url).hostname.endsWith('.substack.com'))
    add('source', {
      name: meta('og:site_name') ?? new URL(response.url).hostname,
      url: new URL('/', response.url).toString(),
      kind: 'publication',
    });
  const author = Array.isArray(articleData?.author) ? articleData.author[0] : articleData?.author;
  const creatorImage = [
    () => imageReference((author as Record<string, unknown> | null | undefined)?.image),
    () => imageReference(publisher?.logo),
    () => siteIcon(document, ['apple-touch-icon', 'apple-touch-icon-precomposed'], false),
    () => siteIcon(document, ['icon'], true),
    () => '/favicon.ico',
  ]
    .map((candidate) => {
      const value = candidate();
      try {
        return value ? creatorImageReference(new URL(value, response.url).toString()) : undefined;
      } catch {
        return undefined;
      }
    })
    .find(Boolean);
  add('creatorImageUrl', creatorImage);
  // HTML is never returned as trusted executable markup. Article rendering clients
  // should use plain text; source HTML is omitted until a sanitizer is installed.
  const article = new Readability(document as unknown as Document, { charThreshold: 100 }).parse();
  const text = article?.textContent?.trim();
  if (text && text.length > 80) {
    add('article', { text, coverage: paywalled ? 'partial' : 'unknown' });
    if (article?.byline && !contributions.some((c) => c.field === 'creator'))
      add('creator', article.byline);
  }
  if (!socialImage)
    add(
      'thumbnail',
      structuredImage ??
        linkImage ??
        (article?.content
          ? (parseHTML(`<html><body>${article.content}</body></html>`)
              .document.querySelector(`img[${COVER_ATTRIBUTE}]`)
              ?.getAttribute(COVER_ATTRIBUTE) ?? undefined)
          : undefined)
    );
  if (originalLinks.length) add('links', originalLinks);
  return {
    resolvedUrl: response.url,
    contributions,
    components: [
      {
        component: 'metadata',
        status: contributions.some((c) => c.field === 'title') ? 'available' : 'unavailable',
        reasonCode: contributions.some((c) => c.field === 'title')
          ? undefined
          : 'metadata_not_found',
      },
      {
        component: 'article',
        status: text && text.length > 80 ? 'available' : 'unavailable',
        reasonCode:
          text && text.length > 80
            ? paywalled
              ? 'source_preview_only'
              : undefined
            : paywalled
              ? 'source_access_restricted'
              : 'readable_text_not_available',
      },
    ],
    feedUrls,
  };
}

const COVER_ATTRIBUTE = 'data-zine-cover';
const NOT_A_COVER = /pixel|track|beacon|spacer|1x1|avatar|gravatar|icon|logo|emoji|badge|sprite/i;

interface Attributes {
  getAttribute(name: string): string | null;
}
function relTokens(node: Attributes) {
  return (node.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}
/** Schema.org images arrive as a URL, an ImageObject, or an array of either. */
function imageReference(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = imageReference(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const image = value as Record<string, unknown>;
    return imageReference(image.url) ?? imageReference(image.contentUrl);
  }
  return undefined;
}
/** The objects a JSON-LD script states directly, including the members of its `@graph`. */
function topLevelObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(topLevelObjects);
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  return [object, ...(Array.isArray(object['@graph']) ? topLevelObjects(object['@graph']) : [])];
}
function largestSrcsetCandidate(srcset: string | null): string | undefined {
  let best: { url: string; size: number } | undefined;
  // Candidates are separated by a comma plus whitespace; CDN URLs may contain bare commas.
  for (const candidate of (srcset ?? '').split(/,\s+/)) {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    if (!url) continue;
    const size = parseFloat(descriptor ?? '1') || 1;
    if (!best || size > best.size) best = { url, size };
  }
  return best?.url;
}
/** An in-article image worth using as a cover: not tiny, not inline data, not site chrome. */
function articleImage(image: Attributes): string | undefined {
  for (const side of ['width', 'height']) {
    const size = image.getAttribute(side);
    if (size && /^\d+(\.\d+)?(px)?$/i.test(size.trim()) && parseFloat(size) < 200) return undefined;
  }
  const src =
    largestSrcsetCandidate(image.getAttribute('srcset') ?? image.getAttribute('data-srcset')) ??
    image.getAttribute('src') ??
    image.getAttribute('data-src') ??
    undefined;
  if (!src || /^data:/i.test(src) || /\.svg(?:[?#]|$)/i.test(src)) return undefined;
  if (
    NOT_A_COVER.test(src) ||
    NOT_A_COVER.test(image.getAttribute('class') ?? '') ||
    NOT_A_COVER.test(image.getAttribute('alt') ?? '')
  )
    return undefined;
  return src;
}
/** The largest declared icon, optionally preferring PNG/SVG over legacy ICO files. */
function siteIcon(
  document: { querySelectorAll(selector: string): Iterable<Attributes> },
  rels: string[],
  preferModernFormats: boolean
): string | undefined {
  let best: { href: string; score: number } | undefined;
  for (const link of document.querySelectorAll('link[rel][href]')) {
    const href = link.getAttribute('href');
    if (!href || !relTokens(link).some((token) => rels.includes(token))) continue;
    const sizes = (link.getAttribute('sizes') ?? '').toLowerCase();
    const area = Math.max(
      0,
      ...[...sizes.matchAll(/(\d+)x(\d+)/g)].map((size) => Number(size[1]) * Number(size[2]))
    );
    const modern =
      /png|svg/i.test(link.getAttribute('type') ?? '') || /\.(?:png|svg)(?:[?#]|$)/i.test(href);
    const score = (preferModernFormats && modern ? 1e12 : 0) + (sizes === 'any' ? 1e11 : area);
    if (!best || score > best.score) best = { href, score };
  }
  return best?.href;
}
