import { drizzle } from "drizzle-orm/d1";
import { author, authorServices } from "./schema";
import { eq, and } from "drizzle-orm";

interface AuthorOptions {
  name: string;
  image?: string | null;
  description?: string | null;
  serviceUrl?: string | null;
}

export async function getOrCreateAuthorForService(
  authorOpts: AuthorOptions,
  serviceId: number,
  db: D1Database,
) {
  // Step 1: Check if the author exists with this service
  const existingAuthor = await drizzle(db)
    .select({
      id: author.id,
      createdAt: author.createdAt,
      updatedAt: author.updatedAt,
      name: author.name,
      image: author.image,
      description: author.description,
    })
    .from(author)
    .leftJoin(authorServices, eq(author.id, authorServices.authorId))
    .where(
      and(
        eq(author.name, authorOpts.name),
        eq(authorServices.serviceId, serviceId),
      ),
    )
    .then((rows) => rows[0]);

  // Step 2: If found and linked to the service, return it
  if (existingAuthor) {
    return existingAuthor;
  }

  // Step 3: Check if the author exists at all (without the service link)
  const existingAuthorWithoutService = await drizzle(db)
    .select()
    .from(author)
    .where(eq(author.name, authorOpts.name))
    .then((rows) => rows[0]);

  let authorId: number;

  if (existingAuthorWithoutService) {
    // Author exists but isn’t linked to this service
    authorId = existingAuthorWithoutService.id;
  } else {
    // Create new author
    const newAuthor = await drizzle(db)
      .insert(author)
      .values({
        name: authorOpts.name,
        image: authorOpts.image,
        description: authorOpts.description,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .then((rows) => rows[0]);
    authorId = newAuthor.id;
  }

  // Step 4: Link the author to the service
  await drizzle(db)
    .insert(authorServices)
    .values({
      authorId,
      serviceId,
      serviceUrl: authorOpts.serviceUrl,
      createdAt: new Date(),
    })
    .onConflictDoNothing(); // Avoid duplicate if race condition occurs

  // Step 5: Return the full author row
  const finalAuthor = await drizzle(db)
    .select()
    .from(author)
    .where(eq(author.id, authorId))
    .then((rows) => rows[0]);

  return finalAuthor;
}
