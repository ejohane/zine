import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const serviceNames = [
  "youtube",
  "spotify",
  "x",
  "substack",
  "rss",
  "web",
] as const;
export type ServiceNames = (typeof serviceNames)[number];

export const services = sqliteTable("services", {
  id: integer("id", { mode: "number" }).primaryKey(),
  name: text("name", { enum: serviceNames }).notNull().unique().default("web"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
});
