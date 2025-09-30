#!/usr/bin/env node

// Test the YouTube API transformation logic

// Mock YouTube API response with channel data
const mockYouTubeVideoResponse = {
  id: 'dQw4w9WgXcQ',
  snippet: {
    title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
    description: 'The official video for Rick Astley...',
    channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    channelTitle: 'Rick Astley',
    publishedAt: '2009-10-25T06:57:33Z',
    thumbnails: {
      high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }
    }
  },
  statistics: {
    viewCount: '1234567890',
    likeCount: '12345678',
    commentCount: '123456'
  },
  contentDetails: {
    duration: 'PT3M33S',
    caption: 'true'
  },
  // This is what our modified enrichment service adds
  channelData: {
    snippet: {
      title: 'Rick Astley',
      thumbnails: {
        high: { url: 'https://yt3.ggpht.com/channel-avatar-high.jpg' },
        medium: { url: 'https://yt3.ggpht.com/channel-avatar-medium.jpg' },
        default: { url: 'https://yt3.ggpht.com/channel-avatar-default.jpg' }
      },
      customUrl: '@RickAstleyOfficial'
    },
    statistics: {
      subscriberCount: '3850000'
    }
  }
};

// Simulate the transformYouTubeApiResponse function
function transformYouTubeApiResponse(video) {
  const parseYouTubeDuration = (duration) => {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    return hours * 3600 + minutes * 60 + seconds;
  };
  
  const duration = parseYouTubeDuration(video.contentDetails?.duration || '');
  
  // Extract channel thumbnail from channel data if available
  let channelThumbnail = undefined;
  if (video.channelData?.snippet?.thumbnails) {
    const thumbnails = video.channelData.snippet.thumbnails;
    // Prefer high quality thumbnail
    channelThumbnail = thumbnails.high?.url || 
                      thumbnails.medium?.url || 
                      thumbnails.default?.url;
  }
  
  return {
    viewCount: parseInt(video.statistics?.viewCount || '0'),
    likeCount: parseInt(video.statistics?.likeCount || '0'),
    commentCount: parseInt(video.statistics?.commentCount || '0'),
    durationSeconds: duration,
    creatorId: video.snippet?.channelId ? `youtube:${video.snippet.channelId}` : undefined,
    creatorName: video.snippet?.channelTitle,
    creatorHandle: video.channelData?.snippet?.customUrl || undefined,
    creatorThumbnail: channelThumbnail,
    creatorVerified: undefined,
    creatorSubscriberCount: video.channelData?.statistics?.subscriberCount ? 
      parseInt(video.channelData.statistics.subscriberCount) : undefined,
    category: video.snippet?.categoryId,
    tags: video.snippet?.tags || [],
    language: video.snippet?.defaultAudioLanguage,
    hasCaptions: video.contentDetails?.caption === 'true',
    videoQuality: video.contentDetails?.definition === 'hd' ? '1080p' : '480p',
    publishedAt: video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : undefined,
    isExplicit: video.status?.madeForKids === false
  };
}

// Test the transformation
console.log('Testing YouTube API Response Transformation');
console.log('===========================================\n');

const transformed = transformYouTubeApiResponse(mockYouTubeVideoResponse);

console.log('Transformed Data:');
console.log('-----------------');
console.log('Creator ID:', transformed.creatorId);
console.log('Creator Name:', transformed.creatorName);
console.log('Creator Handle:', transformed.creatorHandle);
console.log('Creator Thumbnail:', transformed.creatorThumbnail);
console.log('Creator Subscriber Count:', transformed.creatorSubscriberCount);
console.log('\nOther Metadata:');
console.log('View Count:', transformed.viewCount);
console.log('Like Count:', transformed.likeCount);
console.log('Duration (seconds):', transformed.durationSeconds);
console.log('Has Captions:', transformed.hasCaptions);

if (transformed.creatorThumbnail) {
  console.log('\n✅ SUCCESS: Channel thumbnail is being extracted!');
} else {
  console.log('\n❌ ISSUE: Channel thumbnail is NOT being extracted');
}