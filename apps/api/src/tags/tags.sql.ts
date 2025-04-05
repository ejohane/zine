import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tags = sqliteTable("tags", {
  id: integer("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull().unique(), // Unique tag names
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
});
