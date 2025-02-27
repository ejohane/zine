import { InferSelectModel } from "drizzle-orm";
import { content } from "./content.sql";

export type ContentItem = Omit<InferSelectModel<typeof content>, "metadata">;

export type ContentPreview = {
  title?: string | null;
  url: string;
};

export type Type =
  | "article"
  | "website"
  | "video"
  | "audio"
  | "image"
  | "other";

export type JsonLD = {
  description?: string;
  itemListElement?: {
    item: {
      "@id"?: string;
      name?: string;
    };
  }[];
};
