import { savedItemVisibilitySql } from './saved-item-visibility';
import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import {
  HomeCompositionSchema,
  type HomeComposition,
} from '../../../../packages/shared/src/home-composition';
import { createDb } from '../db';
import { userItems, items, creators } from '../db/schema';
import { toHomeItemViews } from '../items/views';
import type { Bindings } from '../types';

const visibility = sql.raw(
  savedItemVisibilitySql.replace(/\bi\./g, 'items.').replace(/\bui\./g, 'user_items.')
);

const key = (userId: string) => `home-compositions/${encodeURIComponent(userId)}/current.json`;

export async function resolveHomeComposition(
  env: Bindings,
  userId: string,
  composition: HomeComposition
) {
  const ids = [...new Set(composition.sections.flatMap((s) => s.itemIds))];
  // D1 limits statement bindings; reserve room for ownership/state predicates.
  const batches = Array.from({ length: Math.ceil(ids.length / 80) }, (_, index) =>
    ids.slice(index * 80, (index + 1) * 80)
  );
  const rows = (
    await Promise.all(
      batches.map(async (batch) => {
        return createDb(env.DB)
          .select()
          .from(userItems)
          .innerJoin(items, eq(userItems.itemId, items.id))
          .leftJoin(creators, eq(items.creatorId, creators.id))
          .where(
            and(
              eq(userItems.userId, userId),
              inArray(userItems.id, batch),
              inArray(userItems.state, ['BOOKMARKED', 'INBOX']),
              eq(userItems.isFinished, false),
              visibility
            )
          );
      })
    )
  ).flat();
  return { composition, compositionItems: toHomeItemViews(rows) };
}

export async function getHomeComposition(env: Bindings, userId: string) {
  const object = await env.ARTICLE_CONTENT.get(key(userId));
  if (!object) return { composition: null, compositionItems: [] };
  const parsed = HomeCompositionSchema.safeParse(await object.json().catch(() => null));
  // A future/invalid composition must not prevent normal Home from loading.
  if (!parsed.success) return { composition: null, compositionItems: [] };
  return resolveHomeComposition(env, userId, parsed.data);
}

export async function prepareHomeComposition(env: Bindings, userId: string, input: unknown) {
  const composition = HomeCompositionSchema.parse(input);
  const resolved = await resolveHomeComposition(env, userId, composition);
  const available = new Set(resolved.compositionItems.map((i) => i.id));
  const unavailableItemIds = [...new Set(composition.sections.flatMap((s) => s.itemIds))].filter(
    (id) => !available.has(id)
  );
  const incompatibleItemIds = composition.sections
    .filter((s) => s.card === 'featured')
    .flatMap((s) => s.itemIds)
    .filter((id) => {
      const item = resolved.compositionItems.find((i) => i.id === id);
      return item && item.contentType !== 'ARTICLE';
    });
  return {
    ...resolved,
    valid: unavailableItemIds.length === 0 && incompatibleItemIds.length === 0,
    unavailableItemIds,
    incompatibleItemIds,
  };
}

export async function publishHomeComposition(env: Bindings, userId: string, input: unknown) {
  const prepared = await prepareHomeComposition(env, userId, input);
  if (!prepared.valid) return { ...prepared, published: false };
  await env.ARTICLE_CONTENT.put(key(userId), JSON.stringify(prepared.composition), {
    httpMetadata: { contentType: 'application/json' },
  });
  // A readback error cannot turn a completed write into a reported failure.
  try {
    const current = await getHomeComposition(env, userId);
    return {
      published: true,
      verified: JSON.stringify(current.composition) === JSON.stringify(prepared.composition),
      ...current,
    };
  } catch {
    return { published: true, verified: false, composition: prepared.composition };
  }
}

export async function getHomeCandidates(env: Bindings, userId: string) {
  const rows = await createDb(env.DB)
    .select()
    .from(userItems)
    .innerJoin(items, eq(userItems.itemId, items.id))
    .leftJoin(creators, eq(items.creatorId, creators.id))
    .where(
      and(
        eq(userItems.userId, userId),
        inArray(userItems.state, ['BOOKMARKED', 'INBOX']),
        eq(userItems.isFinished, false),
        visibility
      )
    )
    .orderBy(desc(userItems.ingestedAt), desc(userItems.id))
    .limit(100);
  return { items: toHomeItemViews(rows) };
}
