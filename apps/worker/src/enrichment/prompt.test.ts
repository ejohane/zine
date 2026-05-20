import { describe, expect, it } from 'vitest';

import { buildArticleExcerpt, buildEnrichmentMessages, buildPromptInput } from './prompt';
import type { EnrichmentPromptInput } from './types';

function createPromptInput(articleContent: string | null): EnrichmentPromptInput {
  return {
    item: {
      id: 'item-1',
      title: 'Long article',
      canonicalUrl: 'https://example.com/long',
      contentType: 'ARTICLE',
      provider: 'WEB',
      publisher: 'Example',
      summary: null,
      rawMetadata: null,
      articleContentKey: 'article-1',
    },
    creator: null,
    articleContent,
  };
}

describe('enrichment prompt helpers', () => {
  it('keeps full cleaned article content in the enrichment prompt', () => {
    const longTail = 'tail-marker';
    const articleContent = `<article><p>${'a'.repeat(5200)}</p><p>${longTail}</p></article>`;
    const input = buildPromptInput({
      item: createPromptInput(null).item,
      creator: null,
      articleContent,
    });

    const messages = buildEnrichmentMessages(input);
    const userPayload = JSON.parse(String(messages[1].content)) as {
      item: { articleContent: string };
    };

    expect(input.articleContent).toContain(longTail);
    expect(userPayload.item.articleContent).toContain(longTail);
    expect(userPayload.item.articleContent).not.toContain('<article>');
  });

  it('still caps article text used by embedding input', () => {
    const articleContent = `${'a'.repeat(5200)}tail-marker`;

    expect(buildArticleExcerpt(articleContent)).not.toContain('tail-marker');
  });

  it('asks the model to preserve show host and owner relationships', () => {
    const messages = buildEnrichmentMessages(createPromptInput('Hosted by Casey Newton.'));
    const userPayload = JSON.parse(String(messages[1].content)) as {
      constraints: string[];
    };

    expect(userPayload.constraints.join(' ')).toContain('HOST');
    expect(userPayload.constraints.join(' ')).toContain('co-hosts');
    expect(userPayload.constraints.join(' ')).toContain('owners');
    expect(userPayload.constraints.join(' ')).toContain('evidenceText');
  });
});
