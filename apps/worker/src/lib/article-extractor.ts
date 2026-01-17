import { parseHTML } from 'linkedom/worker';
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { logger } from './logger';

const extractorLogger = logger.child('article-extractor');

/**
 * Extracted article metadata
 */
export interface ArticleMetadata {
  /** Article title */
  title: string;
  /** Author/byline */
  author: string | null;
  /** Author profile image URL */
  authorImageUrl: string | null;
  /** Publication/site name */
  siteName: string | null;
  /** ISO8601 publication date */
  publishedAt: string | null;
  /** Cover/lead image URL */
  thumbnailUrl: string | null;
  /** Article summary/excerpt */
  excerpt: string | null;
  /** Estimated word count */
  wordCount: number | null;
  /** Reading time in minutes (based on 200 WPM) */
  readingTimeMinutes: number | null;
  /** Full article HTML for reader view */
  content: string | null;
  /** Whether this URL is a readable article */
  isArticle: boolean;
}

const USER_AGENT = 'ZineBot/1.0 (+https://zine.app/bot)';

/**
 * Extract article metadata from a URL
 */
export async function extractArticle(url: string): Promise<ArticleMetadata | null> {
  try {
    extractorLogger.debug('Fetching article', { url });

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      extractorLogger.warn('Article fetch failed', { url, status: response.status });
      return null;
    }

    const html = await response.text();
    return extractArticleFromHtml(html, url);
  } catch (error) {
    extractorLogger.error('Article extraction error', { url, error });
    return null;
  }
}

/**
 * Extract article metadata from HTML string
 */
export function extractArticleFromHtml(html: string, url: string): ArticleMetadata | null {
  try {
    const { document } = parseHTML(html);

    // Check if this looks like an article
    const isArticle = isProbablyReaderable(document);

    if (!isArticle) {
      return {
        title: '',
        author: null,
        authorImageUrl: resolveUrl(extractAuthorImage(document), url),
        siteName: extractSiteNameFromDomain(url),
        publishedAt: null,
        thumbnailUrl: resolveUrl(extractOgImage(document), url),
        excerpt: null,
        wordCount: null,
        readingTimeMinutes: null,
        content: null,
        isArticle: false,
      };
    }

    // Clone document before Readability modifies it
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone as Document);
    const article = reader.parse();

    if (!article) {
      return null;
    }

    // Calculate reading time (~200 words per minute)
    // Readability's length is textContent length; estimate ~5 chars per word
    const articleLength = article.length ?? 0;
    const estimatedWords = Math.round(articleLength / 5);
    const readingTimeMinutes = Math.ceil(estimatedWords / 200);

    return {
      title: article.title ?? '',
      author: article.byline ?? null,
      authorImageUrl: resolveUrl(extractAuthorImage(document), url),
      siteName: article.siteName ?? extractSiteNameFromDomain(url),
      publishedAt: article.publishedTime ?? null,
      thumbnailUrl: resolveUrl(extractOgImage(document), url),
      excerpt: article.excerpt ?? null,
      wordCount: estimatedWords,
      readingTimeMinutes,
      content: article.content ?? null,
      isArticle: true,
    };
  } catch (error) {
    extractorLogger.error('HTML parsing error', { url, error });
    return null;
  }
}

/**
 * Extract OG image from document
 */
function extractOgImage(document: Document): string | null {
  const ogImage = document.querySelector('meta[property="og:image"]');
  return ogImage?.getAttribute('content') || null;
}

/**
 * Extract author image from document meta tags
 * Checks article:author:image and author:image meta tags
 */
function extractAuthorImage(document: Document): string | null {
  // Priority order matching OpenGraph parser
  const selectors = [
    'meta[property="article:author:image"]',
    'meta[property="author:image"]',
    'meta[name="author:image"]',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const content = el?.getAttribute('content');
    if (content) return content;
  }

  return null;
}

/**
 * Resolve a potentially relative URL to an absolute URL
 */
function resolveUrl(urlString: string | null, baseUrl: string): string | null {
  if (!urlString) return null;

  try {
    // If it's already absolute, return as-is
    if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
      return urlString;
    }

    // Resolve relative URL against base
    const resolved = new URL(urlString, baseUrl);
    return resolved.href;
  } catch {
    extractorLogger.warn('Failed to resolve URL', { urlString, baseUrl });
    return null;
  }
}

/**
 * Extract site name from domain
 */
function extractSiteNameFromDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const domain = hostname.replace(/^www\./, '');
    const parts = domain.split('.');
    if (parts.length >= 2) {
      const name = parts[parts.length - 2];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return domain;
  } catch {
    return 'Unknown';
  }
}
