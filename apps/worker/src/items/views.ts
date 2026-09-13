import type { ContentType, UserItemState } from '@zine/shared';
import {
  Provider,
  hasSubstackNewsletterIdentity,
  isJsonObject,
  isSubstackArticleUrl,
  type JsonObject,
} from '@zine/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db';
import type { creators, items, userItems } from '../db/schema';
import { tags, userItemTags } from '../db/schema';
import { buildNewsletterAvatarUrl } from '../newsletters/avatar';

export type ItemTag = {
  id: string;
  name: string;
};

/**
 * Combined view of Item + UserItem for API responses.
 * This flattens the joined data for easier consumption by the mobile client.
 */
export type ItemView = {
  // Identifiers
  id: string; // UserItem ID (for mutations)
  itemId: string; // Canonical Item ID

  // Display
  title: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;

  // Classification
  contentType: ContentType;
  provider: Provider;

  // Attribution
  creator: string;
  creatorImageUrl: string | null;
  creatorId: string | null;
  publisher: string | null;

  // Metadata
  summary: string | null;
  duration: number | null; // seconds
  publishedAt: string | null;

  // Article-specific metadata
  wordCount: number | null;
  readingTimeMinutes: number | null;

  // User state
  state: UserItemState;
  ingestedAt: string;
  bookmarkedAt: string | null;
  lastOpenedAt: string | null;

  // Progress
  progress: {
    position: number;
    duration: number;
    percent: number;
  } | null;

  // Consumption tracking
  isFinished: boolean;
  finishedAt: string | null;

  // Optional user-defined organization
  tags: ItemTag[];
};

type HomeItemView = Pick<
  ItemView,
  | 'id'
  | 'itemId'
  | 'title'
  | 'thumbnailUrl'
  | 'canonicalUrl'
  | 'contentType'
  | 'provider'
  | 'creator'
  | 'creatorImageUrl'
  | 'creatorId'
  | 'publisher'
  | 'summary'
  | 'duration'
  | 'publishedAt'
  | 'readingTimeMinutes'
  | 'bookmarkedAt'
  | 'lastOpenedAt'
  | 'progress'
>;

// Helper Functions

/**
 * Normalize a string value that might contain the literal string "null" to actual null.
 * This handles legacy data where null values were stored as the string "null".
 */
export function normalizeNullString(value: string | null): string | null {
  if (value === 'null' || value === null) {
    return null;
  }
  return value;
}

function normalizeCanonicalUrlForResponse(url: string): string {
  if (!url) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const isOpenSubstack =
      parsed.hostname === 'open.substack.com' || parsed.hostname.endsWith('.open.substack.com');
    if (!isOpenSubstack) {
      return url;
    }

    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.length >= 4 && pathSegments[0] === 'pub' && pathSegments[2] === 'p') {
      const publication = pathSegments[1];
      const slug = pathSegments[3];
      if (publication && slug) {
        return `https://${publication}.substack.com/p/${slug}`;
      }
    }

    return url;
  } catch {
    return url;
  }
}

