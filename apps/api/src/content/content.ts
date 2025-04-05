import { drizzle } from "drizzle-orm/d1";
import { ErrorResult, SuccessResult } from "../common/common-types";
import { Content } from "./types/content-types";
import { author, content, services } from "./schema";
import { processUrl } from "./processor";
import { getOrCreateService } from "./service";
import { getOrCreateAuthorForService } from "./author";
import { eq } from "drizzle-orm";

export async function getContentByUrl(
  url: string,
  db: D1Database,
): Promise<Content | undefined> {
  const result = await drizzle(db)
    .select({
      id: content.id,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      publishedDate: content.publishedDate,
      url: content.url,
      title: content.title,
      description: content.description,
      type: content.type,
      image: content.image,
      duration: content.duration,
      author: {
        id: author.id,
        name: author.name,
        image: author.image,
        description: author.description,
        createdAt: author.createdAt,
        updatedAt: author.updatedAt,
      },
      service: {
        id: services.id,
        name: services.name,
        createdAt: services.createdAt,
      },
    })
    .from(content)
    .leftJoin(author, eq(content.authorId, author.id)) // LEFT JOIN because authorId is nullable
    .innerJoin(services, eq(content.serviceId, services.id)) // INNER JOIN because serviceId is not null
    .where(eq(content.url, url))
    .limit(1)
    .then((rows) => rows[0] || null);

  return result;
}

export async function parseAndSave(
  url: string,
  db: D1Database,
): Promise<SuccessResult<Content> | ErrorResult<Content>> {
  console.log("parseAndSave", url);
  const existingContent = await getContentByUrl(url, db);
  if (existingContent) {
    return SuccessResult(existingContent);
  }
  console.log("existingContent", existingContent);

  const partialContent = await processUrl(url);
  if (!partialContent) {
    return ErrorResult("Failed to parse url");
  }

  const serviceRecord = await getOrCreateService(
    partialContent.service?.name as any,
    db,
  );

  const authorRecord = await getOrCreateAuthorForService(
    {
      name: partialContent?.author?.name ?? "",
      description: partialContent?.author?.description,
      image: partialContent?.author?.image,
    },
    serviceRecord.id,
    db,
  );

  const { authorId, serviceId, ...newContent } = await drizzle(db)
    .insert(content)
    .values({
      authorId: authorRecord.id,
      serviceId: serviceRecord.id,
      url: url,
      title: partialContent.title,
      description: partialContent.description,
      type: partialContent.type,
      image: partialContent.image,
      duration: partialContent.duration,
      publishedDate: partialContent.publishedDate || new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()
    .then((rows) => rows[0]);

  const c: Content = {
    id: newContent.id,
    url: newContent.url,
    createdAt: newContent.createdAt,
    updatedAt: newContent.updatedAt,
    description: newContent.description,
    type: newContent.type,
    duration: newContent.duration,
    title: newContent.title,
    image: newContent.image,
    publishedDate: newContent.publishedDate,
    author: {
      id: authorRecord.id,
      createdAt: authorRecord.createdAt,
      description: authorRecord.description,
      name: authorRecord.name,
      image: authorRecord.image,
      updatedAt: authorRecord.updatedAt,
    },
    service: {
      id: serviceRecord.id,
      name: serviceRecord.name,
      createdAt: serviceRecord.createdAt,
    },
  };

  return SuccessResult(c);
}
