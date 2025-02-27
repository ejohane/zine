import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const content = sqliteTable("content", {
  id: integer("id", { mode: "number" }).primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
  publishedDate: integer("updated_at", { mode: "timestamp" }).default(
    new Date(),
  ),
  url: text("url").notNull(),
  title: text("title"),
  description: text("description"),
  siteName: text("site_name"),
  type: text("type"),
  website: text("website"),
  image: text("image"),
  author: text("author"),
  duration: integer("duration"),
  source: text("source"),
  metadata: text("metadata", { mode: "json" }),
});
