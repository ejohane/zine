import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(new Date()),
  },
  (table) => ({
    // Create a unique index on the name to prevent duplicate tags
    nameIdx: uniqueIndex("tags_name_unique").on(table.name),
  })
);
