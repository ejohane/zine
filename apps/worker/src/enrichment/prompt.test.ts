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
      outputContract: {
        entities: Array<{
          relationship: string;
          evidenceText: string;
        }>;
      };
    };

    expect(userPayload.constraints.join(' ')).toContain('HOST');
    expect(userPayload.constraints.join(' ')).toContain('co-hosts');
    expect(userPayload.constraints.join(' ')).toContain('owners');
    expect(userPayload.constraints.join(' ')).toContain('evidenceText');
    expect(userPayload.outputContract.entities[0]?.relationship).toContain('PRIMARY_SUBJECT');
    expect(userPayload.outputContract.entities[0]?.evidenceText).toContain('null');
  });

  it('discourages first-name-only person entities', () => {
    const messages = buildEnrichmentMessages(createPromptInput('Ben joins the show.'));
    const userPayload = JSON.parse(String(messages[1].content)) as {
      constraints: string[];
      outputContract: {
        entities: Array<{
          name: string;
        }>;
      };
    };
    const constraints = userPayload.constraints.join(' ');

    expect(constraints).toContain('full real names');
    expect(constraints).toContain('first-name-only');
    expect(userPayload.outputContract.entities[0]?.name).toContain('avoid first-name-only');
  });

  it('includes the full top-level output contract in the prompt', () => {
    const messages = buildEnrichmentMessages(createPromptInput('A short item.'));
    const userPayload = JSON.parse(String(messages[1].content)) as {
      constraints: string[];
      outputContract: Record<string, unknown>;
    };

    expect(userPayload.constraints.join(' ')).toContain('exactly these top-level keys');
    expect(Object.keys(userPayload.outputContract)).toEqual([
      'summary',
      'classification',
      'topics',
      'entities',
      'suggestedTags',
      'userContext',
      'confidence',
    ]);
  });
});
