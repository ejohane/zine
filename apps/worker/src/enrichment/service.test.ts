import { describe, expect, it } from 'vitest';

import { computeItemContentHash } from './service';

describe('computeItemContentHash', () => {
  it('is stable for equivalent inputs', () => {
    const input = {
      title: 'Title',
      canonicalUrl: 'https://example.com/a',
      contentType: 'ARTICLE',
      provider: 'WEB',
      publisher: 'Example',
      summary: 'Summary',
      creatorName: 'Author',
      articleContentKey: 'articles/item.html',
    };

    expect(computeItemContentHash(input)).toBe(computeItemContentHash({ ...input }));
  });

  it('changes when meaningful enrichment inputs change', () => {
    const base = {
      title: 'Title',
      canonicalUrl: 'https://example.com/a',
      contentType: 'ARTICLE',
      provider: 'WEB',
      publisher: 'Example',
      summary: 'Summary',
      creatorName: 'Author',
      articleContentKey: 'articles/item.html',
    };

    expect(computeItemContentHash(base)).not.toBe(
      computeItemContentHash({ ...base, summary: 'Different summary' })
    );
  });
});
