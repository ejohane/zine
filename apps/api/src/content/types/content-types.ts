import { InferSelectModel } from "drizzle-orm";
import { author, content, services } from "../schema";
import { DeepPartial } from "../../utils/type-utils";

export type Author = InferSelectModel<typeof author>;
export type Service = InferSelectModel<typeof services>;
export type Content = Omit<
  InferSelectModel<typeof content>,
  "authorId" | "serviceId"
> & {
  author: Author | null;
  service: Service | null;
};

// Partial types using DeepPartial
export type PartialAuthor = DeepPartial<Author>;
export type PartialService = DeepPartial<Service>;
export type PartialContent = {
  [K in keyof Content]?: Content[K] extends infer U | null
    ? DeepPartial<U> | null
    : DeepPartial<Content[K]>;
};
