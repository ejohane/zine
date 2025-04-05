import { SpotifyParseResult, parseSpotifyEpisode } from "./spotify-parser";
import { YouTubeParseResult, parseYouTubeUrl } from "./youtube-parser";

export interface UnknownParseResult {
  source: "unknown";
  isValid: boolean;
  url: string; // Include the original URL for debugging
  reason?: string; // Optional reason for why it was unknown
}

export type UrlParseResult =
  | {
      source: "youtube";
      isValid: boolean;
      videoId: string;
    }
  | {
      source: "spotify";
      isValid: boolean;
      episodeId: string;
    }
  | UnknownParseResult;

export function parseUrl(url: string): UrlParseResult {
  try {
    new URL(url);
  } catch (error) {
    return {
      source: "unknown",
      isValid: false,
      url,
      reason: "Malformed URL",
    };
  }

  // Try YouTube parser
  const youtubeParseResult = parseYouTubeUrl(url);
  if (youtubeParseResult.isYouTube) {
    return youtubeParseResult.videoId === null
      ? {
          source: "youtube",
          isValid: false,
          videoId: "",
        }
      : {
          source: "youtube",
          isValid: true,
          videoId: youtubeParseResult.videoId,
        };
  }
  console.log("youtubeParseResult", youtubeParseResult);

  // Try Spotify parser
  const spotifyParseResult = parseSpotifyEpisode(url);
  if (spotifyParseResult.isSpotify) {
    console.log("spotifyParseResult", spotifyParseResult);
    return spotifyParseResult.episodeId === null
      ? {
          source: "spotify",
          isValid: false,
          episodeId: "",
        }
      : {
          source: "spotify",
          isValid: true,
          episodeId: spotifyParseResult.episodeId
        };
  }
  console.log("spotifyParseResult", spotifyParseResult);

  // If no parsers match, return unknown
  return {
    source: "unknown",
    isValid: true,
    url,
  };
}
