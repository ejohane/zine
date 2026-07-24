import { describe, expect, it } from 'vitest';

import { ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES, ArticleBodyQueueMessageSchema } from './schema';

const baseMessage = {
  itemId: 'item_1',
  extractorVersion: 1,
  trigger: 'ingestion' as const,
  enqueuedAt: 1_700_000_000_000,
};

describe('article-body queue schema', () => {
  it('accepts a bounded source-first RSS candidate', () => {
    const parsed = ArticleBodyQueueMessageSchema.safeParse({
      ...baseMessage,
      embeddedCandidates: [
        {
          html: '<article><p>Complete story body</p></article>',
          sourceKind: 'RSS_FULL',
          sourceUrl: 'https://example.com/feed.xml',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects candidate payloads that could exceed the queue message budget', () => {
    const parsed = ArticleBodyQueueMessageSchema.safeParse({
      ...baseMessage,
      embeddedCandidates: [
        {
          html: 'x'.repeat(ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES),
          sourceKind: 'RSS_FULL',
          sourceUrl: 'https://example.com/feed.xml',
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
