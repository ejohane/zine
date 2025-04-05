import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { services } from "./services.sql";

export const author = sqliteTable("author", {
  id: integer("id", { mode: "number" }).primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
  name: text("name").notNull(),
  image: text("image"),
  description: text("description"),
});

export const authorServices = sqliteTable(
  "author_services",
  {
    authorId: integer("author_id")
      .notNull()
      .references(() => author.id),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    serviceUrl: text("service_url"), // Optional: author's specific URL on this service
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(new Date()),
  },
  (table) => ({
    // Composite primary key to prevent duplicate author-service pairs
    pk: primaryKey({
      columns: [table.authorId, table.serviceId],
    }),
    // Index for faster lookups by service
    serviceIdx: index("author_services_service_idx").on(table.serviceId),
  }),
);
