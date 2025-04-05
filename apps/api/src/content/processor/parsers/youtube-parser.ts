export interface YouTubeParseResult {
  isYouTube: boolean;
  videoId: string | null;
}
export function parseYouTubeUrl(url: string): YouTubeParseResult {
  try {
    const cleanUrl = url.trim();

    // Check if it's a YouTube URL
    const isYouTube = /(youtube\.com|youtu\.be)/i.test(cleanUrl);
    if (!isYouTube) {
      return { isYouTube: false, videoId: null };
    }

    // Expanded list of YouTube URL patterns
    const youtubePatterns = [
      /youtu\.be\/([^?&/\s]{11})/i, // youtu.be short links
      /youtube\.com\/watch\?v=([^?&/\s]{11})/i, // Standard watch page
      /youtube\.com\/live\/([^?&/\s]{11})/i, // Live videos
      /youtube\.com\/embed\/([^?&/\s]{11})/i, // Embedded videos
      /youtube\.com\/v\/([^?&/\s]{11})/i, // Legacy mobile/app links
      /youtube\.com\/shorts\/([^?&/\s]{11})/i, // YouTube Shorts
      /youtube\.com\/watch\?[^&]*v=([^?&/\s]{11})/i, // Watch with extra parameters
    ];

    for (const pattern of youtubePatterns) {
      const match = cleanUrl.match(pattern);
      if (match && match[1]) {
        return {
          isYouTube: true,
          videoId: match[1],
        };
      }
    }

    return {
      isYouTube: true,
      videoId: null, // YouTube URL but no valid ID found
    };
  } catch (error) {
    return {
      isYouTube: false,
      videoId: null,
    };
  }
}
