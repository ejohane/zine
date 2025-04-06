import { YoutubeVideoDetails } from "../resolvers/youtube-resolver";
import { PartialContent } from "../../types/content-types";

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
    image: youtube.thumbnails?.high?.url ?? undefined,
    duration: youtube.duration ?? undefined,
    author: {
      name: youtube.channel.title,
      description: youtube.channel.description,
      image: youtube.channel.thumbnails.high?.url ?? undefined,
    },
    service: {
      name: "youtube",
    },
  };
}
