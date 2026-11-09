import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { publicUrl, strongRedirect, unrelatedRedirect } from '../identity';
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
  add('thumbnail', resolve(meta('og:image', 'twitter:image')));
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
  // HTML is never returned as trusted executable markup. Article rendering clients
  // should use plain text; source HTML is omitted until a sanitizer is installed.
  const article = new Readability(document as unknown as Document, { charThreshold: 100 }).parse();
  const text = article?.textContent?.trim();
  if (text && text.length > 80) {
    add('article', { text, coverage: paywalled ? 'partial' : 'unknown' });
    if (article?.byline && !contributions.some((c) => c.field === 'creator'))
      add('creator', article.byline);
  }
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
