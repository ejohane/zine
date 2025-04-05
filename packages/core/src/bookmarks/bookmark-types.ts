import { Content } from "../content/content-types";

export interface Bookmark {
  id: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  content: Content;
}
