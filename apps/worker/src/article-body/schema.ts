import { z } from 'zod';

import {
  ARTICLE_BODY_EXTRACTOR_VERSION,
  ARTICLE_BODY_SCHEMA_VERSION,
  type ArticleBodyArtifact,
  type ArticleBodyQueueMessage,
} from './types';

export const ArticleBodyStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'AVAILABLE',
  'DEGRADED',
  'UNAVAILABLE',
]);

export const ArticleBodySourceKindSchema = z.enum([
  'LEGACY',
  'RSS_FULL',
  'ATOM_FULL',
  'PUBLIC_WEB',
  'PUBLIC_NEWSLETTER',
  'BROWSER_RENDERED',
]);

export const ArticleBodyTriggerSchema = z.enum([
  'ingestion',
  'bookmark',
  'reader_open',
  'backfill',
  'repair',
]);

export const ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES = 80 * 1024;

export const ArticleBodyEmbeddedCandidateSchema = z.object({
  html: z.string().min(1),
  sourceKind: z.enum(['RSS_FULL', 'ATOM_FULL', 'PUBLIC_NEWSLETTER']),
  sourceUrl: z.string().url(),
});

export const ArticleBodyArtifactSchema = z.object({
  schemaVersion: z.literal(ARTICLE_BODY_SCHEMA_VERSION),
  extractorVersion: z.number().int().positive(),
  itemId: z.string().min(1),
  canonicalUrl: z.string().url(),
  title: z.string().min(1),
  byline: z.string().nullable(),
  publisher: z.string().nullable(),
  publishedAt: z.string().nullable(),
  language: z.string().nullable(),
  sourceKind: ArticleBodySourceKindSchema,
  sourceUrl: z.string().url(),
  extractedAt: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  wordCount: z.number().int().nonnegative(),
  readingTimeMinutes: z.number().int().nonnegative(),
  qualityScore: z.number().min(0).max(1),
  qualityWarnings: z.array(z.string().min(1)).max(50),
  sanitizedHtml: z.string(),
  plainText: z.string(),
  blocks: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.string().min(1),
        text: z.string(),
      })
    )
    .max(10_000),
}) satisfies z.ZodType<ArticleBodyArtifact>;

export const ArticleBodyQueueMessageSchema = z
  .object({
    itemId: z.string().min(1),
    extractorVersion: z.number().int().positive().default(ARTICLE_BODY_EXTRACTOR_VERSION),
    trigger: ArticleBodyTriggerSchema,
    enqueuedAt: z.number().int().nonnegative(),
    traceId: z.string().min(1).optional(),
    embeddedCandidates: z.array(ArticleBodyEmbeddedCandidateSchema).max(2).optional(),
  })
  .superRefine((message, context) => {
    if (!message.embeddedCandidates) return;
    const bytes = new TextEncoder().encode(JSON.stringify(message.embeddedCandidates)).byteLength;
    if (bytes > ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['embeddedCandidates'],
        message: `Embedded candidates exceed ${ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES} bytes`,
      });
    }
  }) satisfies z.ZodType<ArticleBodyQueueMessage, z.ZodTypeDef, unknown>;

export type ArticleBodyQueueMessageInput = z.infer<typeof ArticleBodyQueueMessageSchema>;
