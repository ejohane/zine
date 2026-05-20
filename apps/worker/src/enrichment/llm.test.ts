import { describe, expect, it, vi } from 'vitest';

import { EnrichmentModelValidationError, enrichWithQwen } from './llm';
import type { EnrichmentPromptInput } from './types';

function createPromptInput(): EnrichmentPromptInput {
  return {
    item: {
      id: 'item-1',
      title: 'Testing Cloudflare Workers AI',
      canonicalUrl: 'https://example.com/post',
      contentType: 'ARTICLE',
      provider: 'WEB',
      publisher: 'Example',
      summary: 'A short article about Workers AI.',
      rawMetadata: null,
      articleContentKey: null,
    },
    creator: {
      name: 'Example Author',
      description: null,
      handle: null,
    },
    articleContent: 'Workers AI can run models near a Cloudflare Worker.',
  };
}

function createValidModelOutput() {
  return {
    summary: {
      short: 'A guide to using Workers AI.',
      detail: 'The article explains how Workers AI can enrich application data.',
    },
    classification: {
      primaryCategory: 'software-engineering',
      secondaryCategories: ['ai', 'cloudflare'],
      intent: 'tutorial',
      difficulty: 'intermediate',
      evergreenScore: 0.8,
      timeSensitivity: 'evergreen',
    },
    topics: [{ name: 'workers ai', confidence: 0.9 }],
    entities: [
      {
        name: 'Cloudflare Workers',
        type: 'technology',
        relationship: 'PRIMARY_SUBJECT',
        confidence: 0.9,
        evidenceText: 'Workers AI can run models near a Cloudflare Worker.',
      },
    ],
    suggestedTags: [{ name: 'cloudflare', kind: 'topic', confidence: 0.9 }],
    userContext: {
      inferredSaveIntent: 'Learn Workers AI implementation details.',
      reasonToRevisit: 'Useful when building enrichment pipelines.',
    },
    confidence: {
      overall: 0.86,
      summary: 0.9,
      classification: 0.85,
      tags: 0.8,
    },
  };
}

describe('enrichWithQwen', () => {
  it('returns validated structured output from Workers AI JSON text', async () => {
    const output = createValidModelOutput();
    const run = vi.fn().mockResolvedValue({ response: JSON.stringify(output) });

    const result = await enrichWithQwen({ AI: { run } } as never, createPromptInput());

    expect(result.summary.short).toBe(output.summary.short);
    expect(run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      expect.objectContaining({
        response_format: expect.objectContaining({ type: 'json_schema' }),
      })
    );
  });

  it('returns validated structured output from Workers AI JSON Mode object response', async () => {
    const output = createValidModelOutput();
    const run = vi.fn().mockResolvedValue({ response: output });

    const result = await enrichWithQwen({ AI: { run } } as never, createPromptInput());

    expect(result.summary.short).toBe(output.summary.short);
    expect(run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      expect.objectContaining({
        response_format: {
          type: 'json_schema',
          json_schema: expect.objectContaining({
            type: 'object',
            properties: expect.objectContaining({
              entities: expect.objectContaining({
                items: expect.objectContaining({
                  required: expect.arrayContaining(['relationship', 'evidenceText']),
                }),
              }),
              summary: expect.any(Object),
            }),
          }),
        },
      })
    );
  });

  it('does not use the OpenAI named schema wrapper for Workers AI JSON Mode', async () => {
    const output = createValidModelOutput();
    const run = vi.fn().mockResolvedValue({ response: output });

    await enrichWithQwen({ AI: { run } } as never, createPromptInput());

    expect(run.mock.calls[0][1].response_format.json_schema).not.toHaveProperty('name');
    expect(run.mock.calls[0][1].response_format.json_schema).not.toHaveProperty('schema');
  });

  it('retries once when model output is invalid and accepts repaired JSON', async () => {
    const output = createValidModelOutput();
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: '{bad-json' })
      .mockResolvedValueOnce({ response: JSON.stringify(output) });

    const result = await enrichWithQwen({ AI: { run } } as never, createPromptInput());

    expect(result.classification.primaryCategory).toBe('software-engineering');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('accepts OpenAI-style choices response content', async () => {
    const output = createValidModelOutput();
    const run = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(output) } }],
    });

    const result = await enrichWithQwen({ AI: { run } } as never, createPromptInput());

    expect(result.summary.detail).toBe(output.summary.detail);
  });

  it('accepts fenced JSON text', async () => {
    const output = createValidModelOutput();
    const run = vi.fn().mockResolvedValue({
      response: `\`\`\`json\n${JSON.stringify(output)}\n\`\`\``,
    });

    const result = await enrichWithQwen({ AI: { run } } as never, createPromptInput());

    expect(result.confidence.overall).toBe(output.confidence.overall);
  });

  it('throws validation error when both model attempts are invalid', async () => {
    const run = vi.fn().mockResolvedValue({ response: '{bad-json' });

    await expect(enrichWithQwen({ AI: { run } } as never, createPromptInput())).rejects.toThrow(
      EnrichmentModelValidationError
    );
    expect(run).toHaveBeenCalledTimes(2);
  });
});
