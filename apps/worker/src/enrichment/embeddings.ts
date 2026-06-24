import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import { Provider } from '@zine/shared';

import type { Bindings } from '../types';
import type { Database } from '../db';
import { itemEmbeddingRefs } from '../db/schema';
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  type EmbeddingUpsertInput,
  type VectorVisibility,
} from './types';

type WorkersAIRun = {
  run(model: string, input: unknown): Promise<unknown>;
};

function getEmbeddingModel(env: Bindings): string {
  return env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

function getEmbeddingDimensions(env: Bindings): number {
  const parsed = Number(env.EMBEDDING_DIMENSIONS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EMBEDDING_DIMENSIONS;
}

function extractEmbedding(response: unknown): number[] {
  if (!response || typeof response !== 'object') {
    throw new Error('Embedding response was empty');
  }

  const record = response as Record<string, unknown>;
  const data = record.data;
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0] as number[];
  }
  if (Array.isArray(data) && typeof data[0] === 'number') {
    return data as number[];
  }

  const result = record.result;
  if (result && typeof result === 'object') {
    const nested = result as Record<string, unknown>;
    if (Array.isArray(nested.data) && Array.isArray(nested.data[0])) {
      return nested.data[0] as number[];
    }
  }

  throw new Error('Embedding response did not contain vector data');
}

export function getVectorVisibility(provider: string): VectorVisibility {
  return provider === Provider.GMAIL ? 'user' : 'public';
}

export function buildVectorId(input: Pick<EmbeddingUpsertInput, 'itemId' | 'userId' | 'provider'>) {
  return getVectorVisibility(input.provider) === 'user'
    ? `user:${input.userId}:item:${input.itemId}`
    : `item:${input.itemId}`;
}

export function buildVectorMetadata(
  input: Pick<
    EmbeddingUpsertInput,
    'itemId' | 'userId' | 'provider' | 'contentType' | 'primaryCategory'
  >,
  visibility: VectorVisibility
): NonNullable<VectorizeVector['metadata']> {
  const metadata: NonNullable<VectorizeVector['metadata']> = {
    itemId: input.itemId,
    provider: input.provider,
    contentType: input.contentType,
    visibility,
  };

  if (visibility === 'user') {
    metadata.userId = input.userId;
  }

  if (input.primaryCategory) {
    metadata.primaryCategory = input.primaryCategory;
  }

  return metadata;
}

export async function upsertItemEmbedding(
  db: Database,
  env: Bindings,
  input: EmbeddingUpsertInput
): Promise<void> {
  const ai = env.AI as unknown as WorkersAIRun | undefined;
  const index = env.ITEM_VECTORS;

  if (!ai) {
    throw new Error('Workers AI binding is not configured');
  }
  if (!index) {
    throw new Error('Vectorize binding is not configured');
  }

  const embeddingModel = getEmbeddingModel(env);
  const dimensions = getEmbeddingDimensions(env);
  const visibility = getVectorVisibility(input.provider);
  const vectorId = buildVectorId(input);
  const namespace = visibility === 'user' ? `user:${input.userId}` : 'public';

  const embedding = extractEmbedding(
    await ai.run(embeddingModel, {
      text: [input.text],
    })
  );

  await index.upsert([
    {
      id: vectorId,
      values: embedding,
      metadata: buildVectorMetadata(input, visibility),
    },
  ]);

  const now = Date.now();
  const existing = await db
    .select({ id: itemEmbeddingRefs.id })
    .from(itemEmbeddingRefs)
    .where(eq(itemEmbeddingRefs.vectorId, vectorId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(itemEmbeddingRefs)
      .set({
        itemId: input.itemId,
        userId: visibility === 'user' ? input.userId : null,
        namespace,
        embeddingModel,
        embeddingDimensions: dimensions,
        contentHash: input.contentHash,
        updatedAt: now,
      })
      .where(eq(itemEmbeddingRefs.id, existing[0].id));
    return;
  }

  await db.insert(itemEmbeddingRefs).values({
    id: ulid(),
    itemId: input.itemId,
    userId: visibility === 'user' ? input.userId : null,
    vectorId,
    namespace,
    embeddingModel,
    embeddingDimensions: dimensions,
    contentHash: input.contentHash,
    createdAt: now,
    updatedAt: now,
  });
}
