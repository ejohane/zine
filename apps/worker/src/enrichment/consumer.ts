import { ulid } from 'ulid';
import { and, desc, eq } from 'drizzle-orm';
import { normalizeTagKey, normalizeTagName } from '@zine/shared/tags';

import { createDb, type Database } from '../db';
import {
  creators,
  itemEnrichments,
  items,
  tags,
  userItemEnrichments,
  userItems,
} from '../db/schema';
import { getArticleContent } from '../lib/article-storage';
import { logger } from '../lib/logger';
import { syncPeopleForItem } from '../people/service';
import type { Bindings } from '../types';
import { upsertItemEmbedding } from './embeddings';
import { EnrichmentModelValidationError, enrichWithQwen } from './llm';
import { buildArticleExcerpt, buildEmbeddingText, buildPromptInput } from './prompt';
import { EnrichmentQueueMessageSchema } from './schema';
import { computeItemContentHash } from './service';
import {
  DEFAULT_ENRICHMENT_MODEL,
  type EnrichmentModelOutput,
  type EnrichmentQueueMessage,
  type EnrichmentSourceCreator,
  type EnrichmentSourceItem,
  type ModelSuggestedTag,
  type SuggestedTag,
} from './types';

const enrichmentLogger = logger.child('enrichment-consumer');

type EnrichmentMessage = Message<EnrichmentQueueMessage>;

