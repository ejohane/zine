/**
 * Article Storage Module for R2 Operations
 *
 * Provides functions to store, retrieve, and delete article content from R2.
 * Article content is stored as HTML files with metadata for tracking.
 *
 * @example
 * ```typescript
 * import { storeArticleContent, getArticleContent } from './lib/article-storage';
 *
 * // Store article content
 * const key = await storeArticleContent(env.ARTICLE_BUCKET, 'item-123', '<html>...</html>');
 *
 * // Retrieve article content
 * const content = await getArticleContent(env.ARTICLE_BUCKET, 'item-123');
 *
 * // Check if content exists
 * const exists = await hasArticleContent(env.ARTICLE_BUCKET, 'item-123');
 *
 * // Delete article content
 * await deleteArticleContent(env.ARTICLE_BUCKET, 'item-123');
 * ```
 */

import { logger } from './logger';

const storageLogger = logger.child('article-storage');

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate the R2 key for an article.
 */
function getArticleKey(itemId: string): string {
  return `articles/${itemId}.html`;
}

// ============================================================================
// Storage Operations
// ============================================================================

/**
 * Store article content in R2.
 *
 * @param bucket - R2 bucket binding
 * @param itemId - Item ID to use as key
 * @param content - Article HTML content
 * @returns R2 object key
 *
 * @example
 * ```typescript
 * const key = await storeArticleContent(env.ARTICLE_BUCKET, 'item-123', '<html>...</html>');
 * console.log(key); // 'articles/item-123.html'
 * ```
 */
export async function storeArticleContent(
  bucket: R2Bucket,
  itemId: string,
  content: string
): Promise<string> {
  const key = getArticleKey(itemId);

  await bucket.put(key, content, {
    httpMetadata: {
      contentType: 'text/html; charset=utf-8',
    },
    customMetadata: {
      itemId,
      storedAt: new Date().toISOString(),
    },
  });

  storageLogger.info('Article content stored', {
    itemId,
    key,
    contentLength: content.length,
  });

  return key;
}

/**
 * Retrieve article content from R2.
 *
 * @param bucket - R2 bucket binding
 * @param itemId - Item ID to retrieve
 * @returns Article HTML content, or null if not found
 *
 * @example
 * ```typescript
 * const content = await getArticleContent(env.ARTICLE_BUCKET, 'item-123');
 * if (content) {
 *   console.log('Article found:', content.length, 'chars');
 * }
 * ```
 */
export async function getArticleContent(bucket: R2Bucket, itemId: string): Promise<string | null> {
  const key = getArticleKey(itemId);
  const object = await bucket.get(key);

  if (!object) {
    storageLogger.debug('Article content not found', { itemId, key });
    return null;
  }

  return object.text();
}

/**
 * Delete article content from R2.
 *
 * @param bucket - R2 bucket binding
 * @param itemId - Item ID to delete
 *
 * @example
 * ```typescript
 * await deleteArticleContent(env.ARTICLE_BUCKET, 'item-123');
 * ```
 */
export async function deleteArticleContent(bucket: R2Bucket, itemId: string): Promise<void> {
  const key = getArticleKey(itemId);
  await bucket.delete(key);
  storageLogger.info('Article content deleted', { itemId, key });
}

/**
 * Check if article content exists in R2.
 *
 * Uses HEAD request which is more efficient than GET for existence checks.
 *
 * @param bucket - R2 bucket binding
 * @param itemId - Item ID to check
 * @returns true if the article exists, false otherwise
 *
 * @example
 * ```typescript
 * const exists = await hasArticleContent(env.ARTICLE_BUCKET, 'item-123');
 * if (!exists) {
 *   // Fetch and store the article
 * }
 * ```
 */
export async function hasArticleContent(bucket: R2Bucket, itemId: string): Promise<boolean> {
  const key = getArticleKey(itemId);
  const head = await bucket.head(key);
  return head !== null;
}
