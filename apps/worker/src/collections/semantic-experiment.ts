import { z } from 'zod';

const INCOMPLETE_SEMANTIC_ENDING =
  /(?:[,;:\-\u2013\u2014]|\b(?:a|an|the|and|or|but|of|to|for|with|in|on|at|by|from|as|that|which|who|when|where|because|while|if))$/i;

const GENERIC_COLLECTION_TITLES = new Set([
  'ai',
  'articles',
  'career development',
  'engineering',
  'entrepreneurship',
  'media studies',
  'software',
  'software development',
  'technology',
]);

function completeText(label: string, minimum: number, maximum: number) {
  return z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !INCOMPLETE_SEMANTIC_ENDING.test(value), {
      message: `${label} must be a complete thought, not truncated prose`,
    });
}

const EvidenceBlockIdsSchema = z.array(z.string().trim().min(1)).min(1).max(24);
const UnderstandingEvidenceSchema = z.object({ evidenceBlockIds: EvidenceBlockIdsSchema });
const DescriptionEvidenceSchema = UnderstandingEvidenceSchema.extend({
  description: z.string().trim().min(1).max(1_200),
});
const OptionalDescriptionEvidenceSchema = DescriptionEvidenceSchema.nullable().default(null);
const UnderstandingChunkSchema = z.object({
  ordinal: z.number().int().min(0),
  blockIds: z.array(z.string().trim().min(1)).min(1),
  characterCount: z.number().int().min(1),
  summary: UnderstandingEvidenceSchema.extend({ text: z.string().trim().min(1).max(2_000) }),
  topics: z
    .array(
      DescriptionEvidenceSchema.extend({
        name: z.string().trim().min(1).max(160),
      })
    )
    .default([]),
  claims: z
    .array(UnderstandingEvidenceSchema.extend({ statement: z.string().trim().min(1).max(1_200) }))
    .default([]),
  questionsAnswered: z
    .array(
      UnderstandingEvidenceSchema.extend({
        question: z.string().trim().min(1).max(800),
        answer: z.string().trim().min(1).max(1_600),
      })
    )
    .default([]),
  concepts: z
    .array(
      DescriptionEvidenceSchema.extend({
        name: z.string().trim().min(1).max(160),
      })
    )
    .default([]),
  perspective: OptionalDescriptionEvidenceSchema,
  audience: OptionalDescriptionEvidenceSchema,
  actionableTakeaways: z.array(DescriptionEvidenceSchema).default([]),
});

const ArticleUnderstandingSchema = z.object({
  schemaVersion: z.literal(1),
  sourceContentHash: z.string().trim().min(1),
  coverage: z.enum(['FULL_CONTENT', 'PARTIAL_CONTENT']),
  chunks: z.array(UnderstandingChunkSchema).min(1),
});

export const SemanticSignalKindSchema = z.enum([
  'SUMMARY',
  'TOPIC',
  'CLAIM',
  'QUESTION_ANSWERED',
  'CONCEPT',
  'PERSPECTIVE',
  'AUDIENCE',
  'ACTIONABLE_TAKEAWAY',
]);

export const SemanticSignalSchema = z.object({
  id: z.string().min(1),
  kind: SemanticSignalKindSchema,
  chunkOrdinal: z.number().int().min(0),
  text: z.string().trim().min(1).max(2_400),
  evidenceBlockIds: EvidenceBlockIdsSchema,
});

export const SemanticCollectionCorpusItemSchema = z.object({
  itemId: z.string().min(1),
  userItemId: z.string().min(1),
  title: z.string().trim().min(1),
  canonicalUrl: z.string().url(),
  creator: z.string().trim().min(1).nullable(),
  publisher: z.string().trim().min(1).nullable(),
  enrichmentContentHash: z.string().min(1),
  sourceContentHash: z.string().min(1),
  sourceCoverage: z.enum(['FULL_CONTENT', 'PARTIAL_CONTENT']),
  sourceKind: z.string().trim().min(1),
  sourceWordCount: z.number().int().min(1),
  sourceQualityScore: z.number().min(0).max(1),
  sourceQualityWarnings: z.array(z.string()),
  signals: z.array(SemanticSignalSchema).min(3),
});

export const SemanticCollectionCorpusSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  userId: z.string().min(1),
  corpusHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  items: z.array(SemanticCollectionCorpusItemSchema).min(3),
});

export const DiscoveredThemeSchema = z.object({
  lens: completeText('Theme lens', 20, 240),
  rationale: completeText('Theme rationale', 30, 500),
  seedItemIds: z.array(z.string().trim().min(1)).length(3),
});

export const ThemeDiscoverySchema = z
  .object({ themes: z.array(DiscoveredThemeSchema).length(3) })
  .superRefine((value, context) => {
    const normalized = value.themes.map((theme) => normalizeKey(theme.lens));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['themes'],
        message: 'Discovered collection lenses must be distinct',
      });
    }
  });

