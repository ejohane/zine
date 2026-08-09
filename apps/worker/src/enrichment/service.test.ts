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
      sourceContentHash: `sha256:${'a'.repeat(64)}`,
    };

    expect(computeItemContentHash(input)).toBe(computeItemContentHash({ ...input }));
    expect(computeItemContentHash(input)).toMatch(/^sha256:[a-f0-9]{64}$/);
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
      sourceContentHash: `sha256:${'a'.repeat(64)}`,
    };

    expect(computeItemContentHash(base)).not.toBe(
      computeItemContentHash({ ...base, summary: 'Different summary' })
    );
  });

  it('changes when the current source document changes at the same storage location', () => {
    const base = {
      title: 'Title',
      canonicalUrl: 'https://example.com/a',
      contentType: 'ARTICLE',
      provider: 'WEB',
      publisher: 'Example',
      summary: 'Summary',
      creatorName: 'Author',
      articleContentKey: 'articles/item.html',
      sourceContentHash: `sha256:${'a'.repeat(64)}`,
    };

    expect(computeItemContentHash(base)).not.toBe(
      computeItemContentHash({
        ...base,
        sourceContentHash: `sha256:${'b'.repeat(64)}`,
      })
    );
  });
});
