import { describe, expect, it } from 'vitest';

import { normalizeArticleBodyHtml } from './normalization';
import { assessArticleBodyQuality } from './quality';

function paragraphs(words: number): string {
  const sentence = 'Evidence and context make this article useful to a careful reader. ';
  const body = sentence.repeat(Math.ceil(words / 11));
  return `<p>${body}</p><p>${body}</p>`;
}

describe('assessArticleBodyQuality', () => {
  it('accepts a substantial structured body', () => {
    const body = normalizeArticleBodyHtml(paragraphs(160), 'https://example.com/story');

    expect(assessArticleBodyQuality(body)).toEqual({
      disposition: 'AVAILABLE',
      score: 1,
      warnings: [],
    });
  });

  it('degrades a short but still readable body', () => {
    const body = normalizeArticleBodyHtml(
      `<p>${'A useful sentence with enough context to read. '.repeat(8)}</p>`,
      'https://example.com/story'
    );

    expect(assessArticleBodyQuality(body)).toMatchObject({
      disposition: 'DEGRADED',
      warnings: ['BODY_TOO_SHORT'],
    });
  });

  it('rejects snippets that are very short and truncated', () => {
    const body = normalizeArticleBodyHtml(
      '<p>This is only a teaser for the original article. Read more</p>',
      'https://example.com/story'
    );

    expect(assessArticleBodyQuality(body)).toMatchObject({
      disposition: 'UNAVAILABLE',
      score: 0.05,
      warnings: ['BODY_VERY_SHORT', 'LIKELY_TRUNCATED'],
    });
  });

  it('flags unrelated extracted titles', () => {
    const body = normalizeArticleBodyHtml(paragraphs(160), 'https://example.com/story');

    expect(
      assessArticleBodyQuality(body, {
        expectedTitle: 'Designing dependable article extraction',
        extractedTitle: 'Welcome to the account login portal',
      })
    ).toMatchObject({ warnings: ['TITLE_MISMATCH'], score: 0.75 });
  });

  it('degrades a substantial body that runs into a related-content teaser', () => {
    const body = normalizeArticleBodyHtml(
      `${paragraphs(160)}<p>${'A related article teaser follows the main body. '.repeat(40)} Continue reading...</p>`,
      'https://example.com/story'
    );

    expect(assessArticleBodyQuality(body)).toMatchObject({
      disposition: 'DEGRADED',
      score: 0.65,
      warnings: ['TRAILING_RELATED_CONTENT'],
    });
  });
});