const SignalIdsSchema = z.array(z.string().trim().min(1)).min(1).max(6);

export const CandidateScoreSchema = z.object({
  itemId: z.string().min(1),
  overallScore: z.number().min(0).max(100),
  verdict: z.enum(['STRONG', 'MODERATE', 'WEAK']),
});

export const SelectedCollectionItemSchema = z.object({
  itemId: z.string().min(1),
  rank: z.number().int().min(1).max(6),
  reason: completeText('Selection reason', 20, 500),
  signalIds: SignalIdsSchema,
});

export const NearMissSchema = z.object({
  itemId: z.string().min(1),
  reason: completeText('Near-miss reason', 20, 500),
  signalIds: SignalIdsSchema,
});

export const CollectionProposalModelOutputSchema = z.object({
  title: completeText('Collection title', 4, 80),
  description: completeText('Collection description', 20, 240),
  collectionRationale: completeText('Collection rationale', 40, 800),
  candidateScores: z.array(CandidateScoreSchema).min(3).max(80),
  selectedItems: z.array(SelectedCollectionItemSchema).min(3).max(6),
  nearMisses: z.array(NearMissSchema).max(2).default([]),
});

export const CollectionProposalSchema = CollectionProposalModelOutputSchema.extend({
  proposalId: z.string().min(1),
  origin: z.enum(['USER_DIRECTED', 'AI_DISCOVERED']),
  lens: completeText('Collection lens', 20, 240),
  discoveryRationale: completeText('Discovery rationale', 20, 500).nullable(),
  themeSeedItemIds: z.array(z.string().min(1)).max(6),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  seed: z.number().int().positive(),
});

export const CollectionGenerationSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  corpusHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  proposals: z.array(CollectionProposalSchema).length(4),
});

export const ProposalStabilitySchema = z.object({
  proposalId: z.string().min(1),
  primaryItemIds: z.array(z.string()),
  replayItemIds: z.array(z.string()),
  intersectionItemIds: z.array(z.string()),
  unionItemIds: z.array(z.string()),
  coreRetention: z.number().min(0).max(1),
  jaccardSimilarity: z.number().min(0).max(1),
  passes: z.boolean(),
});

export const StabilityReportSchema = z.object({
  minimumCoreRetention: z.number().min(0).max(1),
  proposals: z.array(ProposalStabilitySchema).length(4),
  passes: z.boolean(),
});

export type SemanticSignal = z.infer<typeof SemanticSignalSchema>;
export type SemanticCollectionCorpusItem = z.infer<typeof SemanticCollectionCorpusItemSchema>;
export type SemanticCollectionCorpus = z.infer<typeof SemanticCollectionCorpusSchema>;
export type DiscoveredTheme = z.infer<typeof DiscoveredThemeSchema>;
export type CollectionProposalModelOutput = z.infer<typeof CollectionProposalModelOutputSchema>;
export type CollectionProposal = z.infer<typeof CollectionProposalSchema>;
export type CollectionGeneration = z.infer<typeof CollectionGenerationSchema>;
export type StabilityReport = z.infer<typeof StabilityReportSchema>;

export interface WorkersAIStructuredOptions<T> {
  accountId: string;
  apiToken: string;
  model: string;
  seed: number;
  maxTokens: number;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  validate?: (value: T) => string[];
  operation: string;
  repairPrompt: string;
  repairAttempts?: number;
  transportRetries?: number;
  fetchImpl?: typeof fetch;
  onDiagnostic?: (message: string) => void;
}

export interface SemanticCollectionCorpusRow {
  item_id: string;
  user_item_id: string;
  title: string;
  canonical_url: string;
  creator: string | null;
  publisher: string | null;
  enrichment_content_hash: string;
  source_content_hash: string;
  source_coverage: string;
  source_kind: string;
  source_word_count: number;
  source_quality_score: number;
  source_quality_warnings_json: string;
  understanding_json: string;
}

function extractJsonCandidates(value: string): string[] {
  const trimmed = value.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  return [...new Set(candidates)];
}

export function workersAIResponseText(response: unknown): string {
  const visit = (value: unknown): string | null => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    for (const key of ['response', 'output_text', 'text', 'content']) {
      if (typeof record[key] === 'string' && record[key]) return record[key];
    }
    if (Array.isArray(record.choices)) {
      for (const choice of record.choices) {
        if (!choice || typeof choice !== 'object') continue;
        const choiceRecord = choice as Record<string, unknown>;
        const direct = visit(choiceRecord);
        if (direct) return direct;
        const message = visit(choiceRecord.message);
        if (message) return message;
      }
    }
    for (const key of ['result', 'message']) {
      const nested = visit(record[key]);
      if (nested) return nested;
    }
    return null;
  };

  const text = visit(response);
  if (!text) throw new Error('Workers AI response did not contain final response text');
  return text;
}

