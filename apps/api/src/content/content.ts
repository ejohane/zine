import { eq } from "drizzle-orm";
import { ContentItem, ContentPreview } from "./content-types";
import { content } from "./content.sql";
import { parseOpenGraph } from "./open-graph/open-graph-parser";
import { drizzle } from "drizzle-orm/d1";
import { ErrorResult, SuccessResult } from "../common/common-types";

async function getContentByUrl(url: string, db: any) {
  return await drizzle(db)
    .select()
    .from(content)
    .where(eq(content.url, url))
    .get();
}

export async function getContentItemByUrl(
  url: string,
  db: any,
): Promise<ContentItem | undefined> {
  const content = await getContentByUrl(url, db);
  if (!content) return;
  const { metadata, ...contentWithoutMetadata } = content;
  return contentWithoutMetadata;
}

export async function parsePreview(
  url: string,
  db: D1Database,
): Promise<SuccessResult<ContentPreview> | ErrorResult<ContentPreview>> {
  const existingContent = await getContentByUrl(url, db);
  if (existingContent) {
    const { title } = existingContent;
    return SuccessResult({ title, url });
  }

  const item = await parseOpenGraph(url);
  if (!item) {
    return ErrorResult("Failed to parse Open Graph data");
  }

  const { title } = item;

  return SuccessResult({ title, url });
}

export async function parseAndSave(
  url: string,
  db: D1Database,
): Promise<SuccessResult<ContentItem> | ErrorResult<ContentItem>> {
  const existingContent = await getContentByUrl(url, db);
  if (existingContent) {
    const { metadata, ...itemWithoutMetadata } = existingContent;
    return SuccessResult(itemWithoutMetadata);
  }

  const item = await parseOpenGraph(url);
  if (!item) {
    return ErrorResult("Failed to parse Open Graph data");
  }

  const [newContentItem] = await drizzle(db)
    .insert(content)
    .values({ ...item, createdAt: new Date(), updatedAt: new Date() })
    .returning();

  const { metadata, ...itemWithoutMetadata } = newContentItem;

  return SuccessResult(itemWithoutMetadata);
}
