import { drizzle } from "drizzle-orm/d1";
import { getContentByUrl, parseAndSave } from "../content/content";
import { bookmarks } from "./bookmarks.sql";
import { and, eq, desc } from "drizzle-orm";
import { Bookmark } from "@zine/core";
import { ErrorResult, SuccessResult } from "../common/common-types";
import { content } from "../content/schema";
import { author, services } from "../content/schema";

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
