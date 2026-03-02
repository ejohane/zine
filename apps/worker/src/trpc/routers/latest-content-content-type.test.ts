import { describe, expect, it } from 'vitest';
import { ContentType } from '@zine/shared';

import { getLatestContentItemContentType } from './latest-content-content-type';

describe('getLatestContentItemContentType', () => {
  it('maps YouTube and Spotify providers to media content types', () => {
    expect(getLatestContentItemContentType('YOUTUBE')).toBe(ContentType.VIDEO);
    expect(getLatestContentItemContentType('SPOTIFY')).toBe(ContentType.PODCAST);
  });

  it('maps source-based providers to article content type', () => {
    expect(getLatestContentItemContentType('RSS')).toBe(ContentType.ARTICLE);
    expect(getLatestContentItemContentType('WEB')).toBe(ContentType.ARTICLE);
    expect(getLatestContentItemContentType('SUBSTACK')).toBe(ContentType.ARTICLE);
  });

  it('returns null for unsupported providers', () => {
    expect(getLatestContentItemContentType('GMAIL')).toBeNull();
  });
});
