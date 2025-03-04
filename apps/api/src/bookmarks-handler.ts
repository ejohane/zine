import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { createBookmark, getBookmarksForUser } from "./bookmarks/bookmarks";
import { Env } from ".";

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("userId");
    const savedBookmarks = await getBookmarksForUser({ userId, db: c.env.DB });
    return c.json(savedBookmarks);
  })
  .get("/:id", async (c) => {
    // const id = parseInt(c.req.param("id"));
    // const bookmark = await Bookmarks.getById(id, c.env.DB);
    // return c.json(bookmark);
  })
  .post(
    "/",
    zValidator("json", z.object({ url: z.string().url() })),
    async (c) => {
      const { url } = c.req.valid("json");
      const userId = c.get("userId");

      const { result, error, errorMsg } = await createBookmark({
        url,
        userId,
        db: c.env.DB,
      });

      if (error) {
        c.status(500);
        return c.json({ error: errorMsg });
      }

      return c.json(result);
    },
  )
  .post(
    "/preview",
    zValidator("json", z.object({ url: z.string().url() })),
    async (c) => {
      const { url } = c.req.valid("json");
      const userId = c.get("userId");

      const { result, error, errorMsg } = await createBookmark({
        url,
        userId,
        db: c.env.DB,
      });

      if (error) {
        c.status(500);
        return c.json({ error: errorMsg });
      }

      return c.json(result);
    },
  )
  .post("/:id/archive", async (c) => {
    // const id = parseInt(c.req.param("id"));
    // const success = await Bookmarks.archive(id, c.env.DB);
    // c.status(success ? 200 : 404);
    // return c.json({ isArchived: success });
  });

export default app;
