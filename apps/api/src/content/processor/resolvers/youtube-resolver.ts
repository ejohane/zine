import { youtube_v3, youtube } from "@googleapis/youtube";
import { parseDuration } from "../../../utils/date-utils";

const youtubeClient: youtube_v3.Youtube = youtube({
  version: "v3",
  auth:
    process.env.YOUTUBE_API_KEY ?? "AIzaSyCkfilJ0NBrcuRBS5Kba8w9c7bA6t-iCxE",
});

export interface YoutubeVideoDetails {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnails: youtube_v3.Schema$ThumbnailDetails;
  duration?: number;
  channel: YoutubeChannelDetails;
}
export interface YoutubeChannelDetails {
  id: string;
  title: string;
  description: string;
  subscriberCount?: string;
  thumbnails: youtube_v3.Schema$ThumbnailDetails;
}

export async function resolveYoutubeVideo(
  videoId: string,
): Promise<YoutubeVideoDetails | null> {
  const response = await youtubeClient.videos.list({
    id: [videoId],
    part: ["snippet", "contentDetails", "statistics"],
  });
  const video = response.data.items?.[0];
  if (!video) return null;

  const channelId = video.snippet?.channelId ?? "";
  const channelResponse = await youtubeClient.channels.list({
    part: ["snippet", "statistics", "brandingSettings"],
    id: [channelId],
  });
  const channel = channelResponse.data.items?.[0];
  if (!channel) return null;

  return {
    id: video.id ?? videoId,
    title: video.snippet?.title ?? "",
    description: video.snippet?.description ?? "",
    publishedAt: video.snippet?.publishedAt ?? "",
    thumbnails: video.snippet?.thumbnails ?? {},
    duration: video.contentDetails?.duration
      ? parseDuration(video.contentDetails?.duration)
      : undefined,
    channel: {
      id: channel.id ?? "",
      title: channel.snippet?.title ?? "",
      description: channel.snippet?.description ?? "",
      subscriberCount: channel.statistics?.subscriberCount ?? "",
      thumbnails: channel.snippet?.thumbnails ?? {},
    },
  };
}