function parseStructuredModelResponse<T>(
  response: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): T {
  const direct = schema.safeParse(response);
  if (direct.success) return direct.data;

  const text = workersAIResponseText(response);
  let parseError: unknown;
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const validated = schema.safeParse(parsed);
      if (validated.success) return validated.data;
      parseError = new Error(validated.error.message);
    } catch (error) {
      parseError = error;
    }
  }
  throw new Error(
    `Workers AI response failed structured validation: ${parseError instanceof Error ? parseError.message : String(parseError)}`
  );
}

export async function runWorkersAIStructured<T>(
  options: WorkersAIStructuredOptions<T>
): Promise<T> {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/ai/run/${options.model}`;
  const repairAttempts = Math.max(0, options.repairAttempts ?? 2);
  const transportRetries = Math.max(0, options.transportRetries ?? 2);
  const fetchImpl = options.fetchImpl ?? fetch;
  let lastFailure = '';
  let lastResponseText = '';

  for (let attempt = 0; attempt <= repairAttempts; attempt++) {
    const messages =
      attempt === 0
        ? options.messages
        : [
            ...options.messages,
            {
              role: 'user' as const,
              content: `${options.repairPrompt}\n\nPrevious validation failure:\n${lastFailure.slice(0, 4_000)}${lastResponseText ? `\n\nPrevious invalid JSON response to repair:\n${lastResponseText.slice(0, 10_000)}` : ''}\n/no_think`,
            },
          ];
    const request = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        response_format: { type: 'json_object' },
        max_tokens: options.maxTokens,
        temperature: 0.4,
        top_p: 0.8,
        top_k: 20,
        seed: options.seed,
      }),
      signal: AbortSignal.timeout(180_000),
    } satisfies RequestInit;
    let response: Response | null = null;
    let body: unknown;
    for (let transportAttempt = 0; transportAttempt <= transportRetries; transportAttempt++) {
      response = await fetchImpl(endpoint, request);
      body = (await response.json()) as unknown;
      const retryable =
        response.status === 408 || response.status === 429 || response.status >= 500;
      if (response.ok || !retryable || transportAttempt >= transportRetries) break;
      options.onDiagnostic?.(
        `${options.operation} transport ${response.status}; retry ${transportAttempt + 1}/${transportRetries}`
      );
      await new Promise((resolve) => setTimeout(resolve, 500 * (transportAttempt + 1)));
    }
    if (!response) throw new Error(`${options.operation} did not receive a Workers AI response`);
    if (!response.ok) {
      lastFailure = `HTTP ${response.status}: ${JSON.stringify(body).slice(0, 4_000)}`;
    } else {
      try {
        lastResponseText = workersAIResponseText(body);
        const value = parseStructuredModelResponse(body, options.schema);
        const semanticIssues = options.validate?.(value) ?? [];
        if (semanticIssues.length === 0) return value;
        lastFailure = semanticIssues.join('\n');
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }
    }

    if (attempt < repairAttempts) {
      options.onDiagnostic?.(
        `${options.operation} failed validation; repair ${attempt + 1}/${repairAttempts}: ${lastFailure.slice(0, 800)}`
      );
    }
  }

  throw new Error(`${options.operation} failed after repair attempts: ${lastFailure}`);
}

const CorpusRowSchema = z.object({
  item_id: z.string().min(1),
  user_item_id: z.string().min(1),
  title: z.string().trim().min(1),
  canonical_url: z.string().url(),
  creator: z.string().trim().min(1).nullable(),
  publisher: z.string().trim().min(1).nullable(),
  enrichment_content_hash: z.string().min(1),
  source_content_hash: z.string().min(1),
  source_coverage: z.enum(['FULL_CONTENT', 'PARTIAL_CONTENT']),
  source_kind: z.string().trim().min(1),
  source_word_count: z.number().int().min(1),
  source_quality_score: z.number().min(0).max(1),
  source_quality_warnings_json: z.string(),
  understanding_json: z.string(),
});

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function signalId(itemId: string, chunkOrdinal: number, kind: string, index: number): string {
  return `${itemId}:c${chunkOrdinal}:${kind.toLowerCase()}:${index}`;
}

function addSignal(
  signals: SemanticSignal[],
  input: {
    itemId: string;
    chunkOrdinal: number;
    kind: z.infer<typeof SemanticSignalKindSchema>;
    index: number;
    text: string;
    evidenceBlockIds: string[];
    allowedBlockIds: Set<string>;
  }
) {
  const evidenceBlockIds = [...new Set(input.evidenceBlockIds.map((value) => value.trim()))];
  const invalid = evidenceBlockIds.filter((id) => !input.allowedBlockIds.has(id));
  if (invalid.length > 0) {
    throw new Error(
      `Understanding signal for ${input.itemId} cites invalid block IDs: ${invalid.join(', ')}`
    );
  }

  signals.push(
    SemanticSignalSchema.parse({
      id: signalId(input.itemId, input.chunkOrdinal, input.kind, input.index),
      kind: input.kind,
      chunkOrdinal: input.chunkOrdinal,
      text: input.text,
      evidenceBlockIds,
    })
  );
}

function signalsFromUnderstanding(
  itemId: string,
  understanding: z.infer<typeof ArticleUnderstandingSchema>
): SemanticSignal[] {
  const signals: SemanticSignal[] = [];

  for (const chunk of understanding.chunks) {
    const allowedBlockIds = new Set(chunk.blockIds);
    addSignal(signals, {
      itemId,
      chunkOrdinal: chunk.ordinal,
      kind: 'SUMMARY',
      index: 0,
      text: chunk.summary.text,
      evidenceBlockIds: chunk.summary.evidenceBlockIds,
      allowedBlockIds,
    });

    chunk.topics.slice(0, 2).forEach((topic, index) =>
      addSignal(signals, {
        itemId,
        chunkOrdinal: chunk.ordinal,
        kind: 'TOPIC',
        index,
        text: `${topic.name}: ${topic.description}`,
        evidenceBlockIds: topic.evidenceBlockIds,
        allowedBlockIds,
      })
    );
    chunk.claims.slice(0, 6).forEach((claim, index) =>
      addSignal(signals, {
        itemId,
        chunkOrdinal: chunk.ordinal,
        kind: 'CLAIM',
        index,
        text: claim.statement,
        evidenceBlockIds: claim.evidenceBlockIds,
        allowedBlockIds,
      })
    );
    chunk.questionsAnswered.slice(0, 2).forEach((question, index) =>
      addSignal(signals, {
        itemId,
        chunkOrdinal: chunk.ordinal,
        kind: 'QUESTION_ANSWERED',
        index,
        text: `${question.question} ${question.answer}`,
        evidenceBlockIds: question.evidenceBlockIds,
        allowedBlockIds,
      })
    );
    chunk.concepts.slice(0, 4).forEach((concept, index) =>
      addSignal(signals, {
        itemId,
        chunkOrdinal: chunk.ordinal,
        kind: 'CONCEPT',
        index,
        text: `${concept.name}: ${concept.description}`,
        evidenceBlockIds: concept.evidenceBlockIds,
        allowedBlockIds,
      })
    );
    if (chunk.perspective) {
      addSignal(signals, {
        itemId,
        chunkOrdinal: chunk.ordinal,
        kind: 'PERSPECTIVE',
        index: 0,
        text: chunk.perspective.description,
        evidenceBlockIds: chunk.perspective.evidenceBlockIds,
        allowedBlockIds,
      });
    }
    if (chunk.audience) {
      addSignal(signals, {
        itemId,
        chunkOrdinal: chunk.ordinal,
        kind: 'AUDIENCE',
        index: 0,
        text: chunk.audience.description,
        evidenceBlockIds: chunk.audience.evidenceBlockIds,
        allowedBlockIds,
      });
    }
    chunk.actionableTakeaways.slice(0, 4).forEach((takeaway, index) =>
      addSignal(signals, {
        itemId,
        chunkOrdinal: chunk.ordinal,
        kind: 'ACTIONABLE_TAKEAWAY',
        index,
        text: takeaway.description,
        evidenceBlockIds: takeaway.evidenceBlockIds,
        allowedBlockIds,
      })
    );
  }

  return signals;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`;
}

