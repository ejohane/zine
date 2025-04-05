import { resolveSpotifyEpisode } from "./spotify-resolver";

describe("spotify-resolver", () => {
  it("should work", async () => {
    const episodeId = "60i2840PgWgBsGONkROIHf";
    const result = await resolveSpotifyEpisode(episodeId);
    console.log(result);
  });
});
