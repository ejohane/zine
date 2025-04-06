import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { Env } from "..";
import { drizzle } from "drizzle-orm/d1";
import { tags } from "./tags.sql";
import { bookmarkTags } from "../bookmarks/bookmarks.sql";
import { eq, and } from "drizzle-orm";
import { ErrorResult, SuccessResult } from "../common/common-types";

const app = new Hono<Env>();

// Get all tags
app.get("/", async (c) => {
  const userId = c.get("userId");
  const result = await drizzle(c.env.DB)
    .select()
    .from(tags)
    .orderBy(tags.name);
  
  return c.json(SuccessResult(result));
});

// Create a new tag
app.post(
  "/",
  zValidator("json", z.object({ name: z.string().min(1) })),
  async (c) => {
    const { name } = c.req.valid("json");
    const userId = c.get("userId");

    try {
      const [tag] = await drizzle(c.env.DB)
        .insert(tags)
        .values({
          name,
          createdAt: new Date(),
        })
        .returning();

      return c.json(SuccessResult(tag));
    } catch (error: any) {
      if (error.message?.includes("UNIQUE constraint failed")) {
        c.status(409);
        return c.json(ErrorResult("Tag already exists"));
      }
      throw error;
    }
  }
);

// Add a tag to a bookmark
app.post(
  "/:tagId/bookmarks/:bookmarkId",
  async (c) => {
    const tagId = parseInt(c.req.param("tagId"));
    const bookmarkId = parseInt(c.req.param("bookmarkId"));
    const userId = c.get("userId");

    try {
      const [bookmarkTag] = await drizzle(c.env.DB)
        .insert(bookmarkTags)
        .values({
          tagId,
          bookmarkId,
          createdAt: new Date(),
        })
        .returning();

      return c.json(SuccessResult(bookmarkTag));
    } catch (error: any) {
      if (error.message?.includes("UNIQUE constraint failed")) {
        c.status(409);
        return c.json(ErrorResult("Bookmark already has this tag"));
      }
      if (error.message?.includes("FOREIGN KEY constraint failed")) {
        c.status(404);
        return c.json(ErrorResult("Tag or bookmark not found"));
      }
      throw error;
    }
  }
);

// Remove a tag from a bookmark
app.delete(
  "/:tagId/bookmarks/:bookmarkId",
  async (c) => {
    const tagId = parseInt(c.req.param("tagId"));
    const bookmarkId = parseInt(c.req.param("bookmarkId"));
    const userId = c.get("userId");

    try {
      await drizzle(c.env.DB)
        .delete(bookmarkTags)
        .where(
          and(
            eq(bookmarkTags.tagId, tagId),
            eq(bookmarkTags.bookmarkId, bookmarkId)
          )
        );

      return c.json(SuccessResult(undefined));
    } catch (error) {
      throw error;
    }
  }
);

// Get all tags for a bookmark
app.get("/bookmarks/:bookmarkId", async (c) => {
  const bookmarkId = parseInt(c.req.param("bookmarkId"));
  const userId = c.get("userId");

  const result = await drizzle(c.env.DB)
    .select({
      tag: tags,
    })
    .from(bookmarkTags)
    .innerJoin(tags, eq(bookmarkTags.tagId, tags.id))
    .where(eq(bookmarkTags.bookmarkId, bookmarkId))
    .orderBy(tags.name);

  return c.json(SuccessResult(result.map(r => r.tag)));
});

export default app; 