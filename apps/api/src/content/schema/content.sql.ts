import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { author, services } from ".";

export const contentTypes = [
  "audio",
  "video",
  "article",
  "post",
  "image",
  "link",
] as const;
export type ContentType = (typeof contentTypes)[number];

export const content = sqliteTable(
  "content",
  {
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
    type: text("type", { enum: contentTypes }).notNull().default("link"),
    image: text("image"),
    // duration in seconds
    duration: integer("duration"),
    authorId: integer("author_id").references(() => author.id),
    serviceId: integer("service_id") // New foreign key to services
      .notNull()
      .references(() => services.id),
  },
  (table) => ({
    typeIdx: index("type_idx").on(table.type),
  }),
);