function parseRawMetadata(rawMetadata: string | null): JsonObject {
  if (!rawMetadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawMetadata);
    if (isJsonObject(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore parse errors and fallback to an empty metadata object.
  }

  return {};
}

function getStringMetadataField(metadata: JsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Transform a joined DB row (userItems + items + creators) into an ItemView.
 * Creator data comes from the creators table (single source of truth).
 */
export function toItemView(
  row: {
    user_items: typeof userItems.$inferSelect;
    items: typeof items.$inferSelect;
    creators: typeof creators.$inferSelect | null;
  },
  itemTags: ItemTag[] = []
): ItemView {
  const userItem = row.user_items;
  const item = row.items;
  const creator = row.creators;
  const normalizedCreatorImageUrl = normalizeNullString(creator?.imageUrl ?? null);
  const metadata = parseRawMetadata(item.rawMetadata);
  const newsletterAvatarUrl =
    item.provider === 'GMAIL'
      ? buildNewsletterAvatarUrl({
          canonicalUrl: item.canonicalUrl,
          listId: getStringMetadataField(metadata, 'listId'),
          fromAddress:
            getStringMetadataField(metadata, 'fromAddress') ??
            getStringMetadataField(metadata, 'sender') ??
            creator?.handle ??
            null,
          unsubscribeUrl: getStringMetadataField(metadata, 'unsubscribeUrl'),
          creatorHandle: creator?.handle ?? null,
        })
      : null;
  const thumbnailUrl =
    item.thumbnailUrl ??
    (item.provider === 'GMAIL' ? (normalizedCreatorImageUrl ?? newsletterAvatarUrl) : null);
  const creatorImageUrl =
    item.provider === 'GMAIL'
      ? (normalizedCreatorImageUrl ?? newsletterAvatarUrl)
      : normalizedCreatorImageUrl;
  const responseProvider =
    item.provider === Provider.GMAIL &&
    isSubstackArticleUrl(item.canonicalUrl) &&
    hasSubstackNewsletterIdentity({
      canonicalUrl: item.canonicalUrl,
      listId: getStringMetadataField(metadata, 'listId'),
      fromAddress:
        getStringMetadataField(metadata, 'fromAddress') ??
        getStringMetadataField(metadata, 'sender') ??
        creator?.handle ??
        null,
      unsubscribeUrl: getStringMetadataField(metadata, 'unsubscribeUrl'),
    })
      ? Provider.SUBSTACK
      : item.provider;

  return {
    id: userItem.id,
    itemId: item.id,
    title: item.title,
    thumbnailUrl,
    canonicalUrl: normalizeCanonicalUrlForResponse(item.canonicalUrl),
    contentType: item.contentType as ContentType,
    provider: responseProvider as Provider,
    // Creator data from creators table (normalized)
    creator: creator?.name ?? 'Unknown Creator',
    creatorImageUrl,
    creatorId: item.creatorId ?? null,
    publisher: item.publisher,
    summary: item.summary,
    duration: item.duration,
    publishedAt: item.publishedAt,
    wordCount: item.wordCount,
    readingTimeMinutes: item.readingTimeMinutes,
    state: userItem.state as UserItemState,
    ingestedAt: userItem.ingestedAt,
    bookmarkedAt: userItem.bookmarkedAt,
    lastOpenedAt: userItem.lastOpenedAt,
    progress:
      userItem.progressPosition !== null && userItem.progressDuration !== null
        ? {
            position: userItem.progressPosition,
            duration: userItem.progressDuration,
            percent: Math.round(
              (userItem.progressPosition / (userItem.progressDuration || 1)) * 100
            ),
          }
        : null,
    isFinished: userItem.isFinished,
    finishedAt: userItem.finishedAt,
    tags: itemTags,
  };
}

async function getTagsForUserItems(
  ctx: { db: Database; userId: string },
  userItemIds: string[]
): Promise<Map<string, ItemTag[]>> {
  const map = new Map<string, ItemTag[]>();

  if (userItemIds.length === 0) {
    return map;
  }

  const rows = await ctx.db
    .select({
      userItemId: userItemTags.userItemId,
      tagId: tags.id,
      tagName: tags.name,
    })
    .from(userItemTags)
    .innerJoin(tags, eq(userItemTags.tagId, tags.id))
    .where(and(inArray(userItemTags.userItemId, userItemIds), eq(tags.userId, ctx.userId)))
    .orderBy(desc(userItemTags.createdAt));

  for (const row of rows) {
    const existing = map.get(row.userItemId) ?? [];
    existing.push({ id: row.tagId, name: row.tagName });
    map.set(row.userItemId, existing);
  }

  return map;
}

export async function toItemViewsWithTags(
  ctx: { db: Database; userId: string },
  rows: Array<{
    user_items: typeof userItems.$inferSelect;
    items: typeof items.$inferSelect;
    creators: typeof creators.$inferSelect | null;
  }>
): Promise<ItemView[]> {
  const userItemIds = rows.map((row) => row.user_items.id);
  const tagsByItemId = await getTagsForUserItems(ctx, userItemIds);

  return rows.map((row) => toItemView(row, tagsByItemId.get(row.user_items.id) ?? []));
}

export function toHomeItemViews(
  rows: Array<{
    user_items: typeof userItems.$inferSelect;
    items: typeof items.$inferSelect;
    creators: typeof creators.$inferSelect | null;
  }>
): HomeItemView[] {
  return rows.map((row) => {
    const itemView = toItemView(row);

    return {
      id: itemView.id,
      itemId: itemView.itemId,
      title: itemView.title,
      thumbnailUrl: itemView.thumbnailUrl,
      canonicalUrl: itemView.canonicalUrl,
      contentType: itemView.contentType,
      provider: itemView.provider,
      creator: itemView.creator,
      creatorImageUrl: itemView.creatorImageUrl,
      creatorId: itemView.creatorId,
      publisher: itemView.publisher,
      summary: itemView.summary,
      duration: itemView.duration,
      publishedAt: itemView.publishedAt,
      readingTimeMinutes: itemView.readingTimeMinutes,
      bookmarkedAt: itemView.bookmarkedAt,
      lastOpenedAt: itemView.lastOpenedAt,
      progress: itemView.progress,
    };
  });
}
