import { PartialContent } from "../../types/content-types";
import { OgObject } from "../resolvers/open-graph-resolver";

export function mapOpenGraphToContent(
  url: string,
  og: OgObject,
): PartialContent {
  return {
    url,
    title: og.ogTitle,
    description: og.ogDescription,
    image: og.ogImage?.[0]?.url,
    type: "link",
    publishedDate: og.ogDate ? new Date(og.ogDate) : undefined,
    duration: 0,
    author: {
      name: og.author,
    },
    service: {
      name: "web",
    },
  };
}