export async function buildSemanticCollectionCorpus(
  userId: string,
  rawRows: unknown[],
  generatedAt = new Date().toISOString()
): Promise<SemanticCollectionCorpus> {
  const rows = rawRows.map((row) => CorpusRowSchema.parse(row));
  const itemIds = rows.map((row) => row.item_id);
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error('Semantic collection corpus contains duplicate canonical items');
  }

  const items = rows
    .map((row) => {
      const understanding = ArticleUnderstandingSchema.parse(JSON.parse(row.understanding_json));
      if (understanding.sourceContentHash !== row.source_content_hash) {
        throw new Error(`Understanding source hash is stale for ${row.item_id}`);
      }
      if (understanding.coverage !== row.source_coverage) {
        throw new Error(`Understanding source coverage disagrees for ${row.item_id}`);
      }

      return SemanticCollectionCorpusItemSchema.parse({
        itemId: row.item_id,
        userItemId: row.user_item_id,
        title: row.title,
        canonicalUrl: row.canonical_url,
        creator: row.creator,
        publisher: row.publisher,
        enrichmentContentHash: row.enrichment_content_hash,
        sourceContentHash: row.source_content_hash,
        sourceCoverage: row.source_coverage,
        sourceKind: row.source_kind,
        sourceWordCount: row.source_word_count,
        sourceQualityScore: row.source_quality_score,
        sourceQualityWarnings: z
          .array(z.string())
          .parse(JSON.parse(row.source_quality_warnings_json)),
        signals: signalsFromUnderstanding(row.item_id, understanding),
      });
    })
    .sort((left, right) => left.itemId.localeCompare(right.itemId));

  const corpusHash = await sha256(JSON.stringify({ schemaVersion: 1, userId, items }));
  return SemanticCollectionCorpusSchema.parse({
    schemaVersion: 1,
    generatedAt,
    userId,
    corpusHash,
    items,
  });
}

