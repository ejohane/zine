#!/usr/bin/env node

/**
 * Test what metadata we get for YouTube videos without OAuth
 */

async function testYouTubeMetadata() {
  console.log('🔍 Testing YouTube Metadata Extraction\n');
  console.log('========================================\n');

  try {
    // Import the shared module
    const { ContentEnrichmentService } = await import('/Users/erikjohansson/dev/2025/zine/packages/shared/dist/index.js');
    
    const enrichmentService = new ContentEnrichmentService();
    
    // Test with a YouTube video
    const testUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
    
    console.log('📝 Enriching YouTube video:', testUrl);
    const result = await enrichmentService.enrichContent(testUrl, {
      forceRefresh: false,
      includeEngagement: true,
      includeCreator: true
    });
    
    console.log('\n📊 Enrichment Result:');
    console.log('  Success:', result.success);
    console.log('  Source:', result.source);
    
    if (result.content) {
      console.log('\n🎬 Content Data:');
      console.log('  Title:', result.content.title);
      console.log('  Provider:', result.content.provider);
      console.log('  External ID:', result.content.externalId);
      
      console.log('\n👤 Creator Data:');
      console.log('  Creator ID:', result.content.creatorId);
      console.log('  Creator Name:', result.content.creatorName);
      console.log('  Creator Handle:', result.content.creatorHandle);
      console.log('  Creator Thumbnail:', result.content.creatorThumbnail);
      console.log('  Creator Verified:', result.content.creatorVerified);
      console.log('  Creator Subscriber Count:', result.content.creatorSubscriberCount);
      
      if (result.content.creatorThumbnail) {
        console.log('\n✅ SUCCESS: Creator thumbnail is present!');
      } else {
        console.log('\n⚠️  WARNING: Creator thumbnail is missing');
        console.log('\nThis is expected without OAuth - YouTube Data API requires authentication');
        console.log('to fetch channel information including thumbnails.');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testYouTubeMetadata().catch(console.error);