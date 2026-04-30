import { z } from 'zod';

import { ENRICHMENT_SCHEMA_VERSION, type EnrichmentModelOutput, type SuggestedTag } from './types';

const ConfidenceSchema = z.number().min(0).max(1);

export const EnrichmentQueueMessageSchema = z.object({
  itemId: z.string().min(1),
  userItemId: z.string().min(1),
  userId: z.string().min(1),
  trigger: z.enum(['manual_save', 'inbox_bookmark', 'backfill']),
  schemaVersion: z.number().int().positive().default(ENRICHMENT_SCHEMA_VERSION),
  contentHash: z.string().min(1),
  enqueuedAt: z.number().int().nonnegative(),
});

export const ModelSuggestedTagSchema = z.object({
  name: z.string().min(1).max(64),
  kind: z.enum(['topic', 'entity', 'intent', 'format']),
  confidence: ConfidenceSchema,
});

export const SuggestedTagSchema = ModelSuggestedTagSchema.extend({
  normalizedName: z.string().min(1).max(32),
  matchedExistingTagId: z.string().nullable(),
});

export const EnrichmentModelOutputSchema = z.object({
  summary: z.object({
    short: z.string().min(1).max(500),
    detail: z.string().min(1).max(2000),
  }),
  classification: z.object({
    primaryCategory: z.string().min(1).max(64),
    secondaryCategories: z.array(z.string().min(1).max(64)).max(5),
    intent: z.string().min(1).max(64),
    difficulty: z.string().min(1).max(64),
    evergreenScore: ConfidenceSchema,
    timeSensitivity: z.string().min(1).max(64),
  }),
  topics: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        confidence: ConfidenceSchema,
      })
    )
    .max(15),
  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        type: z.string().min(1).max(64),
        confidence: ConfidenceSchema,
      })
    )
    .max(20),
  suggestedTags: z.array(ModelSuggestedTagSchema).max(20),
  userContext: z.object({
    inferredSaveIntent: z.string().min(1).max(500),
    reasonToRevisit: z.string().min(1).max(500),
  }),
  confidence: z.object({
    overall: ConfidenceSchema,
    summary: ConfidenceSchema,
    classification: ConfidenceSchema,
    tags: ConfidenceSchema,
  }),
}) satisfies z.ZodType<EnrichmentModelOutput>;

export const SuggestedTagsSchema = z.array(SuggestedTagSchema).max(10) satisfies z.ZodType<
  SuggestedTag[]
>;

export type EnrichmentQueueMessageInput = z.infer<typeof EnrichmentQueueMessageSchema>;
