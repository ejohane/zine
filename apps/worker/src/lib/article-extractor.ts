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
        siteName: extractSiteNameFromDomain(url),
        publishedAt: null,
        thumbnailUrl: extractOgImage(document),
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
      siteName: article.siteName ?? extractSiteNameFromDomain(url),
      publishedAt: article.publishedTime ?? null,
      thumbnailUrl: extractOgImage(document),
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
