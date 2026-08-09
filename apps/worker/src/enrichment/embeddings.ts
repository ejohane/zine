import { ulid } from 'ulid';
import { eq, inArray } from 'drizzle-orm';
import { Provider } from '@zine/shared';
import { createHash } from 'node:crypto';

import type { Bindings } from '../types';
import type { Database } from '../db';
import { itemEmbeddingRefs } from '../db/schema';
import {
  type ChunkEmbeddingUpsertInput,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  type EmbeddingUpsertInput,
  type VectorVisibility,
} from './types';

type WorkersAIRun = {
  run(model: string, input: unknown): Promise<unknown>;
};

type VectorizeUpsert = {
  upsert(
    vectors: Array<{
      id: string;
      values: number[];
      metadata?: Record<string, unknown>;
    }>
  ): Promise<unknown>;
  deleteByIds?(ids: string[]): Promise<unknown>;
};

const EMBEDDING_BATCH_SIZE = 32;

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

function extractEmbeddings(response: unknown): number[][] {
  if (!response || typeof response !== 'object') {
    throw new Error('Embedding response was empty');
  }
  const record = response as Record<string, unknown>;
  const candidates = [record.data];
  if (record.result && typeof record.result === 'object') {
    candidates.push((record.result as Record<string, unknown>).data);
  }
  for (const data of candidates) {
    if (Array.isArray(data) && data.every((value) => Array.isArray(value))) {
      return data as number[][];
    }
    if (Array.isArray(data) && data.every((value) => typeof value === 'number')) {
      return [data as number[]];
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

export function buildChunkVectorId(
  input: Pick<ChunkEmbeddingUpsertInput, 'itemId' | 'userId' | 'provider' | 'sourceContentHash'> & {
    ordinal: number;
  }
) {
  const base = buildVectorId(input);
  const digest = createHash('sha256')
    .update(`${base}\n${input.sourceContentHash}\n${input.ordinal}`)
    .digest('hex');
  return `chunk:${digest.slice(0, 58)}`;
}

async function upsertEmbeddingRef(
  db: Database,
  input: {
    itemId: string;
    userId: string | null;
    vectorId: string;
    namespace: string;
    embeddingModel: string;
    embeddingDimensions: number;
    contentHash: string;
  }
): Promise<void> {
  const now = Date.now();
  const existing = await db
    .select({ id: itemEmbeddingRefs.id })
    .from(itemEmbeddingRefs)
    .where(eq(itemEmbeddingRefs.vectorId, input.vectorId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(itemEmbeddingRefs)
      .set({
        itemId: input.itemId,
        userId: input.userId,
        namespace: input.namespace,
        embeddingModel: input.embeddingModel,
        embeddingDimensions: input.embeddingDimensions,
        contentHash: input.contentHash,
        updatedAt: now,
      })
      .where(eq(itemEmbeddingRefs.id, existing[0].id));
    return;
  }

  await db.insert(itemEmbeddingRefs).values({
    id: ulid(),
    ...input,
    createdAt: now,
    updatedAt: now,
  });
}

export async function upsertItemEmbedding(
  db: Database,
  env: Bindings,
  input: EmbeddingUpsertInput
): Promise<void> {
  const ai = env.AI as unknown as WorkersAIRun | undefined;
  const index = env.ITEM_VECTORS as unknown as VectorizeUpsert | undefined;

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
      metadata: {
        itemId: input.itemId,
        userId: visibility === 'user' ? input.userId : null,
        provider: input.provider,
        contentType: input.contentType,
        primaryCategory: input.primaryCategory,
        visibility,
      },
    },
  ]);

  await upsertEmbeddingRef(db, {
    itemId: input.itemId,
    userId: visibility === 'user' ? input.userId : null,
    vectorId,
    namespace,
    embeddingModel,
    embeddingDimensions: dimensions,
    contentHash: input.contentHash,
  });
}

export async function upsertItemChunkEmbeddings(
  db: Database,
  env: Bindings,
  input: ChunkEmbeddingUpsertInput
): Promise<void> {
  if (input.chunks.length === 0) return;
  const ai = env.AI as unknown as WorkersAIRun | undefined;
  const index = env.ITEM_VECTORS as unknown as VectorizeUpsert | undefined;
  if (!ai) throw new Error('Workers AI binding is not configured');
  if (!index) throw new Error('Vectorize binding is not configured');

  const embeddingModel = getEmbeddingModel(env);
  const dimensions = getEmbeddingDimensions(env);
  const visibility = getVectorVisibility(input.provider);
  const namespace = visibility === 'user' ? `user:${input.userId}` : 'public';
  const vectors: number[][] = [];
  for (let offset = 0; offset < input.chunks.length; offset += EMBEDDING_BATCH_SIZE) {
    vectors.push(
      ...extractEmbeddings(
        await ai.run(embeddingModel, {
          text: input.chunks
            .slice(offset, offset + EMBEDDING_BATCH_SIZE)
            .map((chunk) => chunk.text),
        })
      )
    );
  }
  if (vectors.length !== input.chunks.length) {
    throw new Error(
      `Embedding response count ${vectors.length} did not match article chunk count ${input.chunks.length}`
    );
  }

  const vectorRows = input.chunks.map((chunk, indexValue) => ({
    id: buildChunkVectorId({ ...input, ordinal: chunk.ordinal }),
    values: vectors[indexValue],
    metadata: {
      itemId: input.itemId,
      userId: visibility === 'user' ? input.userId : null,
      provider: input.provider,
      contentType: input.contentType,
      primaryCategory: input.primaryCategory,
      visibility,
      vectorKind: 'article_chunk',
      chunkOrdinal: chunk.ordinal,
      sourceContentHash: input.sourceContentHash,
      blockIds: chunk.blockIds.join(',').slice(0, 2_000),
    },
  }));
  await index.upsert(vectorRows);

  for (const vector of vectorRows) {
    await upsertEmbeddingRef(db, {
      itemId: input.itemId,
      userId: visibility === 'user' ? input.userId : null,
      vectorId: vector.id,
      namespace,
      embeddingModel,
      embeddingDimensions: dimensions,
      contentHash: input.contentHash,
    });
  }

  const currentIds = new Set(vectorRows.map((vector) => vector.id));
  const legacyChunkVectorPrefix = `${buildVectorId(input)}:content:`;
  const existingRefs = await db
    .select({ id: itemEmbeddingRefs.id, vectorId: itemEmbeddingRefs.vectorId })
    .from(itemEmbeddingRefs)
    .where(eq(itemEmbeddingRefs.itemId, input.itemId));
  const stale = existingRefs.filter(
    (reference) =>
      (reference.vectorId.startsWith('chunk:') ||
        reference.vectorId.startsWith(legacyChunkVectorPrefix)) &&
      !currentIds.has(reference.vectorId)
  );
  if (stale.length > 0) {
    if (index.deleteByIds) await index.deleteByIds(stale.map((reference) => reference.vectorId));
    await db.delete(itemEmbeddingRefs).where(
      inArray(
        itemEmbeddingRefs.id,
        stale.map((reference) => reference.id)
      )
    );
  }
}

export const embeddingInternals = { extractEmbedding, extractEmbeddings };
