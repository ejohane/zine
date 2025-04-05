import { PartialContent } from "../types/content-types";
import {
  mapOpenGraphToContent,
  mapSpotifyEpisodeToContent,
  mapYoutubeEpisodeToContent,
} from "./mappers";
import { parseUrl } from "./parsers";
import { resolveOpenGraphUrl } from "./resolvers/open-graph-resolver";
import { resolveSpotifyEpisode } from "./resolvers/spotify-resolver";
import { resolveYoutubeVideo } from "./resolvers/youtube-resolver";

export async function processUrl(
  url: string,
): Promise<PartialContent | undefined> {
  console.log("processUrl", url);
  const result = parseUrl(url);
  console.log("result", result);
  switch (result.source) {
    case "youtube":
      if (!result.isValid) {
        console.log("Invalid YouTube URL");
        return;
      }

      const youtubeContent = await resolveYoutubeVideo(result.videoId);
      if (!youtubeContent) {
        console.error(
          `Failed to fetch YouTube video with ID: ${result.videoId}`,
        );
        return;
      }

      return mapYoutubeEpisodeToContent(url, youtubeContent);

    case "spotify":
      if (!result.isValid) {
        console.log("Invalid Spotify URL");
        return;
      }
      console.log("result.episodeId", result.episodeId);
      const spotifyContent = await resolveSpotifyEpisode(result.episodeId);
      if (!spotifyContent) {
        console.error(
          `Failed to fetch Spotify episode with ID: ${result.episodeId}`,
        );
        return;
      }

      return mapSpotifyEpisodeToContent(url, spotifyContent);

    case "unknown":
      if (!result.isValid) {
        console.log(`Reason: ${result.reason}`);
        return;
      }

      const unknownContent = await resolveOpenGraphUrl(url);
      if (!unknownContent) {
        console.error(`Failed to fetch Open Graph data for URL: ${url}`);
        return;
      }
      return mapOpenGraphToContent(url, unknownContent);

    default:
      // This ensures exhaustive checking. If a new source is added to UrlParseResult,
      // TypeScript will error here, reminding you to handle it.
      const _exhaustiveCheck: never = result;
      throw new Error(`Unhandled source: ${(_exhaustiveCheck as any).source}`);
  }
}
