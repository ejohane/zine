import { z } from 'zod';

import type { Bindings } from '../types';
import { EntityRelationshipSchema } from './schema';
import { enrichWithQwen, runStructuredJson } from './llm';
import type {
  ArticleUnderstanding,
  ArticleUnderstandingChunk,
  EnrichmentContentBlock,
  EnrichmentModelOutput,
  EnrichmentPromptInput,
  EnrichmentSourceEvidence,
} from './types';

const DEFAULT_CHUNK_CHARACTER_LIMIT = 12_000;
const MAX_TRAILING_CHUNK_CHARACTER_COUNT = 2_000;
const TRAILING_CHUNK_FRACTION = 0.2;
const TRAILING_MERGE_OVERFLOW_FRACTION = 0.1;
const ANALYSIS_CONCURRENCY = 3;

const EvidenceIdsSchema = z.array(z.string().min(1)).min(1).max(24);
const EvidenceSchema = z.object({ evidenceBlockIds: EvidenceIdsSchema });
const DescriptionEvidenceSchema = EvidenceSchema.extend({
  description: z.string().min(1).max(500),
});
const OptionalDescriptionEvidenceSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const description = typeof record.description === 'string' ? record.description.trim() : '';
  const evidenceBlockIds = Array.isArray(record.evidenceBlockIds)
    ? record.evidenceBlockIds.filter(
        (entry) => typeof entry === 'string' && entry.trim().length > 0
      )
    : [];
  return description.length > 0 && evidenceBlockIds.length > 0 ? value : null;
}, DescriptionEvidenceSchema.nullable().default(null));

type ArticleChunkAnalysis = Omit<
  ArticleUnderstandingChunk,
  'ordinal' | 'blockIds' | 'characterCount'
>;

export const ArticleChunkAnalysisSchema: z.ZodType<ArticleChunkAnalysis, z.ZodTypeDef, unknown> =
  z.object({
    summary: EvidenceSchema.extend({ text: z.string().min(1).max(1200) }),
    topics: z
      .array(
        EvidenceSchema.extend({
          name: z.string().min(1).max(100),
          description: z.string().min(1).max(400),
        })
      )
      .default([])
      .transform((values) => values.slice(0, 10)),
    claims: z
      .array(EvidenceSchema.extend({ statement: z.string().min(1).max(600) }))
      .default([])
      .transform((values) => values.slice(0, 10))
      .refine((values) => values.length > 0, {
        message: 'Substantive article chunks must contain at least one supported claim',
      }),
    questionsAnswered: z
      .array(
        EvidenceSchema.extend({
          question: z.string().min(1).max(400),
          answer: z.string().min(1).max(800),
        })
      )
      .default([])
      .transform((values) => values.slice(0, 8)),
    concepts: z
      .array(
        EvidenceSchema.extend({
          name: z.string().min(1).max(120),
          description: z.string().min(1).max(500),
        })
      )
      .default([])
      .transform((values) => values.slice(0, 10))
      .refine((values) => values.length > 0, {
        message: 'Substantive article chunks must contain at least one supported concept',
      }),
    entities: z
      .array(
        EvidenceSchema.extend({
          name: z.string().min(1).max(120),
          type: z.string().min(1).max(64),
          relationship: EntityRelationshipSchema,
        })
      )
      .default([])
      .transform((values) => values.slice(0, 15)),
    perspective: OptionalDescriptionEvidenceSchema,
    audience: OptionalDescriptionEvidenceSchema,
    prerequisites: z
      .array(DescriptionEvidenceSchema)
      .default([])
      .transform((values) => values.slice(0, 8)),
    actionableTakeaways: z
      .array(DescriptionEvidenceSchema)
      .default([])
      .transform((values) => values.slice(0, 8))
      .refine((values) => values.length > 0, {
        message: 'Substantive article chunks must contain at least one supported takeaway',
      }),
  });

export interface PreparedArticleChunk {
  ordinal: number;
  blockIds: string[];
  characterCount: number;
  text: string;
}

