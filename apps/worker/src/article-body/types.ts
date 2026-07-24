export const ARTICLE_BODY_SCHEMA_VERSION = 1;
export const ARTICLE_BODY_EXTRACTOR_VERSION = 8;

export type ArticleBodyStatus = 'PENDING' | 'PROCESSING' | 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';

export type ArticleBodyAvailability = 'PENDING' | 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';

export type ArticleBodySourceKind =
  | 'LEGACY'
  | 'RSS_FULL'
  | 'ATOM_FULL'
  | 'PUBLIC_WEB'
  | 'PUBLIC_NEWSLETTER'
  | 'BROWSER_RENDERED';

export type ArticleBodyTrigger = 'ingestion' | 'bookmark' | 'reader_open' | 'backfill' | 'repair';

export type ArticleBodyEnrollmentMode = 'off' | 'reader' | 'saved' | 'all';

export interface ArticleBodyBlock {
  id: string;
  kind: string;
  text: string;
}

export interface ArticleBodyArtifact {
  schemaVersion: number;
  extractorVersion: number;
  itemId: string;
  canonicalUrl: string;
  title: string;
  byline: string | null;
  publisher: string | null;
  publishedAt: string | null;
  language: string | null;
  sourceKind: ArticleBodySourceKind;
  sourceUrl: string;
  extractedAt: number;
  contentHash: string;
  wordCount: number;
  readingTimeMinutes: number;
  qualityScore: number;
  qualityWarnings: string[];
  sanitizedHtml: string;
  plainText: string;
  blocks: ArticleBodyBlock[];
}

export interface ArticleBodyEmbeddedCandidate {
  html: string;
  sourceKind: Extract<ArticleBodySourceKind, 'RSS_FULL' | 'ATOM_FULL' | 'PUBLIC_NEWSLETTER'>;
  sourceUrl: string;
}

export interface ArticleBodyQueueMessage {
  itemId: string;
  extractorVersion: number;
  trigger: ArticleBodyTrigger;
  enqueuedAt: number;
  traceId?: string;
  embeddedCandidates?: ArticleBodyEmbeddedCandidate[];
}

export interface ArticleBodyPublicStatus {
  availability: ArticleBodyAvailability;
  pipelineStatus: ArticleBodyStatus | 'LEGACY' | 'NOT_REQUESTED';
  schemaVersion: number | null;
  extractorVersion: number | null;
  sourceKind: ArticleBodySourceKind | null;
  contentHash: string | null;
  wordCount: number | null;
  readingTimeMinutes: number | null;
  qualityScore: number | null;
  qualityWarnings: string[];
  lastErrorCode: string | null;
  updatedAt: string | null;
}
