import { drizzle } from "drizzle-orm/d1";
import { getContentItemByUrl, parseAndSave } from "../content/content";
import { bookmarks } from "./bookmarks.sql";
import { content } from "../content/content.sql";
import { and, eq } from "drizzle-orm";
import { Bookmark } from "./bookmark-types";
import { ErrorResult, SuccessResult } from "../common/common-types";

export async function getBookmarksForUser(req: {
  userId: string;
  db: D1Database;
}): Promise<SuccessResult<Bookmark[]> | ErrorResult<Bookmark[]>> {
  const result = await drizzle(req.db)
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.userId, req.userId))
    .innerJoin(content, eq(bookmarks.contentId, content.id));

  const response = result.map<Bookmark>((obj) => {
    const { contentId, ...bookmark } = obj.bookmarks;
    const { metadata, ...content } = obj.content;
    return {
      ...bookmark,
      content: {
        ...content,
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
  let existingContent = await getContentItemByUrl(req.url, req.db);

  const existingBookmark = existingContent
    ? await drizzle(req.db)
        .select()
        .from(bookmarks)
        .innerJoin(content, eq(bookmarks.contentId, content.id))
        .where(and(eq(content.url, req.url), eq(bookmarks.userId, req.userId)))
        .get()
    : undefined;

  if (existingBookmark && existingContent) {
    const { contentId, ...rest } = existingBookmark.bookmarks;
    return SuccessResult({
      ...rest,
      content: existingContent,
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

  const { contentId, ...rest } = bookmark;
  return SuccessResult({
    ...rest,
    content: existingContent,
  });
}
