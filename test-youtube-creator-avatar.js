#!/usr/bin/env node

/**
 * Test YouTube creator avatar saving
 */

const API_BASE = 'http://localhost:8787';

async function testYouTubeCreatorAvatar() {
  console.log('🔍 Testing YouTube Creator Avatar Save\n');
  console.log('========================================\n');

  try {
    // Test with a known YouTube video (MrBeast - has profile image)
    const testUrl = 'https://www.youtube.com/watch?v=DuQbOQwVaNE';
    
    console.log('📝 Saving YouTube video:', testUrl);
    const saveResponse = await fetch(`${API_BASE}/api/v1/bookmarks/enriched`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: testUrl,
        notes: 'Testing creator avatar save'
      })
    });

    console.log('Response status:', saveResponse.status);
    const responseText = await saveResponse.text();
    
    let savedBookmark;
    try {
      savedBookmark = JSON.parse(responseText);
    } catch (e) {
      console.log('Response text:', responseText);
      return;
    }

    if (!saveResponse.ok) {
      console.log('❌ Failed to save bookmark:', savedBookmark);
      return;
    }

    console.log('\n✅ Bookmark saved successfully');
    console.log('Bookmark ID:', savedBookmark.data?.id);
    console.log('Content ID:', savedBookmark.data?.contentId);
    
    // Check creator data
    if (savedBookmark.data?.creator) {
      console.log('\n📸 Creator Data:');
      console.log('  - ID:', savedBookmark.data.creator.id);
      console.log('  - Name:', savedBookmark.data.creator.name);
      console.log('  - Avatar URL:', savedBookmark.data.creator.avatarUrl);
      console.log('  - Handle:', savedBookmark.data.creator.handle);
      console.log('  - Subscriber Count:', savedBookmark.data.creator.subscriberCount);
      
      if (savedBookmark.data.creator.avatarUrl) {
        console.log('\n✅ SUCCESS: Creator avatar URL is present!');
      } else {
        console.log('\n⚠️  WARNING: Creator avatar URL is missing');
      }
    } else {
      console.log('\n❌ No creator data in response');
    }

    // Check enrichment info
    if (savedBookmark.data?.enrichment) {
      console.log('\n🔧 Enrichment Info:');
      console.log('  - Source:', savedBookmark.data.enrichment.source);
      console.log('  - API Used:', savedBookmark.data.enrichment.apiUsed);
      console.log('  - Version:', savedBookmark.data.enrichment.version);
    }
    
    // Now check the database directly
    if (savedBookmark.data?.creator?.id) {
      console.log('\n📊 Checking database for creator:', savedBookmark.data.creator.id);
      // We can't directly query the DB from here, but the API response shows us the saved data
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testYouTubeCreatorAvatar().catch(console.error);