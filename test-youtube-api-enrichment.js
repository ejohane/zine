#!/usr/bin/env node

/**
 * Test YouTube API enrichment directly
 * This simulates what happens when OAuth tokens are available
 */

// Test with a known YouTube video
const VIDEO_ID = 'dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up

async function testYouTubeAPIEnrichment() {
  console.log('🔍 Testing YouTube API Enrichment\n');
  console.log('========================================\n');

  try {
    // Import the API enrichment service
    const { ApiEnrichmentService } = await import('/Users/erikjohansson/dev/2025/zine/packages/api/dist/services/api-enrichment-service.js');
    
    // Create a mock env with necessary bindings
    const mockEnv = {
      DB: null, // Not needed for this test
      YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID || 'test',
      YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET || 'test'
    };

    const service = new ApiEnrichmentService(mockEnv);
    
    // Create a mock video response that matches YouTube Data API v3 format
    const mockVideoResponse = {
      id: VIDEO_ID,
      snippet: {
        title: "Rick Astley - Never Gonna Give You Up (Official Video)",
        description: "The official video for Rick Astley...",
        channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
        channelTitle: "Rick Astley",
        publishedAt: "2009-10-25T06:57:33Z",
        thumbnails: {
          default: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg" },
          high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" }
        },
        tags: ["rick astley", "never gonna give you up"],
        categoryId: "10"
      },
      contentDetails: {
        duration: "PT3M33S",
        caption: "false"
      },
      statistics: {
        viewCount: "1400000000",
        likeCount: "16000000",
        commentCount: "2000000"
      }
    };

    // Create mock channel data - THIS IS WHAT SHOULD HAVE THE AVATAR
    const mockChannelData = {
      id: "UCuAXFkgsw1L7xaCfnd5JJOw",
      snippet: {
        title: "Rick Astley",
        description: "Official Rick Astley YouTube Channel",
        customUrl: "@rickastley",
        thumbnails: {
          default: {
            url: "https://yt3.ggpht.com/BbqmELl5W0R7P1V2TUxdRj0edCawHoZ0F9OZR8IkJQNLh9jJLGfRA7YPCPqtE-RP8nLppYvyYA=s88-c-k-c0x00ffffff-no-rj",
            width: 88,
            height: 88
          },
          medium: {
            url: "https://yt3.ggpht.com/BbqmELl5W0R7P1V2TUxdRj0edCawHoZ0F9OZR8IkJQNLh9jJLGfRA7YPCPqtE-RP8nLppYvyYA=s240-c-k-c0x00ffffff-no-rj",
            width: 240,
            height: 240
          },
          high: {
            url: "https://yt3.ggpht.com/BbqmELl5W0R7P1V2TUxdRj0edCawHoZ0F9OZR8IkJQNLh9jJLGfRA7YPCPqtE-RP8nLppYvyYA=s800-c-k-c0x00ffffff-no-rj",
            width: 800,
            height: 800
          }
        }
      },
      statistics: {
        viewCount: "298234702",
        subscriberCount: "3940000",
        videoCount: "137"
      }
    };

    // Add channel data to video response
    mockVideoResponse.channelData = mockChannelData;

    console.log('📊 Mock API Response Structure:');
    console.log('  Video ID:', mockVideoResponse.id);
    console.log('  Channel ID:', mockVideoResponse.snippet.channelId);
    console.log('  Channel in response:', !!mockVideoResponse.channelData);
    console.log('  Channel thumbnails:', !!mockVideoResponse.channelData?.snippet?.thumbnails);

    // Test the transform function
    console.log('\n🔄 Testing transformYouTubeApiResponse...');
    const transformed = service.transformYouTubeApiResponse(mockVideoResponse);

    console.log('\n✅ Transformed Data:');
    console.log('  Creator ID:', transformed.creatorId);
    console.log('  Creator Name:', transformed.creatorName);
    console.log('  Creator Handle:', transformed.creatorHandle);
    console.log('  Creator Thumbnail:', transformed.creatorThumbnail);
    console.log('  Subscriber Count:', transformed.creatorSubscriberCount);

    if (transformed.creatorThumbnail) {
      console.log('\n✅ SUCCESS: Creator thumbnail URL extracted!');
      console.log('  URL:', transformed.creatorThumbnail);
    } else {
      console.log('\n❌ FAILURE: Creator thumbnail URL is missing!');
      console.log('\nDebugging info:');
      console.log('  Has channelData?', !!mockVideoResponse.channelData);
      console.log('  Has snippet?', !!mockVideoResponse.channelData?.snippet);
      console.log('  Has thumbnails?', !!mockVideoResponse.channelData?.snippet?.thumbnails);
      console.log('  Thumbnails object:', mockVideoResponse.channelData?.snippet?.thumbnails);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testYouTubeAPIEnrichment().catch(console.error);