export function buildProductionCorpusQuery(userId: string): string {
  const escapedUserId = userId.replaceAll("'", "''");
  const query = `
WITH latest_understanding AS (
  SELECT
    ie.*,
    ROW_NUMBER() OVER (PARTITION BY ie.item_id ORDER BY ie.updated_at DESC, ie.id DESC) AS row_number
  FROM item_enrichments ie
  WHERE ie.schema_version = 3
    AND ie.status = 'COMPLETE'
    AND ie.understanding_json IS NOT NULL
)
SELECT
  i.id AS item_id,
  ui.id AS user_item_id,
  i.title,
  i.canonical_url,
  c.name AS creator,
  i.publisher,
  lu.content_hash AS enrichment_content_hash,
  lu.source_content_hash,
  lu.source_coverage,
  lu.source_kind,
  lu.source_word_count,
  lu.source_quality_score,
  lu.source_quality_warnings_json,
  lu.understanding_json
FROM user_items ui
INNER JOIN items i ON i.id = ui.item_id
INNER JOIN latest_understanding lu ON lu.item_id = i.id AND lu.row_number = 1
LEFT JOIN creators c ON c.id = i.creator_id
WHERE ui.user_id = '${escapedUserId}'
  AND ui.state = 'BOOKMARKED'
  AND i.content_type = 'ARTICLE'
ORDER BY i.id
`.trim();
  assertReadOnlySql(query);
  return query;
}

export function assertReadOnlySql(sql: string): void {
  const normalized = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
    .replace(/;+$/, '')
    .trim();
  if (!/^(?:SELECT|WITH)\b/i.test(normalized)) {
    throw new Error('Production corpus SQL must begin with SELECT or WITH');
  }
  if (/;\s*\S/.test(normalized)) {
    throw new Error('Production corpus SQL must contain exactly one statement');
  }
  if (
    /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|PRAGMA)\b/i.test(
      normalized
    )
  ) {
    throw new Error('Production corpus SQL contains a forbidden write or administrative keyword');
  }
}

function itemSignalIds(item: SemanticCollectionCorpusItem): Set<string> {
  return new Set(item.signals.map((signal) => signal.id));
}

function validateReferencedSignals(
  item: SemanticCollectionCorpusItem,
  signalIds: string[],
  path: string,
  issues: string[]
) {
  const allowed = itemSignalIds(item);
  const invalid = signalIds.filter((signalId) => !allowed.has(signalId));
  if (invalid.length > 0) issues.push(`${path} cites invalid signal IDs: ${invalid.join(', ')}`);
}

function proseValues(proposal: CollectionProposal): string[] {
  return [
    proposal.title,
    proposal.description,
    proposal.collectionRationale,
    proposal.lens,
    proposal.discoveryRationale ?? '',
    ...proposal.selectedItems.map((selected) => selected.reason),
    ...proposal.nearMisses.map((nearMiss) => nearMiss.reason),
  ].filter(Boolean);
}

