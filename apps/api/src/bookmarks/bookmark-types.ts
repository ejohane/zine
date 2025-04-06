import { InferSelectModel } from "drizzle-orm";
import { bookmarks } from "./bookmarks.sql";
import { Content } from "../content/types/content-types";
import { tags } from "../tags/tags.sql";

export type Tag = InferSelectModel<typeof tags>;

export type Bookmark = Omit<InferSelectModel<typeof bookmarks>, "contentId"> & {
  content: Content;
  tags?: Tag[];
};
