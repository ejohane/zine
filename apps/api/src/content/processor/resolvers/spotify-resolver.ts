import { SpotifyApi, Episode } from "@spotify/web-api-ts-sdk";

const clientID =
  process.env.SPOTIFY_CLIENT_ID ?? "c403128de4fc475980e7ff46e89cb0b1";
const clientSecret =
  process.env.SPOTIFY_CLIENT_SECRET ?? "6157d40795ae4168ae445ff7aee80b72";

const spotify = SpotifyApi.withClientCredentials(clientID, clientSecret);

export async function resolveSpotifyEpisode(
  episodeId: string,
): Promise<Episode | null> {
  const episode = await spotify.episodes.get(episodeId, "US");
  return episode;
}