export function validateCollectionProposal(
  proposal: CollectionProposal,
  corpus: SemanticCollectionCorpus
): string[] {
  const issues: string[] = [];
  const itemById = new Map(corpus.items.map((item) => [item.itemId, item]));
  const corpusIds = new Set(itemById.keys());
  const candidateIds = proposal.candidateScores.map((candidate) => candidate.itemId);
  const candidateIdSet = new Set(candidateIds);

  if (candidateIds.length !== corpus.items.length || candidateIdSet.size !== corpus.items.length) {
    issues.push('candidateScores must contain every corpus item exactly once');
  }
  for (const itemId of corpusIds) {
    if (!candidateIdSet.has(itemId)) issues.push(`candidateScores is missing ${itemId}`);
  }
  for (const itemId of candidateIdSet) {
    if (!corpusIds.has(itemId)) issues.push(`candidateScores contains unknown item ${itemId}`);
  }

  const selectedIds = proposal.selectedItems.map((selected) => selected.itemId);
  if (new Set(selectedIds).size !== selectedIds.length) {
    issues.push('selectedItems contains duplicate items');
  }
  const sortedRanks = proposal.selectedItems.map((selected) => selected.rank).sort((a, b) => a - b);
  const expectedRanks = Array.from(
    { length: proposal.selectedItems.length },
    (_, index) => index + 1
  );
  if (JSON.stringify(sortedRanks) !== JSON.stringify(expectedRanks)) {
    issues.push('selectedItems ranks must be consecutive from 1');
  }
  proposal.selectedItems.forEach((selected, index) => {
    const item = itemById.get(selected.itemId);
    if (!item) {
      issues.push(`selectedItems[${index}] contains unknown item ${selected.itemId}`);
      return;
    }
    if (!candidateIdSet.has(selected.itemId)) {
      issues.push(`selectedItems[${index}] was not scored as a candidate`);
    }
    validateReferencedSignals(item, selected.signalIds, `selectedItems[${index}]`, issues);
  });

  const selectedIdSet = new Set(selectedIds);
  const nearMissIds = proposal.nearMisses.map((nearMiss) => nearMiss.itemId);
  if (new Set(nearMissIds).size !== nearMissIds.length) {
    issues.push('nearMisses contains duplicate items');
  }
  proposal.nearMisses.forEach((nearMiss, index) => {
    const item = itemById.get(nearMiss.itemId);
    if (!item) {
      issues.push(`nearMisses[${index}] contains unknown item ${nearMiss.itemId}`);
      return;
    }
    if (selectedIdSet.has(nearMiss.itemId)) {
      issues.push(`nearMisses[${index}] is also selected`);
    }
    validateReferencedSignals(item, nearMiss.signalIds, `nearMisses[${index}]`, issues);
  });

  if (proposal.origin === 'AI_DISCOVERED') {
    if (proposal.themeSeedItemIds.length !== 3) {
      issues.push('AI-discovered proposals must retain exactly three theme seed items');
    }
    if (proposal.selectedItems.length > 4) {
      issues.push('AI-discovered proposals may select at most four items in this experiment');
    }
    for (const seedItemId of proposal.themeSeedItemIds) {
      if (!selectedIdSet.has(seedItemId)) {
        issues.push(`AI-discovered proposal is missing theme seed item ${seedItemId}`);
      }
    }
  }

  if (GENERIC_COLLECTION_TITLES.has(normalizeKey(proposal.title))) {
    issues.push(`Collection title is a generic category: ${proposal.title}`);
  }
  const malformed = proseValues(proposal).filter((value) => INCOMPLETE_SEMANTIC_ENDING.test(value));
  if (malformed.length > 0) {
    issues.push(`Collection prose contains truncated endings: ${malformed.join(' | ')}`);
  }

  return [...new Set(issues)];
}

function selectedSet(proposal: CollectionProposal): Set<string> {
  return new Set(proposal.selectedItems.map((item) => item.itemId));
}

function setIntersection(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => right.has(value)).sort();
}

function setUnion(left: Set<string>, right: Set<string>): string[] {
  return [...new Set([...left, ...right])].sort();
}

export function validateCollectionProposalSet(
  generation: CollectionGeneration,
  corpus: SemanticCollectionCorpus,
  maximumDiscoveredOverlap = 0.6
): string[] {
  const issues = generation.proposals.flatMap((proposal) =>
    validateCollectionProposal(proposal, corpus).map((issue) => `${proposal.proposalId}: ${issue}`)
  );

  const proposalIds = generation.proposals.map((proposal) => proposal.proposalId);
  if (new Set(proposalIds).size !== proposalIds.length) {
    issues.push('Proposal IDs must be distinct');
  }
  const normalizedTitles = generation.proposals.map((proposal) => normalizeKey(proposal.title));
  if (new Set(normalizedTitles).size !== normalizedTitles.length) {
    issues.push('Collection titles must be distinct');
  }
  if (generation.proposals.filter((proposal) => proposal.origin === 'USER_DIRECTED').length !== 1) {
    issues.push('Generation must contain exactly one user-directed collection');
  }
  if (generation.proposals.filter((proposal) => proposal.origin === 'AI_DISCOVERED').length !== 3) {
    issues.push('Generation must contain exactly three AI-discovered collections');
  }

  const discovered = generation.proposals.filter((proposal) => proposal.origin === 'AI_DISCOVERED');
  for (let leftIndex = 0; leftIndex < discovered.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < discovered.length; rightIndex++) {
      const left = discovered[leftIndex];
      const right = discovered[rightIndex];
      if (!left || !right) continue;
      const intersection = setIntersection(selectedSet(left), selectedSet(right));
      const union = setUnion(selectedSet(left), selectedSet(right));
      const similarity = union.length === 0 ? 0 : intersection.length / union.length;
      if (similarity > maximumDiscoveredOverlap) {
        issues.push(
          `${left.proposalId} and ${right.proposalId} overlap too heavily (${similarity.toFixed(2)})`
        );
      }
    }
  }

  return [...new Set(issues)];
}

