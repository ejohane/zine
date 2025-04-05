import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { Env } from ".";
import { parseAndSave } from "./content/content";

const app = new Hono<Env>().post(
  "/preview",
  zValidator("json", z.object({ url: z.string().url() })),
  async (c) => {
    const { url } = c.req.valid("json");

    const { result, error, errorMsg } = await parseAndSave(url, c.env.DB);

    if (error) {
      c.status(500);
      return c.json({ error: errorMsg });
    }

    return c.json(result);
  },
);

export default app;
