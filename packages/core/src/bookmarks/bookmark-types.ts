import { Content } from "../content/content-types";

export interface Bookmark {
  id: number;
  createdOn: Date;

  isArchived: boolean;
  content: Content;
}
