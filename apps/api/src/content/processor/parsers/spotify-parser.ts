export interface SpotifyParseResult {
  isSpotify: boolean;
  episodeId: string | null;
}
export function parseSpotifyEpisode(url: string): SpotifyParseResult {
  try {
    const parsedUrl = new URL(url);
    console.log("parsedUrl", parsedUrl);
    const isSpotify = parsedUrl.hostname === "open.spotify.com";
    console.log("isSpotify", isSpotify);
    if (!isSpotify) {
      return { isSpotify: false, episodeId: null };
    }

    const pathSegments = parsedUrl.pathname.split("/");
    console.log("pathSegments", pathSegments);
    const episodeIndex = pathSegments.indexOf("episode");
    console.log("episodeIndex", episodeIndex);
    if (episodeIndex === -1 || episodeIndex === pathSegments.length - 1) {
      return { isSpotify: true, episodeId: null };
    }

    const episodeId = pathSegments[episodeIndex + 1];
    console.log("episodeId", episodeId);
    if (!episodeId || episodeId.length !== 22) {
      return { isSpotify: true, episodeId: null };
    }

    return { isSpotify: true, episodeId };
  } catch (error) {
    return { isSpotify: false, episodeId: null };
  }
}
