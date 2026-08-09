import { describe, expect, it, vi } from 'vitest';

import {
  ArticleChunkAnalysisSchema,
  articleUnderstandingInternals,
  enrichArticleWithQwen,
  normalizeChunkAnalysis,
  prepareArticleChunks,
} from './article-understanding';

describe('article understanding', () => {
  it('caps verbose semantic arrays instead of rejecting the whole analysis', () => {
    const evidence = { description: 'Supported', evidenceBlockIds: ['article-body'] };
    const parsed = ArticleChunkAnalysisSchema.parse({
      summary: { text: 'Summary', evidenceBlockIds: ['article-body'] },
      topics: [],
      claims: [{ statement: 'Supported claim', evidenceBlockIds: ['article-body'] }],
      questionsAnswered: Array.from({ length: 9 }, (_, index) => ({
        question: `Question ${index}`,
        answer: 'Answer',
        evidenceBlockIds: ['article-body'],
      })),
      concepts: [
        {
          name: 'Specific concept',
          description: 'Supported concept',
          evidenceBlockIds: ['article-body'],
        },
      ],
      entities: [],
      perspective: null,
      audience: null,
      prerequisites: Array.from({ length: 9 }, () => evidence),
      actionableTakeaways: Array.from({ length: 9 }, () => evidence),
    });

    expect(parsed.questionsAnswered).toHaveLength(8);
    expect(parsed.prerequisites).toHaveLength(8);
    expect(parsed.actionableTakeaways).toHaveLength(8);
  });

  it('normalizes omitted optional semantic fields', () => {
    const parsed = ArticleChunkAnalysisSchema.parse({
      summary: { text: 'Summary', evidenceBlockIds: ['article-body'] },
      claims: [{ statement: 'Supported claim', evidenceBlockIds: ['article-body'] }],
      concepts: [
        {
          name: 'Specific concept',
          description: 'Supported concept',
          evidenceBlockIds: ['article-body'],
        },
      ],
      actionableTakeaways: [
        { description: 'Supported takeaway', evidenceBlockIds: ['article-body'] },
      ],
    });

    expect(parsed.topics).toEqual([]);
    expect(parsed.perspective).toBeNull();
    expect(parsed.audience).toBeNull();
    expect(parsed.actionableTakeaways).toHaveLength(1);
  });

  it('rejects summary-only analysis', () => {
    expect(() =>
      ArticleChunkAnalysisSchema.parse({
        summary: { text: 'Summary', evidenceBlockIds: ['article-body'] },
      })
    ).toThrow(/supported claim/);
  });

  it('rejects semantic signals that cite invented block IDs', () => {
    const chunk = {
      ordinal: 0,
      blockIds: ['paragraph-001'],
      characterCount: 100,
      text: '[block:paragraph-001 kind:paragraph]\nSource text',
    };
    const schema = articleUnderstandingInternals.schemaForChunk(chunk);

    expect(() =>
      schema.parse({
        summary: { text: 'Summary', evidenceBlockIds: ['paragraph-001'] },
        claims: [{ statement: 'Claim', evidenceBlockIds: ['paragraph-1'] }],
        concepts: [
          {
            name: 'Concept',
            description: 'Description',
            evidenceBlockIds: ['paragraph-1'],
          },
        ],
        actionableTakeaways: [{ description: 'Takeaway', evidenceBlockIds: ['paragraph-1'] }],
      })
    ).toThrow(/exact supplied block ID/);
  });

  it('covers every source block in order without head-only truncation', () => {
    const chunks = prepareArticleChunks(
      [
        { id: 'intro', kind: 'paragraph', text: 'a'.repeat(40) },
        { id: 'middle', kind: 'paragraph', text: 'b'.repeat(40) },
        { id: 'ending', kind: 'paragraph', text: 'tail-marker' },
      ],
      90
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flatMap((chunk) => chunk.blockIds)).toEqual(['intro', 'middle', 'ending']);
    expect(chunks.at(-1)?.text).toContain('tail-marker');
  });

  it('splits an oversized block without dropping its ending', () => {
    const chunks = prepareArticleChunks(
      [{ id: 'large', kind: 'paragraph', text: `${'word '.repeat(300)}ending-marker` }],
      600
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.blockIds.includes('large'))).toBe(true);
    expect(chunks.at(-1)?.text).toContain('ending-marker');
  });

  it('drops unsupported evidence IDs instead of retaining model inventions', () => {
    const chunk = {
      ordinal: 0,
      blockIds: ['real-block'],
      characterCount: 20,
      text: '[block:real-block]\nText',
    };
    const normalized = normalizeChunkAnalysis(chunk, {
      summary: { text: 'Summary', evidenceBlockIds: ['invented'] },
      topics: [
        {
          name: 'real topic',
          description: 'Supported',
          evidenceBlockIds: ['block:real-block', 'invented'],
        },
      ],
      claims: [{ statement: 'Unsupported', evidenceBlockIds: ['invented'] }],
      questionsAnswered: [],
      concepts: [],
      entities: [],
      perspective: null,
      audience: null,
      prerequisites: [],
      actionableTakeaways: [],
    });

    expect(normalized.summary.evidenceBlockIds).toEqual(['real-block']);
    expect(normalized.topics[0]?.evidenceBlockIds).toEqual(['real-block']);
    expect(normalized.claims).toEqual([]);
  });

  it('analyzes every chunk before synthesizing the canonical enrichment', async () => {
    const run = vi.fn().mockImplementation(async (_model: string, request: unknown) => {
      const messages = (request as { messages: Array<{ content: string }> }).messages;
      const payload = JSON.parse(messages[1]?.content ?? '{}') as {
        task?: string;
        articleChunk?: string;
        item?: { articleContent?: string };
      };
      if (payload.task?.startsWith('Extract evidence-backed')) {
        const blockId = payload.articleChunk?.match(/\[block:([^ ]+)/)?.[1] ?? 'missing';
        return {
          response: {
            summary: { text: `Summary for ${blockId}`, evidenceBlockIds: [blockId] },
            topics: [],
            claims: [{ statement: `Claim for ${blockId}`, evidenceBlockIds: [blockId] }],
            questionsAnswered: [],
            concepts: [
              {
                name: `Concept for ${blockId}`,
                description: 'Supported concept',
                evidenceBlockIds: [blockId],
              },
            ],
            entities: [],
            perspective: null,
            audience: null,
            prerequisites: [],
            actionableTakeaways: [
              { description: `Takeaway for ${blockId}`, evidenceBlockIds: [blockId] },
            ],
          },
        };
      }

      expect(payload.item?.articleContent).toContain('Claim for ending');
      return {
        response: {
          summary: { short: 'Whole article', detail: 'The complete synthesized article.' },
          classification: {
            primaryCategory: 'technology',
            secondaryCategories: [],
            intent: 'analysis',
            difficulty: 'intermediate',
            evergreenScore: 0.8,
            timeSensitivity: 'evergreen',
          },
          topics: [],
          entities: [],
          suggestedTags: [],
          userContext: {
            inferredSaveIntent: 'Saved for reference.',
            reasonToRevisit: 'Contains a complete argument.',
          },
          confidence: { overall: 0.9, summary: 0.9, classification: 0.8, tags: 0.7 },
        },
      };
    });

    const result = await enrichArticleWithQwen(
      { AI: { run }, ARTICLE_UNDERSTANDING_MODEL: 'article-model' } as never,
      {
        promptInput: {
          item: {
            id: 'item-1',
            title: 'Complete article',
            canonicalUrl: 'https://example.com/article',
            contentType: 'ARTICLE',
            provider: 'WEB',
            publisher: 'Example',
            summary: null,
            rawMetadata: null,
            articleContentKey: null,
          },
          creator: null,
          articleContent: null,
        },
        source: {
          coverage: 'FULL_CONTENT',
          sourceKind: 'PUBLIC_WEB',
          contentHash: `sha256:${'a'.repeat(64)}`,
          wordCount: 2_000,
          qualityScore: 0.95,
          qualityWarnings: [],
          blocks: [
            { id: 'opening', kind: 'paragraph', text: 'a'.repeat(7_000) },
            { id: 'ending', kind: 'paragraph', text: `${'b'.repeat(6_980)} end-marker` },
          ],
        },
      }
    );

    expect(result.chunks).toHaveLength(2);
    expect(result.understanding.chunks.map((chunk) => chunk.blockIds)).toEqual([
      ['opening'],
      ['ending'],
    ]);
    expect(result.output.summary.short).toBe('Whole article');
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls.every(([model]) => model === 'article-model')).toBe(true);
  });
});
