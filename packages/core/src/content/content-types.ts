export interface Author {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  image: string | null;
  description: string | null;
}

export type ServiceName = "youtube" |
  "spotify" |
  "x" |
  "substack" |
  "rss" |
  "web"

export interface Service {
  id: number;
  name: ServiceName;
  createdAt: Date;
}

export const contentTypes = [
  "audio",
  "video",
  "article",
  "post",
  "image",
  "link",
] as const;
export type ContentType = (typeof contentTypes)[number];


export interface Content {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  publishedDate: Date | null;
  url: string;
  title: string | null;
  description: string | null;
  type: ContentType;
  image: string | null;
  duration: number | null;
  author: Author | null;
  service: Service | null;
}

// Partial types using DeepPartial
export type DeepPartial<T> = T extends object
  ? {
    [P in keyof T]?: DeepPartial<T[P]>;
  }
  : T;

export type PartialAuthor = DeepPartial<Author>;
export type PartialService = DeepPartial<Service>;
export type PartialContent = {
  [K in keyof Content]?: Content[K] extends infer U | null
  ? DeepPartial<U> | null
  : DeepPartial<Content[K]>;
}; 