function compactTrailingChunk(
  chunks: PreparedArticleChunk[],
  characterLimit: number
): PreparedArticleChunk[] {
  if (chunks.length < 2) return chunks;

  const previous = chunks.at(-2);
  const trailing = chunks.at(-1);
  if (!previous || !trailing) return chunks;

  const trailingThreshold = Math.max(
    1,
    Math.min(
      MAX_TRAILING_CHUNK_CHARACTER_COUNT,
      Math.floor(characterLimit * TRAILING_CHUNK_FRACTION)
    )
  );
  const mergedText = `${previous.text}\n\n${trailing.text}`;
  const mergedLimit = Math.ceil(characterLimit * (1 + TRAILING_MERGE_OVERFLOW_FRACTION));
  if (trailing.characterCount >= trailingThreshold || mergedText.length > mergedLimit) {
    return chunks;
  }

  chunks.splice(-2, 2, {
    ordinal: previous.ordinal,
    blockIds: [...new Set([...previous.blockIds, ...trailing.blockIds])],
    characterCount: mergedText.length,
    text: mergedText,
  });
  return chunks;
}

function formatBlock(block: EnrichmentContentBlock): string {
  return `[block:${block.id} kind:${block.kind}]\n${block.text.trim()}`;
}

function splitOversizedBlock(
  block: EnrichmentContentBlock,
  characterLimit: number
): EnrichmentContentBlock[] {
  if (formatBlock(block).length <= characterLimit) return [block];

  const parts: EnrichmentContentBlock[] = [];
  let remaining = block.text.trim();
  let part = 1;
  const textLimit = Math.max(500, characterLimit - 100);
  while (remaining.length > 0) {
    let splitAt = Math.min(textLimit, remaining.length);
    if (splitAt < remaining.length) {
      const boundary = remaining.lastIndexOf(' ', splitAt);
      if (boundary > textLimit * 0.7) splitAt = boundary;
    }
    parts.push({
      id: block.id,
      kind: `${block.kind}:part-${part}`,
      text: remaining.slice(0, splitAt).trim(),
    });
    remaining = remaining.slice(splitAt).trim();
    part++;
  }
  return parts;
}

export function prepareArticleChunks(
  blocks: EnrichmentContentBlock[],
  characterLimit = DEFAULT_CHUNK_CHARACTER_LIMIT
): PreparedArticleChunk[] {
  const chunks: PreparedArticleChunk[] = [];
  let current: EnrichmentContentBlock[] = [];
  let currentLength = 0;

  const flush = () => {
    if (current.length === 0) return;
    const text = current.map(formatBlock).join('\n\n');
    chunks.push({
      ordinal: chunks.length,
      blockIds: [...new Set(current.map((block) => block.id))],
      characterCount: text.length,
      text,
    });
    current = [];
    currentLength = 0;
  };

  for (const sourceBlock of blocks) {
    for (const block of splitOversizedBlock(sourceBlock, characterLimit)) {
      const formattedLength = formatBlock(block).length + (current.length > 0 ? 2 : 0);
      if (current.length > 0 && currentLength + formattedLength > characterLimit) flush();
      current.push(block);
      currentLength += formattedLength;
    }
  }
  flush();
  return compactTrailingChunk(chunks, characterLimit);
}

function validEvidenceIds(ids: string[], allowed: Set<string>): string[] {
  return [
    ...new Set(
      ids.flatMap((value) => {
        const trimmed = value.trim();
        if (allowed.has(trimmed)) return [trimmed];

        const markerMatch = trimmed.match(/^\[?block:([^\]\s]+)\]?$/i);
        const markerId = markerMatch?.[1];
        return markerId && allowed.has(markerId) ? [markerId] : [];
      })
    ),
  ];
}

function normalizeEvidenceArray<T extends { evidenceBlockIds: string[] }>(
  values: T[],
  allowed: Set<string>
): T[] {
  return values
    .map((value) => ({
      ...value,
      evidenceBlockIds: validEvidenceIds(value.evidenceBlockIds, allowed),
    }))
    .filter((value) => value.evidenceBlockIds.length > 0);
}

