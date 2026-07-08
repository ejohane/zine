import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import { normalizeTagKey, normalizeTagName } from '@zine/shared/tags';
import { tags, userItems, userItemTags } from '../db/schema';
import type { Database } from '../db';

export type AssignedTag = {
  id: string;
  name: string;
};

type TaggingContext = {
  db: Database;
  userId: string;
};

function normalizeRequestedTags(
  tagNames: string[]
): Array<{ normalizedName: string; name: string }> {
  const normalizedMap = new Map<string, string>();

  for (const rawTag of tagNames) {
    const normalizedName = normalizeTagName(rawTag);
    const normalizedKey = normalizeTagKey(rawTag);

    if (!normalizedName) {
      continue;
    }
    if (normalizedName.length > 32) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Tag "${normalizedName}" exceeds 32 characters`,
      });
    }

    if (!normalizedMap.has(normalizedKey)) {
      normalizedMap.set(normalizedKey, normalizedName);
    }
  }

  return Array.from(normalizedMap.entries()).map(([normalizedName, name]) => ({
    normalizedName,
    name,
  }));
}

async function findOrCreateTags(
  ctx: TaggingContext,
  tagNames: string[],
  nowMs: number
): Promise<AssignedTag[]> {
  const desiredTags = normalizeRequestedTags(tagNames);

  const existingTags =
    desiredTags.length > 0
      ? await ctx.db
          .select({
            id: tags.id,
            name: tags.name,
            normalizedName: tags.normalizedName,
          })
          .from(tags)
          .where(
            and(
              eq(tags.userId, ctx.userId),
              inArray(
                tags.normalizedName,
                desiredTags.map((tag) => tag.normalizedName)
              )
            )
          )
      : [];

  const existingTagsByNormalized = new Map(
    existingTags.map((tag) => [tag.normalizedName, { id: tag.id, name: tag.name }])
  );

  const finalTags: AssignedTag[] = [];

  for (const desiredTag of desiredTags) {
    const existingTag = existingTagsByNormalized.get(desiredTag.normalizedName);

    if (existingTag) {
      await ctx.db
        .update(tags)
        .set({
          name: desiredTag.name,
          updatedAt: nowMs,
        })
        .where(eq(tags.id, existingTag.id));

      finalTags.push({ id: existingTag.id, name: desiredTag.name });
      continue;
    }

    const tagId = ulid();
    await ctx.db.insert(tags).values({
      id: tagId,
      userId: ctx.userId,
      name: desiredTag.name,
      normalizedName: desiredTag.normalizedName,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    finalTags.push({ id: tagId, name: desiredTag.name });
  }

  return finalTags;
}

export async function replaceTagsForUserItem(
  ctx: TaggingContext,
  userItemId: string,
  tagNames: string[]
): Promise<AssignedTag[]> {
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();
  const finalTags = await findOrCreateTags(ctx, tagNames, nowMs);

  await ctx.db.delete(userItemTags).where(eq(userItemTags.userItemId, userItemId));

  if (finalTags.length > 0) {
    await ctx.db.insert(userItemTags).values(
      finalTags.map((tag) => ({
        id: ulid(),
        userItemId,
        tagId: tag.id,
        createdAt: nowMs,
      }))
    );
  }

  await ctx.db
    .update(userItems)
    .set({
      updatedAt: nowIso,
    })
    .where(eq(userItems.id, userItemId));

  return finalTags;
}

export async function mergeTagsForUserItem(
  ctx: TaggingContext,
  userItemId: string,
  tagNames: string[]
): Promise<AssignedTag[]> {
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();
  const submittedTags = await findOrCreateTags(ctx, tagNames, nowMs);

  if (submittedTags.length > 0) {
    const existingAssignments = await ctx.db
      .select({ tagId: userItemTags.tagId })
      .from(userItemTags)
      .where(eq(userItemTags.userItemId, userItemId));
    const existingTagIds = new Set(existingAssignments.map((assignment) => assignment.tagId));
    const tagsToAssign = submittedTags.filter((tag) => !existingTagIds.has(tag.id));

    if (tagsToAssign.length > 0) {
      await ctx.db.insert(userItemTags).values(
        tagsToAssign.map((tag) => ({
          id: ulid(),
          userItemId,
          tagId: tag.id,
          createdAt: nowMs,
        }))
      );
    }
  }

  await ctx.db
    .update(userItems)
    .set({
      updatedAt: nowIso,
    })
    .where(eq(userItems.id, userItemId));

  return submittedTags;
}
