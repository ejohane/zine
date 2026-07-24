import { ArticleBodyArtifactSchema } from './schema';
import { verifyArticleBodyArtifactIntegrity } from './artifact';
import type { ArticleBodyArtifact } from './types';

function hashPathSegment(contentHash: string): string {
  return contentHash.replace(/^sha256:/, '');
}

export function getArticleBodyArtifactKey(itemId: string, contentHash: string): string {
  return `articles/v2/${encodeURIComponent(itemId)}/${hashPathSegment(contentHash)}.json`;
}

export async function putArticleBodyArtifact(
  bucket: R2Bucket,
  artifact: ArticleBodyArtifact
): Promise<{ key: string; created: boolean }> {
  const parsed = ArticleBodyArtifactSchema.parse(artifact);
  if (!(await verifyArticleBodyArtifactIntegrity(parsed))) {
    throw new Error('Article body artifact content hash does not match its payload');
  }

  const key = getArticleBodyArtifactKey(parsed.itemId, parsed.contentHash);
  const existing = await bucket.get(key);
  if (existing) {
    const existingArtifact = ArticleBodyArtifactSchema.parse(await existing.json());
    if (!(await verifyArticleBodyArtifactIntegrity(existingArtifact))) {
      throw new Error(`Existing article body artifact failed integrity verification: ${key}`);
    }
    if (
      existingArtifact.itemId !== parsed.itemId ||
      existingArtifact.contentHash !== parsed.contentHash
    ) {
      throw new Error(
        `Existing article body artifact does not match its content-addressed key: ${key}`
      );
    }
    return { key, created: false };
  }

  await bucket.put(key, JSON.stringify(parsed), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      itemId: parsed.itemId,
      contentHash: parsed.contentHash,
      schemaVersion: String(parsed.schemaVersion),
      extractorVersion: String(parsed.extractorVersion),
      sourceKind: parsed.sourceKind,
      storedAt: new Date().toISOString(),
    },
  });

  return { key, created: true };
}

export async function getArticleBodyArtifact(
  bucket: R2Bucket,
  key: string
): Promise<ArticleBodyArtifact | null> {
  const object = await bucket.get(key);
  if (!object) return null;

  const artifact = ArticleBodyArtifactSchema.parse(await object.json());
  if (!(await verifyArticleBodyArtifactIntegrity(artifact))) {
    throw new Error(`Article body artifact failed integrity verification: ${key}`);
  }
  if (getArticleBodyArtifactKey(artifact.itemId, artifact.contentHash) !== key) {
    throw new Error(`Article body artifact does not match its content-addressed key: ${key}`);
  }
  return artifact;
}
