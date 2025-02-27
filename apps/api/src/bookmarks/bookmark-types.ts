import { InferSelectModel } from "drizzle-orm";
import { bookmarks } from "./bookmarks.sql";
import { ContentItem } from "../content/content-types";

export type Bookmark = Omit<InferSelectModel<typeof bookmarks>, "contentId"> & {
  content: ContentItem;
};
