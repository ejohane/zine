import { parseYouTubeUrl, YouTubeParseResult } from "./youtube-parser";

describe("youtube-parser", () => {
  test.each([
    ["https://youtu.be/TcfhrThp1OU?si=oxupgV2eF3JZKsjL", true, "TcfhrThp1OU"],
    [
      "https://www.youtube.com/live/EJ23yv8Bkcw?si=DWp5a2T6zAIG2EH2",
      true,
      "EJ23yv8Bkcw",
    ],
    ["https://www.youtube.com/embed/AGbOLk-fjYM", true, "AGbOLk-fjYM"],
    ["https://www.youtube.com/watch?v=BSrx9y7npyg&t=471s", true, "BSrx9y7npyg"],
    ["https://youtube.com/shorts/9r2vObU3CEg", true, "9r2vObU3CEg"],
    ["youtube.com/watch?v=TcfhrThp1OU", true, "TcfhrThp1OU"],
    ["https://www.youtube.com/v/TcfhrThp1OU?version=3", true, "TcfhrThp1OU"],
    [
      "https://www.youtube.com/watch?v=TcfhrThp1OU&list=PL1234567890",
      true,
      "TcfhrThp1OU",
    ],
    ["https://example.com/notyoutube", false, null],
    ["https://youtu.be/AGbOLk-fjYM?si=8yg9GmVxPNs4PsjV", true, "AGbOLk-fjYM"],
    ["https://www.youtube.com/watch?v=9r2vObU3CEg&t=458s", true, "9r2vObU3CEg"],
  ])(
    "url is valid (%i) and has video id (%i)",
    (url, isValid, expectedVideoId) => {
      const expectedResult: YouTubeParseResult = {
        isYouTube: isValid,
        videoId: expectedVideoId,
      };
      const actualResult = parseYouTubeUrl(url);
      expect(actualResult).toEqual(expectedResult);
    },
  );
});