export function normalizeChunkAnalysis(
  chunk: PreparedArticleChunk,
  analysis: ArticleChunkAnalysis
): ArticleUnderstandingChunk {
  const allowed = new Set(chunk.blockIds);
  const normalizeOptional = <T extends { evidenceBlockIds: string[] }>(value: T | null) => {
    if (!value) return null;
    const evidenceBlockIds = validEvidenceIds(value.evidenceBlockIds, allowed);
    return evidenceBlockIds.length > 0 ? { ...value, evidenceBlockIds } : null;
  };
  const summaryEvidence = validEvidenceIds(analysis.summary.evidenceBlockIds, allowed);

  return {
    ordinal: chunk.ordinal,
    blockIds: chunk.blockIds,
    characterCount: chunk.characterCount,
    summary: {
      ...analysis.summary,
      evidenceBlockIds: summaryEvidence.length > 0 ? summaryEvidence : chunk.blockIds,
    },
    topics: normalizeEvidenceArray(analysis.topics, allowed),
    claims: normalizeEvidenceArray(analysis.claims, allowed),
    questionsAnswered: normalizeEvidenceArray(analysis.questionsAnswered, allowed),
    concepts: normalizeEvidenceArray(analysis.concepts, allowed),
    entities: normalizeEvidenceArray(analysis.entities, allowed),
    perspective: normalizeOptional(analysis.perspective),
    audience: normalizeOptional(analysis.audience),
    prerequisites: normalizeEvidenceArray(analysis.prerequisites, allowed),
    actionableTakeaways: normalizeEvidenceArray(analysis.actionableTakeaways, allowed),
  };
}

