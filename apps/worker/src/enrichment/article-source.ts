import type { Database } from '../db';
import { getArticleBodyStatus } from '../article-body/service';
import { getArticleBodyArtifact } from '../article-body/storage';
import type { ArticleBodyArtifact } from '../article-body/types';
import { getArticleContent } from '../lib/article-storage';
import type { EnrichmentSourceEvidence, EnrichmentSourceItem } from './types';

const LEGACY_BLOCK_ID = 'legacy-body';

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function evidenceFromArticleArtifact(
  artifact: ArticleBodyArtifact,
  status: 'AVAILABLE' | 'DEGRADED'
): EnrichmentSourceEvidence {
  return {
    coverage: status === 'AVAILABLE' ? 'FULL_CONTENT' : 'PARTIAL_CONTENT',
    sourceKind: artifact.sourceKind,
    contentHash: artifact.contentHash,
    wordCount: artifact.wordCount,
    qualityScore: artifact.qualityScore,
    qualityWarnings: artifact.qualityWarnings,
    blocks: artifact.blocks
      .map((block) => ({ id: block.id, kind: block.kind, text: block.text.trim() }))
      .filter((block) => block.text.length > 0),
  };
}

async function evidenceFromLegacyContent(content: string): Promise<EnrichmentSourceEvidence> {
  const text = stripHtml(content);
  return {
    coverage: 'PARTIAL_CONTENT',
    sourceKind: 'LEGACY',
    contentHash: text ? await sha256(text) : null,
    wordCount: text ? text.split(/\s+/u).length : 0,
    qualityScore: null,
    qualityWarnings: ['LEGACY_UNNORMALIZED'],
    blocks: text ? [{ id: LEGACY_BLOCK_ID, kind: 'article', text }] : [],
  };
}

export function metadataEnrichmentSource(item: EnrichmentSourceItem): EnrichmentSourceEvidence {
  return {
    coverage: item.summary?.trim() ? 'DESCRIPTION_ONLY' : 'METADATA_ONLY',
    sourceKind: item.summary?.trim() ? 'DESCRIPTION' : 'METADATA',
    contentHash: null,
    wordCount: null,
    qualityScore: null,
    qualityWarnings: [],
    blocks: [],
  };
}

export async function resolveArticleEnrichmentSource(
  db: Database,
  bucket: R2Bucket,
  item: EnrichmentSourceItem
): Promise<EnrichmentSourceEvidence> {
  const status = await getArticleBodyStatus(db, item.id);
  if (status?.r2Key) {
    const artifact = await getArticleBodyArtifact(bucket, status.r2Key);
    if (artifact) {
      return evidenceFromArticleArtifact(
        artifact,
        status.status === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED'
      );
    }
  }

  if (item.articleContentKey) {
    const legacyContent = await getArticleContent(bucket, item.id);
    if (legacyContent) return evidenceFromLegacyContent(legacyContent);
  }

  return metadataEnrichmentSource(item);
}

export const articleSourceInternals = {
  evidenceFromLegacyContent,
  metadataEvidence: metadataEnrichmentSource,
  sha256,
  stripHtml,
};