export function validateDiscoveredThemes(
  themes: DiscoveredTheme[],
  corpus: SemanticCollectionCorpus,
  maximumSeedOverlap = 0.4,
  minimumCorpusCoverage = 0.7
): string[] {
  const issues: string[] = [];
  const corpusIds = new Set(corpus.items.map((item) => item.itemId));
  const covered = new Set<string>();

  themes.forEach((theme, index) => {
    const seedIds = new Set(theme.seedItemIds);
    if (seedIds.size !== theme.seedItemIds.length) {
      issues.push(`themes[${index}] contains duplicate seed items`);
    }
    for (const itemId of seedIds) {
      if (!corpusIds.has(itemId))
        issues.push(`themes[${index}] contains unknown seed item ${itemId}`);
      covered.add(itemId);
    }
  });

  for (let leftIndex = 0; leftIndex < themes.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < themes.length; rightIndex++) {
      const left = new Set(themes[leftIndex]?.seedItemIds ?? []);
      const right = new Set(themes[rightIndex]?.seedItemIds ?? []);
      const intersection = setIntersection(left, right);
      const union = setUnion(left, right);
      const overlap = union.length === 0 ? 0 : intersection.length / union.length;
      if (overlap > maximumSeedOverlap) {
        issues.push(
          `themes[${leftIndex}] and themes[${rightIndex}] seed portfolios overlap too heavily (${overlap.toFixed(2)})`
        );
      }
    }
  }

  const coverage = covered.size / corpus.items.length;
  if (coverage < minimumCorpusCoverage) {
    issues.push(
      `Discovered theme seeds cover only ${(coverage * 100).toFixed(0)}% of the corpus; require ${(minimumCorpusCoverage * 100).toFixed(0)}%`
    );
  }
  return [...new Set(issues)];
}

export function validateProposalNovelty(
  proposal: CollectionProposal,
  priorProposals: CollectionProposal[],
  maximumOverlap = 0.6
): string[] {
  if (proposal.origin !== 'AI_DISCOVERED') return [];
  const current = selectedSet(proposal);
  return priorProposals
    .filter((prior) => prior.origin === 'AI_DISCOVERED')
    .flatMap((prior) => {
      const priorSet = selectedSet(prior);
      const intersection = setIntersection(current, priorSet);
      const union = setUnion(current, priorSet);
      const overlap = union.length === 0 ? 0 : intersection.length / union.length;
      return overlap > maximumOverlap
        ? [
            `${proposal.proposalId} overlaps ${prior.proposalId} too heavily (${overlap.toFixed(2)}); choose a more distinct evidence-backed portfolio`,
          ]
        : [];
    });
}

export function compareCollectionGenerations(
  primary: CollectionGeneration,
  replay: CollectionGeneration,
  minimumCoreRetention = 0.7
): StabilityReport {
  if (primary.corpusHash !== replay.corpusHash) {
    throw new Error('Cannot compare collection generations from different corpus snapshots');
  }
  const replayById = new Map(replay.proposals.map((proposal) => [proposal.proposalId, proposal]));
  const proposals = primary.proposals.map((proposal) => {
    const replayProposal = replayById.get(proposal.proposalId);
    if (!replayProposal) throw new Error(`Replay is missing proposal ${proposal.proposalId}`);
    const primarySet = selectedSet(proposal);
    const replaySet = selectedSet(replayProposal);
    const intersectionItemIds = setIntersection(primarySet, replaySet);
    const unionItemIds = setUnion(primarySet, replaySet);
    const denominator = Math.max(1, Math.min(primarySet.size, replaySet.size));
    const coreRetention = intersectionItemIds.length / denominator;
    const jaccardSimilarity =
      unionItemIds.length === 0 ? 1 : intersectionItemIds.length / unionItemIds.length;
    return {
      proposalId: proposal.proposalId,
      primaryItemIds: [...primarySet].sort(),
      replayItemIds: [...replaySet].sort(),
      intersectionItemIds,
      unionItemIds,
      coreRetention,
      jaccardSimilarity,
      passes: coreRetention >= minimumCoreRetention,
    };
  });

  return StabilityReportSchema.parse({
    minimumCoreRetention,
    proposals,
    passes: proposals.every((proposal) => proposal.passes),
  });
}

