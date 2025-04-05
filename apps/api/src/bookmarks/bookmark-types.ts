import { InferSelectModel } from "drizzle-orm";
import { bookmarks } from "./bookmarks.sql";
import { Content } from "../content/types/content-types";

export type Bookmark = Omit<InferSelectModel<typeof bookmarks>, "contentId"> & {
  content: Content;
};
