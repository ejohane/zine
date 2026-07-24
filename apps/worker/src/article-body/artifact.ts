import { ArticleBodyArtifactSchema } from './schema';
import {
  ARTICLE_BODY_SCHEMA_VERSION,
  type ArticleBodyArtifact,
  type ArticleBodyBlock,
  type ArticleBodySourceKind,
} from './types';

export interface BuildArticleBodyArtifactInput {
  extractorVersion: number;
  itemId: string;
  canonicalUrl: string;
  title: string;
  byline?: string | null;
  publisher?: string | null;
  publishedAt?: string | null;
  language?: string | null;
  sourceKind: ArticleBodySourceKind;
  sourceUrl: string;
  extractedAt: number;
  wordCount: number;
  readingTimeMinutes: number;
  qualityScore: number;
  qualityWarnings?: string[];
  sanitizedHtml: string;
  plainText: string;
  blocks?: ArticleBodyBlock[];
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function contentIdentityPayload(input: BuildArticleBodyArtifactInput): string {
  return JSON.stringify({
    schemaVersion: ARTICLE_BODY_SCHEMA_VERSION,
    extractorVersion: input.extractorVersion,
    itemId: input.itemId,
    canonicalUrl: input.canonicalUrl,
    title: input.title,
    byline: input.byline ?? null,
    publisher: input.publisher ?? null,
    publishedAt: input.publishedAt ?? null,
    language: input.language ?? null,
    sourceKind: input.sourceKind,
    sourceUrl: input.sourceUrl,
    wordCount: input.wordCount,
    readingTimeMinutes: input.readingTimeMinutes,
    qualityScore: input.qualityScore,
    qualityWarnings: input.qualityWarnings ?? [],
    sanitizedHtml: input.sanitizedHtml,
    plainText: input.plainText,
    blocks: input.blocks ?? [],
  });
}

export async function computeArticleBodyContentHash(
  input: BuildArticleBodyArtifactInput
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(contentIdentityPayload(input))
  );
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

export async function buildArticleBodyArtifact(
  input: BuildArticleBodyArtifactInput
): Promise<ArticleBodyArtifact> {
  const artifact: ArticleBodyArtifact = {
    schemaVersion: ARTICLE_BODY_SCHEMA_VERSION,
    extractorVersion: input.extractorVersion,
    itemId: input.itemId,
    canonicalUrl: input.canonicalUrl,
    title: input.title,
    byline: input.byline ?? null,
    publisher: input.publisher ?? null,
    publishedAt: input.publishedAt ?? null,
    language: input.language ?? null,
    sourceKind: input.sourceKind,
    sourceUrl: input.sourceUrl,
    extractedAt: input.extractedAt,
    contentHash: await computeArticleBodyContentHash(input),
    wordCount: input.wordCount,
    readingTimeMinutes: input.readingTimeMinutes,
    qualityScore: input.qualityScore,
    qualityWarnings: input.qualityWarnings ?? [],
    sanitizedHtml: input.sanitizedHtml,
    plainText: input.plainText,
    blocks: input.blocks ?? [],
  };

  return ArticleBodyArtifactSchema.parse(artifact);
}

export async function verifyArticleBodyArtifactIntegrity(
  artifact: ArticleBodyArtifact
): Promise<boolean> {
  const parsed = ArticleBodyArtifactSchema.parse(artifact);
  const expected = await computeArticleBodyContentHash({
    extractorVersion: parsed.extractorVersion,
    itemId: parsed.itemId,
    canonicalUrl: parsed.canonicalUrl,
    title: parsed.title,
    byline: parsed.byline,
    publisher: parsed.publisher,
    publishedAt: parsed.publishedAt,
    language: parsed.language,
    sourceKind: parsed.sourceKind,
    sourceUrl: parsed.sourceUrl,
    extractedAt: parsed.extractedAt,
    wordCount: parsed.wordCount,
    readingTimeMinutes: parsed.readingTimeMinutes,
    qualityScore: parsed.qualityScore,
    qualityWarnings: parsed.qualityWarnings,
    sanitizedHtml: parsed.sanitizedHtml,
    plainText: parsed.plainText,
    blocks: parsed.blocks,
  });
  return expected === parsed.contentHash;
}