function displayEvidence(item: SemanticCollectionCorpusItem, ids: string[]): string[] {
  const byId = new Map(item.signals.map((signal) => [signal.id, signal]));
  return ids.flatMap((id) => {
    const signal = byId.get(id);
    if (!signal) return [];
    return [`${signal.kind}: ${signal.text} [${signal.evidenceBlockIds.join(', ')}]`];
  });
}

export function renderSemanticCollectionReview(input: {
  corpus: SemanticCollectionCorpus;
  primary: CollectionGeneration;
  replay: CollectionGeneration;
  stability: StabilityReport;
  validationIssues: string[];
}): string {
  const itemById = new Map(input.corpus.items.map((item) => [item.itemId, item]));
  const stabilityById = new Map(
    input.stability.proposals.map((proposal) => [proposal.proposalId, proposal])
  );
  const lines = [
    '# Semantic collection experiment review',
    '',
    `Generated: ${input.primary.generatedAt}`,
    '',
    `Corpus: ${input.corpus.items.length} deeply understood articles`,
    '',
    `Corpus hash: \`${input.corpus.corpusHash}\``,
    '',
    `Model: \`${input.primary.model}\` · prompt: \`${input.primary.promptVersion}\``,
    '',
    `Automated validation: ${input.validationIssues.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    `Replay stability: ${input.stability.passes ? 'PASS' : 'FAIL'} (minimum core retention ${(input.stability.minimumCoreRetention * 100).toFixed(0)}%)`,
    '',
  ];

  if (input.validationIssues.length > 0) {
    lines.push('## Validation issues', '');
    for (const issue of input.validationIssues) lines.push(`- ${issue}`);
    lines.push('');
  }

  for (const proposal of input.primary.proposals) {
    const stability = stabilityById.get(proposal.proposalId);
    lines.push(
      `## ${proposal.title}`,
      '',
      `**Origin:** ${proposal.origin === 'USER_DIRECTED' ? 'User-directed' : 'AI-discovered'}`,
      '',
      `**Lens:** ${proposal.lens}`,
      '',
      proposal.description,
      '',
      proposal.collectionRationale,
      '',
      `**Replay:** ${stability?.passes ? 'PASS' : 'FAIL'} · core retention ${((stability?.coreRetention ?? 0) * 100).toFixed(0)}% · Jaccard ${((stability?.jaccardSimilarity ?? 0) * 100).toFixed(0)}%`,
      '',
      '- [ ] Keep this collection',
      '- [ ] The collection is specific enough to be useful',
      '- [ ] The ordering makes sense',
      '- [ ] It reveals a useful non-obvious relationship',
      '',
      '### Selected articles',
      ''
    );

    for (const selected of [...proposal.selectedItems].sort(
      (left, right) => left.rank - right.rank
    )) {
      const item = itemById.get(selected.itemId);
      if (!item) continue;
      const candidate = proposal.candidateScores.find((entry) => entry.itemId === selected.itemId);
      const membershipLabel =
        proposal.origin === 'AI_DISCOVERED'
          ? proposal.themeSeedItemIds.includes(selected.itemId)
            ? ' · theme core'
            : ' · additional'
          : '';
      lines.push(
        `${selected.rank}. **[${item.title}](${item.canonicalUrl})**${item.creator || item.publisher ? ` — ${item.creator ?? item.publisher}` : ''}`,
        '',
        `   ${selected.reason}`,
        '',
        `   Score: ${candidate?.overallScore ?? '—'} (${candidate?.verdict ?? '—'})${membershipLabel}`,
        '',
        '   Evidence:',
        ''
      );
      for (const evidence of displayEvidence(item, selected.signalIds)) {
        lines.push(`   - ${evidence}`);
      }
      lines.push('', '   - [ ] This article belongs', '');
    }

    if (proposal.nearMisses.length > 0) {
      lines.push('### Near misses', '');
      for (const nearMiss of proposal.nearMisses) {
        const item = itemById.get(nearMiss.itemId);
        if (!item) continue;
        lines.push(`- **${item.title}** — ${nearMiss.reason}`);
      }
      lines.push('');
    }
    lines.push('### Notes', '', 'Missing article or other feedback:', '', '---', '');
  }

  lines.push(
    '## Final decision',
    '',
    '- [ ] Stop: semantic collections are not useful enough',
    '- [ ] Tune: the idea is promising but generation needs another experiment',
    '- [ ] Productize: add durable generated membership and collection snapshots',
    ''
  );
  return lines.join('\n');
}

export function compactCorpusForModel(corpus: SemanticCollectionCorpus): unknown[] {
  return corpus.items.map((item) => ({
    itemId: item.itemId,
    title: item.title,
    creator: item.creator ?? item.publisher,
    coverage: item.sourceCoverage,
    qualityScore: item.sourceQualityScore,
    warnings: item.sourceQualityWarnings,
    signals: item.signals.map((signal) => [signal.id, signal.kind, signal.text]),
  }));
}
