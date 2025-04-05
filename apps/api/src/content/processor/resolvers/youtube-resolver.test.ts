import { resolveYoutubeVideo } from "./youtube-resolver";

describe("youtube-resolver", () => {
  it("playground", async () => {
    const videoId = "EJ23yv8Bkcw";
    const response = await resolveYoutubeVideo(videoId);
    console.log(response);
  });
});
