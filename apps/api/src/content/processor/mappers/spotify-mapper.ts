import { Episode } from "@spotify/web-api-ts-sdk";
import { PartialContent } from "../../types/content-types";

export function mapSpotifyEpisodeToContent(
  url: string,
  episode: Episode,
): PartialContent {
  return {
    url,
    title: episode.name,
    description: episode.description,
    publishedDate: new Date(episode.release_date),
    type: "audio",
    image: episode.images[0]?.url,
    duration: episode.duration_ms / 1000,
    author: {
      name: episode.show.name,
      description: episode.show.description,
      image: episode.show.images[0]?.url,
    },
    service: {
      name: "spotify",
    },
  };
}
