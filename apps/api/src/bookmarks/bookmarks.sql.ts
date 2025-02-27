import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { content } from "../content/content.sql";

export const bookmarks = sqliteTable("bookmarks", {
  id: integer("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  contentId: integer("content_id")
    .notNull()
    .references(() => content.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
  isArchived: integer("is_archived", { mode: "boolean" })
    .notNull()
    .default(false),
});