function schemaForChunk(chunk: PreparedArticleChunk) {
  return ArticleChunkAnalysisSchema.superRefine((analysis, context) => {
    const normalized = normalizeChunkAnalysis(chunk, analysis);
    const requiredSignals = [
      ['claims', normalized.claims],
      ['concepts', normalized.concepts],
      ['actionableTakeaways', normalized.actionableTakeaways],
    ] as const;

    for (const [field, values] of requiredSignals) {
      if (values.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must include at least one item citing an exact supplied block ID`,
        });
      }
    }
  });
}

function chunkMessages(chunk: PreparedArticleChunk) {
  return [
    {
      role: 'system',
      content:
        'Analyze article text for a personal collection and recommendation engine. Extract the distinctive arguments, mechanisms, tensions, caveats, and practical implications that distinguish this article from others on the same broad topic. Every semantic assertion must cite one or more supplied block IDs. Return only valid JSON.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Extract evidence-backed semantic notes from this portion of an article.',
        constraints: [
          'Use only the supplied text.',
          'Do not treat a passing mention as a central topic or claim.',
          'Every evidenceBlockIds value must contain only IDs present in the supplied text.',
          'Claims describe positions the article advances or reports, not assumptions invented by you.',
          'Concepts name the article-specific frameworks, mechanisms, or distinctions—not broad categories such as AI, technology, design, or productivity.',
          'Actionable takeaways state what a reader could do, test, notice, or decide because of the article. Do not invent advice unsupported by the text.',
          'For substantive article text, return at least 3 claims, 2 concepts, and 2 actionable takeaways. Empty semantic arrays are invalid.',
          'Include disagreements, limitations, open problems, or failed approaches when the text supplies them.',
          'Use null for perspective or audience when the text does not support them. Never return empty descriptions or empty evidenceBlockIds.',
          'Return concise notes suitable for deciding whether this article belongs in a narrowly themed collection.',
          'Return at most 10 topics, 10 claims, 8 questions answered, 10 concepts, 15 entities, 8 prerequisites, and 8 actionable takeaways.',
        ],
        articleChunk: chunk.text,
        outputContract: {
          summary: { text: 'string', evidenceBlockIds: ['block-id'] },
          topics: [{ name: 'string', description: 'string', evidenceBlockIds: ['block-id'] }],
          claims: [{ statement: 'string', evidenceBlockIds: ['block-id'] }],
          questionsAnswered: [
            { question: 'string', answer: 'string', evidenceBlockIds: ['block-id'] },
          ],
          concepts: [{ name: 'string', description: 'string', evidenceBlockIds: ['block-id'] }],
          entities: [
            {
              name: 'string',
              type: 'string',
              relationship:
                'HOST | CO_HOST | OWNER | CREATOR | AUTHOR | GUEST | INTERVIEWER | INTERVIEWEE | PRIMARY_SUBJECT | MENTIONED',
              evidenceBlockIds: ['block-id'],
            },
          ],
          perspective: { description: 'string', evidenceBlockIds: ['block-id'] },
          audience: { description: 'string', evidenceBlockIds: ['block-id'] },
          prerequisites: [{ description: 'string', evidenceBlockIds: ['block-id'] }],
          actionableTakeaways: [{ description: 'string', evidenceBlockIds: ['block-id'] }],
        },
      }),
    },
  ];
}

async function analyzeChunk(
  env: Bindings,
  chunk: PreparedArticleChunk
): Promise<ArticleUnderstandingChunk> {
  const analysis = await runStructuredJson<ArticleChunkAnalysis>(env, {
    messages: chunkMessages(chunk),
    schema: schemaForChunk(chunk),
    maxTokens: 4000,
    repairPrompt:
      'Retry with exactly the requested JSON fields and no prose outside the JSON object. Copy evidence block IDs exactly from the [block:...] markers; altered or invented IDs will be rejected. A summary alone is invalid: include at least 3 supported claims, 2 article-specific concepts, and 2 supported actionableTakeaways. Use null, never empty objects, for unsupported perspective or audience. Return at most 10 topics, 10 claims, 8 questionsAnswered, 10 concepts, 15 entities, 8 prerequisites, and 8 actionableTakeaways.',
    operation: `Article chunk ${chunk.ordinal} analysis`,
    model: env.ARTICLE_UNDERSTANDING_MODEL,
    repairAttempts: 2,
  });
  return normalizeChunkAnalysis(chunk, analysis);
}

function buildSemanticDocument(understanding: ArticleUnderstanding): string {
  return understanding.chunks
    .map((chunk) =>
      JSON.stringify({
        section: chunk.ordinal + 1,
        summary: chunk.summary,
        topics: chunk.topics,
        claims: chunk.claims,
        questionsAnswered: chunk.questionsAnswered,
        concepts: chunk.concepts,
        entities: chunk.entities,
        perspective: chunk.perspective,
        audience: chunk.audience,
        prerequisites: chunk.prerequisites,
        actionableTakeaways: chunk.actionableTakeaways,
      })
    )
    .join('\n');
}

export async function enrichArticleWithQwen(
  env: Bindings,
  input: {
    promptInput: EnrichmentPromptInput;
    source: EnrichmentSourceEvidence & {
      coverage: 'FULL_CONTENT' | 'PARTIAL_CONTENT';
      contentHash: string;
    };
  }
): Promise<{
  output: EnrichmentModelOutput;
  understanding: ArticleUnderstanding;
  chunks: PreparedArticleChunk[];
}> {
  const chunks = prepareArticleChunks(input.source.blocks);
  if (chunks.length === 0) throw new Error('Article source did not contain semantic blocks');

  const analyzed: ArticleUnderstandingChunk[] = [];
  for (let offset = 0; offset < chunks.length; offset += ANALYSIS_CONCURRENCY) {
    analyzed.push(
      ...(await Promise.all(
        chunks.slice(offset, offset + ANALYSIS_CONCURRENCY).map((chunk) => analyzeChunk(env, chunk))
      ))
    );
  }

  const understanding: ArticleUnderstanding = {
    schemaVersion: 1,
    sourceContentHash: input.source.contentHash,
    coverage: input.source.coverage,
    chunks: analyzed,
  };
  const output = await enrichWithQwen(
    env,
    {
      ...input.promptInput,
      articleContent: buildSemanticDocument(understanding),
    },
    env.ARTICLE_UNDERSTANDING_MODEL
  );

  return { output, understanding, chunks };
}

export const articleUnderstandingInternals = {
  buildSemanticDocument,
  chunkMessages,
  compactTrailingChunk,
  schemaForChunk,
  splitOversizedBlock,
};
