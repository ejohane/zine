import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { tags } from "../tags/tags.sql";
import { content } from "../content/schema";

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

export const bookmarkTags = sqliteTable(
  "bookmark_tags",
  {
    bookmarkId: integer("bookmark_id")
      .notNull()
      .references(() => bookmarks.id),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(new Date()),
  },
  (table) => ({
    // Define composite primary key directly with primaryKey()
    pk: primaryKey({ columns: [table.bookmarkId, table.tagId] }),
    // Index for faster lookups by tag
    tagIdx: index("bookmark_tags_tag_idx").on(table.tagId),
  }),
);
