import { Hono } from "hono";
import { cors } from "hono/cors";
import bookmarksHandler from "./bookmarks-handler";
import contentHandler from "./content-handler";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";

export type Env = {
  Bindings: {
    CLERK_SECRET_KEY: string;
    DB: D1Database;
  };
  Variables: {
    userId: string;
  };
};

// app.get("/api/protected", (c) => {
//
//   return c.json({ message: "You are authenticated!", userId: auth.userId });
// });

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: "*", // Allow all origins temporarily (use specific origin in production)
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("*", clerkMiddleware());

app.use("*", async (c, next) => {
  console.log("here");
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", auth.userId);

  return await next();
});

const routes = app
  .route("/bookmarks", bookmarksHandler)
  .route("/content", contentHandler);

export default app;

export type AppType = typeof routes;
