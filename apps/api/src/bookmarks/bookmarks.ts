import { drizzle } from "drizzle-orm/d1";
import { getContentByUrl, parseAndSave } from "../content/content";
import { bookmarks, bookmarkTags } from "./bookmarks.sql";
import { and, eq, desc, inArray } from "drizzle-orm";
import { Bookmark } from "@zine/core";
import { ErrorResult, SuccessResult } from "../common/common-types";
import { content } from "../content/schema";
import { author, services } from "../content/schema";
import { tags } from "../tags/tags.sql";

export async function getBookmarksForUser(req: {
  userId: string;
  db: D1Database;
}): Promise<SuccessResult<Bookmark[]> | ErrorResult<Bookmark[]>> {
  const result = await drizzle(req.db)
    .select({
      bookmarks: bookmarks,
      content: content,
      author: author,
      service: services,
    })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, req.userId), eq(bookmarks.isArchived, false)),
    )
    .orderBy(desc(bookmarks.createdAt))
    .innerJoin(content, eq(bookmarks.contentId, content.id))
    .leftJoin(author, eq(content.authorId, author.id))
    .innerJoin(services, eq(content.serviceId, services.id));

  // Get tags for all bookmarks
  const bookmarkIds = result.map(r => r.bookmarks.id);
  const bookmarkTagsResult = await drizzle(req.db)
    .select({
      bookmarkId: bookmarkTags.bookmarkId,
      tag: tags,
    })
    .from(bookmarkTags)
    .innerJoin(tags, eq(bookmarkTags.tagId, tags.id))
    .where(inArray(bookmarkTags.bookmarkId, bookmarkIds));

  // Create a map of bookmark IDs to their tags
  const tagsByBookmarkId = bookmarkTagsResult.reduce((acc, { bookmarkId, tag }) => {
    if (!acc[bookmarkId]) {
      acc[bookmarkId] = [];
    }
    acc[bookmarkId].push(tag);
    return acc;
  }, {} as Record<number, typeof tags.$inferSelect[]>);

  const response = result.map<Bookmark>((obj) => {
    const { contentId, ...bookmark } = obj.bookmarks;
    const { authorId, serviceId, ...contentFields } = obj.content;
    return {
      ...bookmark,
      content: {
        ...contentFields,
        author: obj.author ? {
          id: obj.author.id,
          name: obj.author.name,
          description: obj.author.description,
          image: obj.author.image,
          createdAt: obj.author.createdAt,
          updatedAt: obj.author.updatedAt,
        } : null,
        service: {
          id: obj.service.id,
          name: obj.service.name,
          createdAt: obj.service.createdAt,
        },
      },
      tags: tagsByBookmarkId[bookmark.id] || [],
    };
  });

  return SuccessResult(response);
}

export async function createBookmark(req: {
  url: string;
  userId: string;
  db: D1Database;
}): Promise<SuccessResult<Bookmark> | ErrorResult<Bookmark>> {
  let existingContent = await getContentByUrl(req.url, req.db);

  const existingBookmarkResult = existingContent
    ? await drizzle(req.db)
        .select({
          bookmarks: bookmarks,
          content: content,
          author: author,
          service: services,
        })
        .from(bookmarks)
        .innerJoin(content, eq(bookmarks.contentId, content.id))
        .leftJoin(author, eq(content.authorId, author.id))
        .innerJoin(services, eq(content.serviceId, services.id))
        .where(and(eq(content.url, req.url), eq(bookmarks.userId, req.userId)))
        .get()
    : undefined;

  if (existingBookmarkResult && existingContent) {
    const { contentId, ...bookmarkFields } = existingBookmarkResult.bookmarks;
    const { authorId, serviceId, ...contentFields } = existingBookmarkResult.content;

    // Get tags for the bookmark
    const bookmarkTagsResult = await drizzle(req.db)
      .select({
        tag: tags,
      })
      .from(bookmarkTags)
      .innerJoin(tags, eq(bookmarkTags.tagId, tags.id))
      .where(eq(bookmarkTags.bookmarkId, bookmarkFields.id));

    return SuccessResult({
      ...bookmarkFields,
      content: {
        ...contentFields,
        author: existingBookmarkResult.author ? {
          id: existingBookmarkResult.author.id,
          name: existingBookmarkResult.author.name,
          description: existingBookmarkResult.author.description,
          image: existingBookmarkResult.author.image,
          createdAt: existingBookmarkResult.author.createdAt,
          updatedAt: existingBookmarkResult.author.updatedAt,
        } : null,
        service: {
          id: existingBookmarkResult.service.id,
          name: existingBookmarkResult.service.name,
          createdAt: existingBookmarkResult.service.createdAt,
        },
      },
      tags: bookmarkTagsResult.map(r => r.tag),
    });
  }

  if (!existingContent) {
    const { result, error, errorMsg } = await parseAndSave(req.url, req.db);
    if (error) {
      return ErrorResult(errorMsg);
    }
    existingContent = result;
  }

  const [bookmark] = await drizzle(req.db)
    .insert(bookmarks)
    .values({
      userId: req.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      contentId: existingContent.id,
    })
    .returning();

  if (!bookmark) {
    return ErrorResult("Failed to create bookmark");
  }

  const { contentId, ...bookmarkFields } = bookmark;
  return SuccessResult({
    ...bookmarkFields,
    content: existingContent,
    tags: [],
  });
}

export async function archiveBookmark(req: {
  id: number;
  userId: string;
  db: D1Database;
}): Promise<SuccessResult<void> | ErrorResult<void>> {
  try {
    await drizzle(req.db)
      .update(bookmarks)
      .set({ isArchived: true })
      .where(and(eq(bookmarks.id, req.id), eq(bookmarks.userId, req.userId)));

    return SuccessResult(undefined);
  } catch (error: any) {
    return ErrorResult(error);
  }
}

export async function addTagToBookmark(req: {
  bookmarkId: number;
  tagName: string;
  userId: string;
  db: D1Database;
}): Promise<SuccessResult<void> | ErrorResult<void>> {
  try {
    // First, verify the bookmark exists and belongs to the user
    const bookmark = await drizzle(req.db)
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.id, req.bookmarkId), eq(bookmarks.userId, req.userId)))
      .get();

    if (!bookmark) {
      return ErrorResult("Bookmark not found or does not belong to user");
    }

    // Check if the tag already exists
    let tag = await drizzle(req.db)
      .select()
      .from(tags)
      .where(eq(tags.name, req.tagName))
      .get();

    // If tag doesn't exist, create it
    if (!tag) {
      const [newTag] = await drizzle(req.db)
        .insert(tags)
        .values({
          name: req.tagName,
          createdAt: new Date(),
        })
        .returning();

      if (!newTag) {
        return ErrorResult("Failed to create tag");
      }
      tag = newTag;
    }

    // Check if the bookmark-tag relationship already exists
    const existingRelationship = await drizzle(req.db)
      .select()
      .from(bookmarkTags)
      .where(and(
        eq(bookmarkTags.bookmarkId, req.bookmarkId),
        eq(bookmarkTags.tagId, tag.id)
      ))
      .get();

    // If the relationship doesn't exist, create it
    if (!existingRelationship) {
      await drizzle(req.db)
        .insert(bookmarkTags)
        .values({
          bookmarkId: req.bookmarkId,
          tagId: tag.id,
          createdAt: new Date(),
        });
    }

    return SuccessResult(undefined);
  } catch (error: any) {
    return ErrorResult(error);
  }
}
