import openGraphScraper, { SuccessResult } from "open-graph-scraper-lite";

export type OgObject = SuccessResult["result"];

export async function resolveOpenGraphUrl(
  url: string,
): Promise<OgObject | undefined> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
    },
  });

  const html = await response.text();
  const { result, error } = await openGraphScraper({ html });

  if (error) {
    console.error(`Failed to fetch Open Graph data for URL: ${url}`);
    return;
  }

  return result;
}