function normalizeSuggestedTags(
  modelTags: ModelSuggestedTag[],
  existingTags: Array<{ id: string; name: string; normalizedName: string }>
): SuggestedTag[] {
  const existingByNormalized = new Map(existingTags.map((tag) => [tag.normalizedName, tag.id]));
  const deduped = new Map<string, SuggestedTag>();

  for (const tag of modelTags) {
    const name = normalizeTagName(tag.name);
    if (!name || name.length > 32) continue;

    const normalizedName = normalizeTagKey(name);
    if (deduped.has(normalizedName)) continue;

    deduped.set(normalizedName, {
      name,
      normalizedName,
      kind: tag.kind,
      confidence: tag.confidence,
      matchedExistingTagId: existingByNormalized.get(normalizedName) ?? null,
    });

    if (deduped.size >= 10) break;
  }

  return [...deduped.values()];
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function buildTagsFromCanonical(row: typeof itemEnrichments.$inferSelect): ModelSuggestedTag[] {
  const tagsFromTopics = parseJsonArray<{ name?: string; confidence?: number }>(row.topicsJson).map(
    (topic) => ({
      name: String(topic.name ?? ''),
      kind: 'topic' as const,
      confidence: typeof topic.confidence === 'number' ? topic.confidence : 0.6,
    })
  );
  const tagsFromEntities = parseJsonArray<{ name?: string; confidence?: number }>(
    row.entitiesJson
  ).map((entity) => ({
    name: String(entity.name ?? ''),
    kind: 'entity' as const,
    confidence: typeof entity.confidence === 'number' ? entity.confidence : 0.6,
  }));
  const intentTag = row.intent
    ? [{ name: row.intent, kind: 'intent' as const, confidence: 0.65 }]
    : [];

  return [...tagsFromTopics, ...tagsFromEntities, ...intentTag];
}

async function loadSource(
  db: Database,
  message: EnrichmentQueueMessage
): Promise<{
  item: EnrichmentSourceItem;
  creator: EnrichmentSourceCreator | null;
} | null> {
  const rows = await db
    .select({
      userItemId: userItems.id,
      itemId: items.id,
      title: items.title,
      canonicalUrl: items.canonicalUrl,
      contentType: items.contentType,
      provider: items.provider,
      publisher: items.publisher,
      summary: items.summary,
      rawMetadata: items.rawMetadata,
      articleContentKey: items.articleContentKey,
      creatorName: creators.name,
      creatorDescription: creators.description,
      creatorHandle: creators.handle,
    })
    .from(userItems)
    .innerJoin(items, eq(userItems.itemId, items.id))
    .leftJoin(creators, eq(items.creatorId, creators.id))
    .where(
      and(
        eq(userItems.id, message.userItemId),
        eq(userItems.userId, message.userId),
        eq(items.id, message.itemId)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    item: {
      id: row.itemId,
      title: row.title,
      canonicalUrl: row.canonicalUrl,
      contentType: row.contentType,
      provider: row.provider,
      publisher: row.publisher,
      summary: row.summary,
      rawMetadata: row.rawMetadata,
      articleContentKey: row.articleContentKey,
    },
    creator: row.creatorName
      ? {
          name: row.creatorName,
          description: row.creatorDescription,
          handle: row.creatorHandle,
        }
      : null,
  };
}

async function loadExistingTags(
  db: Database,
  userId: string
): Promise<Array<{ id: string; name: string; normalizedName: string }>> {
  return db
    .select({ id: tags.id, name: tags.name, normalizedName: tags.normalizedName })
    .from(tags)
    .where(eq(tags.userId, userId));
}

async function findCompleteCanonical(
  db: Database,
  message: EnrichmentQueueMessage
): Promise<typeof itemEnrichments.$inferSelect | null> {
  const rows = await db
    .select()
    .from(itemEnrichments)
    .where(
      and(
        eq(itemEnrichments.itemId, message.itemId),
        eq(itemEnrichments.schemaVersion, message.schemaVersion),
        eq(itemEnrichments.contentHash, message.contentHash),
        eq(itemEnrichments.status, 'COMPLETE')
      )
    )
    .orderBy(desc(itemEnrichments.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

async function upsertCanonicalPending(db: Database, message: EnrichmentQueueMessage) {
  const now = Date.now();
  await db
    .insert(itemEnrichments)
    .values({
      id: ulid(),
      itemId: message.itemId,
      schemaVersion: message.schemaVersion,
      contentHash: message.contentHash,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [itemEnrichments.itemId, itemEnrichments.schemaVersion, itemEnrichments.contentHash],
      set: {
        status: 'PENDING',
        errorMessage: null,
        updatedAt: now,
      },
    });
}

async function writeCanonicalComplete(
  db: Database,
  message: EnrichmentQueueMessage,
  output: EnrichmentModelOutput,
  env: Bindings
) {
  const now = Date.now();
  await db
    .insert(itemEnrichments)
    .values({
      id: ulid(),
      itemId: message.itemId,
      schemaVersion: message.schemaVersion,
      contentHash: message.contentHash,
      status: 'COMPLETE',
      modelProvider: 'cloudflare-workers-ai',
      modelName: env.ENRICHMENT_MODEL || DEFAULT_ENRICHMENT_MODEL,
      summaryShort: output.summary.short,
      summaryDetail: output.summary.detail,
      primaryCategory: output.classification.primaryCategory,
      secondaryCategoriesJson: JSON.stringify(output.classification.secondaryCategories),
      topicsJson: JSON.stringify(output.topics),
      entitiesJson: JSON.stringify(output.entities),
      intent: output.classification.intent,
      difficulty: output.classification.difficulty,
      evergreenScore: output.classification.evergreenScore,
      timeSensitivity: output.classification.timeSensitivity,
      confidenceJson: JSON.stringify(output.confidence),
      createdAt: now,
      updatedAt: now,
      enrichedAt: now,
    })
    .onConflictDoUpdate({
      target: [itemEnrichments.itemId, itemEnrichments.schemaVersion, itemEnrichments.contentHash],
      set: {
        status: 'COMPLETE',
        modelProvider: 'cloudflare-workers-ai',
        modelName: env.ENRICHMENT_MODEL || DEFAULT_ENRICHMENT_MODEL,
        summaryShort: output.summary.short,
        summaryDetail: output.summary.detail,
        primaryCategory: output.classification.primaryCategory,
        secondaryCategoriesJson: JSON.stringify(output.classification.secondaryCategories),
        topicsJson: JSON.stringify(output.topics),
        entitiesJson: JSON.stringify(output.entities),
        intent: output.classification.intent,
        difficulty: output.classification.difficulty,
        evergreenScore: output.classification.evergreenScore,
        timeSensitivity: output.classification.timeSensitivity,
        confidenceJson: JSON.stringify(output.confidence),
        errorMessage: null,
        updatedAt: now,
        enrichedAt: now,
      },
    });
}

async function writeCanonicalFailed(db: Database, message: EnrichmentQueueMessage, error: unknown) {
  const now = Date.now();
  const messageText = error instanceof Error ? error.message : String(error);
  await db
    .insert(itemEnrichments)
    .values({
      id: ulid(),
      itemId: message.itemId,
      schemaVersion: message.schemaVersion,
      contentHash: message.contentHash,
      status: 'FAILED',
      errorMessage: messageText,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [itemEnrichments.itemId, itemEnrichments.schemaVersion, itemEnrichments.contentHash],
      set: {
        status: 'FAILED',
        errorMessage: messageText,
        updatedAt: now,
      },
    });
}

async function writeUserComplete(
  db: Database,
  message: EnrichmentQueueMessage,
  input: {
    suggestedTags: SuggestedTag[];
    inferredSaveIntent: string | null;
    reasonToRevisit: string | null;
  }
) {
  const now = Date.now();
  await db
    .insert(userItemEnrichments)
    .values({
      id: ulid(),
      userId: message.userId,
      userItemId: message.userItemId,
      itemId: message.itemId,
      schemaVersion: message.schemaVersion,
      suggestedTagsJson: JSON.stringify(input.suggestedTags),
      inferredSaveIntent: input.inferredSaveIntent,
      reasonToRevisit: input.reasonToRevisit,
      status: 'COMPLETE',
      createdAt: now,
      updatedAt: now,
      enrichedAt: now,
    })
    .onConflictDoUpdate({
      target: [userItemEnrichments.userItemId, userItemEnrichments.schemaVersion],
      set: {
        suggestedTagsJson: JSON.stringify(input.suggestedTags),
        inferredSaveIntent: input.inferredSaveIntent,
        reasonToRevisit: input.reasonToRevisit,
        status: 'COMPLETE',
        errorMessage: null,
        updatedAt: now,
        enrichedAt: now,
      },
    });
}

async function writeUserFailed(db: Database, message: EnrichmentQueueMessage, error: unknown) {
  const now = Date.now();
  const messageText = error instanceof Error ? error.message : String(error);
  await db
    .insert(userItemEnrichments)
    .values({
      id: ulid(),
      userId: message.userId,
      userItemId: message.userItemId,
      itemId: message.itemId,
      schemaVersion: message.schemaVersion,
      status: 'FAILED',
      errorMessage: messageText,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userItemEnrichments.userItemId, userItemEnrichments.schemaVersion],
      set: {
        status: 'FAILED',
        errorMessage: messageText,
        updatedAt: now,
      },
    });
}

async function processMessage(message: EnrichmentMessage, db: Database, env: Bindings) {
  const parsed = EnrichmentQueueMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    enrichmentLogger.error('Invalid enrichment message body', {
      messageId: message.id,
      error: parsed.error.message,
    });
    message.ack();
    return;
  }

  const body = parsed.data;
  const source = await loadSource(db, body);
  if (!source) {
    enrichmentLogger.warn('Enrichment source item missing; acking message', {
      messageId: message.id,
      itemId: body.itemId,
      userItemId: body.userItemId,
    });
    message.ack();
    return;
  }

  const contentHash = computeItemContentHash({
    title: source.item.title,
    canonicalUrl: source.item.canonicalUrl,
    contentType: String(source.item.contentType),
    provider: String(source.item.provider),
    publisher: source.item.publisher,
    summary: source.item.summary,
    creatorName: source.creator?.name ?? null,
    articleContentKey: source.item.articleContentKey,
  });
  const effectiveBody = { ...body, contentHash };
  const existingTags = await loadExistingTags(db, body.userId);
  const existingCanonical = await findCompleteCanonical(db, effectiveBody);

  try {
    if (existingCanonical) {
      const suggestions = normalizeSuggestedTags(
        buildTagsFromCanonical(existingCanonical),
        existingTags
      );

      await writeUserComplete(db, effectiveBody, {
        suggestedTags: suggestions,
        inferredSaveIntent: 'Saved for later reference',
        reasonToRevisit: existingCanonical.summaryShort,
      });

      try {
        await syncPeopleForItem(db, { itemId: effectiveBody.itemId });
      } catch (error) {
        enrichmentLogger.warn('People indexing failed for existing canonical enrichment', {
          itemId: effectiveBody.itemId,
          error,
        });
      }

      message.ack();
      return;
    }

    await upsertCanonicalPending(db, effectiveBody);

    const articleContent = source.item.articleContentKey
      ? await getArticleContent(env.ARTICLE_CONTENT, source.item.id)
      : null;
    const promptInput = buildPromptInput({
      item: source.item,
      creator: source.creator,
      articleContent,
    });
    const output = await enrichWithQwen(env, promptInput);

    await writeCanonicalComplete(db, effectiveBody, output, env);

    try {
      await syncPeopleForItem(db, { itemId: effectiveBody.itemId });
    } catch (error) {
      enrichmentLogger.warn('People indexing failed after enrichment completion', {
        itemId: effectiveBody.itemId,
        error,
      });
    }

    const suggestedTags = normalizeSuggestedTags(output.suggestedTags, existingTags);
    await writeUserComplete(db, effectiveBody, {
      suggestedTags,
      inferredSaveIntent: output.userContext.inferredSaveIntent,
      reasonToRevisit: output.userContext.reasonToRevisit,
    });

    await upsertItemEmbedding(db, env, {
      itemId: source.item.id,
      userId: body.userId,
      provider: String(source.item.provider),
      contentType: String(source.item.contentType),
      primaryCategory: output.classification.primaryCategory,
      contentHash,
      text: buildEmbeddingText({
        item: source.item,
        creator: source.creator,
        output,
        articleExcerpt: buildArticleExcerpt(articleContent),
      }),
    });

    message.ack();
  } catch (error) {
    if (error instanceof EnrichmentModelValidationError) {
      await writeCanonicalFailed(db, effectiveBody, error);
      await writeUserFailed(db, effectiveBody, error);
      message.ack();
      return;
    }

    enrichmentLogger.warn('Retrying enrichment message after transient failure', {
      messageId: message.id,
      attempts: message.attempts,
      itemId: body.itemId,
      userItemId: body.userItemId,
      error,
    });
    message.retry();
  }
}

export async function handleEnrichmentQueue(
  batch: MessageBatch<EnrichmentQueueMessage>,
  env: Bindings
): Promise<void> {
  enrichmentLogger.info('Processing enrichment queue batch', {
    messageCount: batch.messages.length,
    queue: batch.queue,
  });

  await Promise.all(
    batch.messages.map((message) => processMessage(message, createDb(env.DB), env))
  );
}

export async function handleEnrichmentDLQ(
  batch: MessageBatch<EnrichmentQueueMessage>,
  _env: Bindings
): Promise<void> {
  enrichmentLogger.error('Enrichment messages reached DLQ', {
    messageCount: batch.messages.length,
    queue: batch.queue,
    messageIds: batch.messages.map((message) => message.id),
  });

  for (const message of batch.messages) {
    message.ack();
  }
}

export const enrichmentConsumerInternals = {
  normalizeSuggestedTags,
  buildTagsFromCanonical,
};
