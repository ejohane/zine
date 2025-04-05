import { YoutubeVideoDetails } from "../resolvers/youtube-resolver";
import { Content, PartialContent } from "../../types/content-types";
import { NestedPartial } from "../../../utils/type-utils";

export function mapYoutubeEpisodeToContent(
  url: string,
  youtube: YoutubeVideoDetails,
): PartialContent {
  return {
    url,
    title: youtube.title,
    description: youtube.description,
    publishedDate: new Date(youtube.publishedAt),
    type: "video",
    image: youtube.thumbnails?.default?.url ?? undefined,
    duration: youtube.duration ?? undefined,
    author: {
      name: youtube.channel.title,
      description: youtube.channel.description,
      image: youtube.channel.thumbnails.default?.url ?? undefined,
    },
    service: {
      name: "youtube",
    },
  };
}
