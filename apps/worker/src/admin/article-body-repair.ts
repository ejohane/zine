import { z } from 'zod';

import { acquireArticleBody, isSafePublicArticleUrl } from '../article-body/acquisition';
import { processArticleBodyQueueMessage } from '../article-body/processor';
import { ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES } from '../article-body/schema';
import {
  getArticleBodyStatus,
  markArticleBodyUnavailable,
  resolveArticleBodyDlqEvents,
} from '../article-body/service';
import { ARTICLE_BODY_EXTRACTOR_VERSION } from '../article-body/types';
import { createDb } from '../db';
import type { Bindings } from '../types';

const CandidateSchema = z.object({
  html: z.string().min(1),
  sourceKind: z.enum(['RSS_FULL', 'ATOM_FULL', 'PUBLIC_NEWSLETTER']),
  sourceUrl: z.string().url(),
});

const TerminalSchema = z.object({
  errorCode: z.enum(['HTTP_404', 'HTTP_410', 'NOT_READERABLE']),
  sourceUrl: z.string().url(),
});

export const ArticleBodyCandidateRepairSchema = z
  .object({
    itemId: z.string().min(1),
    dryRun: z.boolean().default(true),
    confirmedContentHash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional(),
    confirmedTerminalCode: TerminalSchema.shape.errorCode.optional(),
    candidate: CandidateSchema.optional(),
    terminal: TerminalSchema.optional(),
  })
  .superRefine((input, context) => {
    if (Boolean(input.candidate) === Boolean(input.terminal)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['candidate'],
        message: 'Provide exactly one candidate or terminal result',
      });
    }
    const bytes = input.candidate
      ? new TextEncoder().encode(JSON.stringify([input.candidate])).byteLength
      : 0;
    if (bytes > ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['candidate'],
        message: `Candidate exceeds ${ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES} bytes`,
      });
    }
    if (!input.dryRun) {
      if (input.candidate && !input.confirmedContentHash) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confirmedContentHash'],
          message: 'confirmedContentHash is required for candidate publication',
        });
      }
      if (input.terminal && !input.confirmedTerminalCode) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confirmedTerminalCode'],
          message: 'confirmedTerminalCode is required for terminal repair',
        });
      }
    }
  });

export type ArticleBodyCandidateRepairInput = z.infer<typeof ArticleBodyCandidateRepairSchema>;

export class ArticleBodyCandidateRepairError extends Error {
  constructor(
    public readonly code:
      | 'ITEM_NOT_FOUND'
      | 'UNSAFE_SOURCE_URL'
      | 'CANDIDATE_REJECTED'
      | 'HASH_MISMATCH',
    message: string,
    public readonly status: 404 | 409 | 422
  ) {
    super(message);
    this.name = 'ArticleBodyCandidateRepairError';
  }
}

export async function repairArticleBodyFromCandidate(
  env: Pick<Bindings, 'DB' | 'ARTICLE_CONTENT'>,
  input: ArticleBodyCandidateRepairInput
) {
  const sourceUrl = input.candidate?.sourceUrl ?? input.terminal?.sourceUrl;
  if (!sourceUrl || !isSafePublicArticleUrl(sourceUrl)) {
    throw new ArticleBodyCandidateRepairError(
      'UNSAFE_SOURCE_URL',
      'Candidate source URL must be a safe public HTTP URL',
      422
    );
  }

  const item = await env.DB.prepare(
    `SELECT id, canonical_url, title, publisher, published_at
     FROM items
     WHERE id = ?
       AND content_type = 'ARTICLE'
       AND EXISTS (SELECT 1 FROM user_items WHERE user_items.item_id = items.id)`
  )
    .bind(input.itemId)
    .first<{
      id: string;
      canonical_url: string;
      title: string;
      publisher: string | null;
      published_at: string | null;
    }>();
  if (!item) {
    throw new ArticleBodyCandidateRepairError(
      'ITEM_NOT_FOUND',
      'Accepted article item not found',
      404
    );
  }

  const db = createDb(env.DB);
  if (input.terminal) {
    const httpStatus = Number(/^HTTP_(\d{3})$/.exec(input.terminal.errorCode)?.[1] ?? 0) || null;
    const preview = {
      status: 'UNAVAILABLE' as const,
      extractorVersion: ARTICLE_BODY_EXTRACTOR_VERSION,
      errorCode: input.terminal.errorCode,
      httpStatus,
      sourceUrl: input.terminal.sourceUrl,
    };
    if (input.dryRun) {
      return { dryRun: true, published: false, preview };
    }
    if (input.confirmedTerminalCode !== input.terminal.errorCode) {
      throw new ArticleBodyCandidateRepairError(
        'HASH_MISMATCH',
        'Terminal result changed after dry-run review',
        409
      );
    }

    await markArticleBodyUnavailable(db, item.id, input.terminal.errorCode, { httpStatus });
    await resolveArticleBodyDlqEvents(db, item.id, ARTICLE_BODY_EXTRACTOR_VERSION);
    const current = await getArticleBodyStatus(db, item.id);
    return {
      dryRun: false,
      published: false,
      preview,
      currentStatus: current?.status ?? null,
    };
  }

  const candidate = input.candidate!;

  const acquisition = await acquireArticleBody(
    {
      itemId: item.id,
      canonicalUrl: item.canonical_url,
      title: item.title,
      publisher: item.publisher,
      publishedAt: item.published_at,
      embeddedCandidates: [candidate],
    },
    {
      extractorVersion: ARTICLE_BODY_EXTRACTOR_VERSION,
      fetch: async () => new Response('Candidate-only repair', { status: 404 }),
    }
  );
  if (!acquisition.artifact) {
    const candidateAttempt = acquisition.attempts[0];
    throw new ArticleBodyCandidateRepairError(
      'CANDIDATE_REJECTED',
      `Candidate failed quality gates${candidateAttempt?.errorCode ? `: ${candidateAttempt.errorCode}` : ''}`,
      422
    );
  }

  const preview = {
    status: acquisition.status,
    schemaVersion: acquisition.artifact.schemaVersion,
    extractorVersion: acquisition.artifact.extractorVersion,
    sourceKind: acquisition.artifact.sourceKind,
    sourceUrl: acquisition.artifact.sourceUrl,
    contentHash: acquisition.artifact.contentHash,
    wordCount: acquisition.artifact.wordCount,
    readingTimeMinutes: acquisition.artifact.readingTimeMinutes,
    qualityScore: acquisition.artifact.qualityScore,
    qualityWarnings: acquisition.artifact.qualityWarnings,
  };
  if (input.dryRun) {
    return { dryRun: true, published: false, preview };
  }
  if (input.confirmedContentHash !== acquisition.artifact.contentHash) {
    throw new ArticleBodyCandidateRepairError(
      'HASH_MISMATCH',
      'Candidate content changed after dry-run review',
      409
    );
  }

  await processArticleBodyQueueMessage(
    {
      itemId: item.id,
      extractorVersion: ARTICLE_BODY_EXTRACTOR_VERSION,
      trigger: 'repair',
      enqueuedAt: Date.now(),
      embeddedCandidates: [candidate],
    },
    db,
    env as Bindings
  );
  const current = await getArticleBodyStatus(db, item.id);

  return {
    dryRun: false,
    published: current?.status === 'AVAILABLE' || current?.status === 'DEGRADED',
    preview,
    currentStatus: current?.status ?? null,
  };
}
