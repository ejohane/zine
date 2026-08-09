import { describe, expect, it } from 'vitest';

import {
  parseArticleUnderstandingMode,
  shouldUseArticleUnderstanding,
} from './article-understanding-rollout';

describe('article understanding rollout', () => {
  it('fails closed for missing and invalid modes', () => {
    expect(parseArticleUnderstandingMode(undefined)).toBe('off');
    expect(parseArticleUnderstandingMode('unexpected')).toBe('off');
    expect(shouldUseArticleUnderstanding(undefined, 'backfill')).toBe(false);
  });

  it('runs only explicit backfills in backfill-only mode', () => {
    expect(shouldUseArticleUnderstanding('backfill_only', 'backfill')).toBe(true);
    expect(shouldUseArticleUnderstanding('backfill_only', 'article_body_ready')).toBe(false);
    expect(shouldUseArticleUnderstanding('backfill_only', 'manual_save')).toBe(false);
    expect(shouldUseArticleUnderstanding('backfill_only', 'inbox_bookmark')).toBe(false);
  });

  it('runs every enrichment trigger in all mode', () => {
    expect(shouldUseArticleUnderstanding('all', 'backfill')).toBe(true);
    expect(shouldUseArticleUnderstanding('all', 'article_body_ready')).toBe(true);
    expect(shouldUseArticleUnderstanding('all', 'manual_save')).toBe(true);
    expect(shouldUseArticleUnderstanding('all', 'inbox_bookmark')).toBe(true);
  });
});
