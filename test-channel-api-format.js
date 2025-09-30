#!/usr/bin/env node

/**
 * Test to verify the exact YouTube API channel response format
 * Based on YouTube Data API v3 documentation
 */

// This is the EXACT format returned by YouTube Data API v3 for channels
const mockChannelApiResponse = {
  "kind": "youtube#channelListResponse",
  "etag": "someEtag",
  "pageInfo": {
    "totalResults": 1,
    "resultsPerPage": 1
  },
  "items": [
    {
      "kind": "youtube#channel",
      "etag": "channelEtag",
      "id": "UCuAXFkgsw1L7xaCfnd5JJOw",
      "snippet": {
        "title": "Rick Astley",
        "description": "Official Rick Astley Channel",
        "customUrl": "@rickastley",
        "publishedAt": "2008-08-05T00:00:00Z",
        "thumbnails": {
          "default": {
            "url": "https://yt3.ggpht.com/BbqmELl5W0R7P1V2TUxdRj0edCawHoZ0F9OZR8IkJQNLh9jJLGfRA7YPCPqtE-RP8nLppYvyYA=s88-c-k-c0x00ffffff-no-rj",
            "width": 88,
            "height": 88
          },
          "medium": {
            "url": "https://yt3.ggpht.com/BbqmELl5W0R7P1V2TUxdRj0edCawHoZ0F9OZR8IkJQNLh9jJLGfRA7YPCPqtE-RP8nLppYvyYA=s240-c-k-c0x00ffffff-no-rj",
            "width": 240,
            "height": 240
          },
          "high": {
            "url": "https://yt3.ggpht.com/BbqmELl5W0R7P1V2TUxdRj0edCawHoZ0F9OZR8IkJQNLh9jJLGfRA7YPCPqtE-RP8nLppYvyYA=s800-c-k-c0x00ffffff-no-rj",
            "width": 800,
            "height": 800
          }
        },
        "localized": {
          "title": "Rick Astley",
          "description": "Official Rick Astley Channel"
        }
      },
      "statistics": {
        "viewCount": "298234702",
        "subscriberCount": "3940000",
        "hiddenSubscriberCount": false,
        "videoCount": "137"
      }
    }
  ]
};

console.log('🔍 YouTube Channel API Response Structure\n');
console.log('========================================\n');

const channel = mockChannelApiResponse.items[0];

console.log('✅ Channel Data:');
console.log('  ID:', channel.id);
console.log('  Title:', channel.snippet.title);
console.log('  Custom URL:', channel.snippet.customUrl);

console.log('\n📸 Thumbnails Available:');
console.log('  Has thumbnails object?', !!channel.snippet.thumbnails);
console.log('  Thumbnail sizes:', Object.keys(channel.snippet.thumbnails));

console.log('\n🖼️ Thumbnail URLs:');
console.log('  Default:', channel.snippet.thumbnails.default?.url);
console.log('  Medium:', channel.snippet.thumbnails.medium?.url);
console.log('  High:', channel.snippet.thumbnails.high?.url);

console.log('\n📊 Statistics:');
console.log('  Subscribers:', channel.statistics.subscriberCount);
console.log('  Video Count:', channel.statistics.videoCount);

// Test what our code should extract
console.log('\n🔄 What our code should extract:');
const thumbnails = channel.snippet.thumbnails;
const extractedThumbnail = thumbnails.high?.url || 
                           thumbnails.medium?.url || 
                           thumbnails.default?.url;

console.log('  Extracted thumbnail URL:', extractedThumbnail);

if (extractedThumbnail) {
  console.log('\n✅ SUCCESS: Thumbnail URL can be extracted from API response!');
} else {
  console.log('\n❌ FAILURE: No thumbnail URL found!');
}