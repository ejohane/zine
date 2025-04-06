import { Content } from "../content/content-types";
import { Tag } from "../tags/tag-types";

export interface Bookmark {
  id: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  content: Content;
  tags?: Tag[];
}
