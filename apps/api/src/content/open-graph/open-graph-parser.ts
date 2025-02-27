import { ContentItem, JsonLD, Type } from "../content-types";
import openGraphScraper, { SuccessResult } from "open-graph-scraper-lite";
import { isSourceType, Source } from "../sources/source-utils";

type OgObject = SuccessResult["result"];

type ParsedContent = Omit<ContentItem, "id" | "createdAt" | "updatedAt"> & {
  metadata: OgObject;
};
type UrlParser = (url: string, og: OgObject) => ParsedContent;

const defaultParser: UrlParser = (url: string, og: OgObject) => ({
  url,
  title: og.ogTitle ?? null,
  source: Source.Unknown.toString(),
  description: og.ogDescription ?? null,
  image: og.ogImage?.[0]?.url ?? null,
  siteName: og.ogSiteName ?? "unknown",
  type: og.ogType ? (og.ogType as Type) : "other",
  metadata: og,
  author: og.ogArticleAuthor ?? null,
  publishedDate: og.ogDate ? new Date(og.ogDate) : null,
  duration: 0,
  website: og.ogWebsite ?? null,
});

const spotifyParser: UrlParser = (url: string, og: OgObject) => {
  const dotSeparator = " · ";
  const jsonLD = og.jsonLD?.[0] as JsonLD;

  const [author, _episode] = og.ogDescription?.split(dotSeparator) ?? [
    undefined,
    undefined,
  ];

  return {
    url,
    description: jsonLD.description ?? null,
    source: Source.Spotify,
    title: og.ogTitle ?? null,
    image: og.ogImage?.[0]?.url ?? null,
    author: author ?? null,
    duration: og.musicDuration ? parseInt(og.musicDuration) : null,
    publishedDate: og.musicReleaseDate ? new Date(og.musicReleaseDate) : null,
    siteName: "spotify",
    type: "audio",
    metadata: og,
    website: og.ogWebsite ?? null,
  };
};

const youtubeParser: UrlParser = (url: string, og: OgObject) => {
  const jsonLD = og.jsonLD?.[0] as JsonLD;
  const author = jsonLD.itemListElement?.[0]?.item?.name;

  return {
    url,
    description: jsonLD.description ?? null,
    source: Source.Spotify,
    title: og.ogTitle ?? null,
    image: og.ogImage?.[0]?.url ?? null,
    author: author ?? null,
    duration: og.musicDuration ? parseInt(og.musicDuration) : null,
    publishedDate: og.musicReleaseDate ? new Date(og.musicReleaseDate) : null,
    siteName: "spotify",
    type: "audio",
    metadata: og,
    website: og.ogWebsite ?? null,
  };
};

const parsers: Record<Source, UrlParser> = {
  spotify: spotifyParser,
  youtube: youtubeParser,
  x: defaultParser,
  unknown: defaultParser,
};

export async function parseOpenGraph(
  url: string,
): Promise<ParsedContent | undefined> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
    },
  });

  const html = await response.text();
  const { result, error } = await openGraphScraper({ html });

  if (error) throw new Error("Failed to parse URL");

  const ogSite = result.ogSiteName?.toLowerCase() ?? "unknown";
  const source = isSourceType(ogSite) ? ogSite : Source.Unknown;

  return parsers[source](url, result);
}
