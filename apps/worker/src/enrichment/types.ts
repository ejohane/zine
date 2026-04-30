import type { ContentType, Provider } from '@zine/shared';

export const ENRICHMENT_SCHEMA_VERSION = 1;
export const DEFAULT_ENRICHMENT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const DEFAULT_EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b';
export const DEFAULT_EMBEDDING_DIMENSIONS = 1024;

export type EnrichmentStatus = 'PENDING' | 'COMPLETE' | 'FAILED';
export type EnrichmentTrigger = 'manual_save' | 'inbox_bookmark' | 'backfill';
export type VectorVisibility = 'public' | 'user';
export type SuggestedTagKind = 'topic' | 'entity' | 'intent' | 'format';

export interface EnrichmentQueueMessage {
  itemId: string;
  userItemId: string;
  userId: string;
  trigger: EnrichmentTrigger;
  schemaVersion: number;
  contentHash: string;
  enqueuedAt: number;
}

export interface EnrichmentTopic {
  name: string;
  confidence: number;
}

export interface EnrichmentEntity {
  name: string;
  type: string;
  confidence: number;
}

export interface SuggestedTag {
  name: string;
  normalizedName: string;
  kind: SuggestedTagKind;
  confidence: number;
  matchedExistingTagId: string | null;
}

export interface ModelSuggestedTag {
  name: string;
  kind: SuggestedTagKind;
  confidence: number;
}

export interface EnrichmentModelOutput {
  summary: {
    short: string;
    detail: string;
  };
  classification: {
    primaryCategory: string;
    secondaryCategories: string[];
    intent: string;
    difficulty: string;
    evergreenScore: number;
    timeSensitivity: string;
  };
  topics: EnrichmentTopic[];
  entities: EnrichmentEntity[];
  suggestedTags: ModelSuggestedTag[];
  userContext: {
    inferredSaveIntent: string;
    reasonToRevisit: string;
  };
  confidence: {
    overall: number;
    summary: number;
    classification: number;
    tags: number;
  };
}

export interface EnrichmentSourceItem {
  id: string;
  title: string;
  canonicalUrl: string;
  contentType: ContentType | string;
  provider: Provider | string;
  publisher: string | null;
  summary: string | null;
  rawMetadata: string | null;
  articleContentKey: string | null;
}

export interface EnrichmentSourceCreator {
  name: string | null;
  description: string | null;
  handle: string | null;
}

export interface EnrichmentPromptInput {
  item: EnrichmentSourceItem;
  creator: EnrichmentSourceCreator | null;
  articleExcerpt: string | null;
}

export interface EmbeddingUpsertInput {
  itemId: string;
  userId: string;
  provider: string;
  contentType: string;
  primaryCategory: string | null;
  contentHash: string;
  text: string;
}
