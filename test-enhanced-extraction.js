// Test enhanced metadata extraction
async function testEnhancedExtraction() {
  try {
    console.log('🚀 Testing Enhanced Metadata Extraction\n');
    
    // Test saving a bookmark with enhanced metadata extraction
    const testUrls = [
      // Web/GitHub
      { url: 'https://github.com/facebook/react', platform: 'GitHub' },
      { url: 'https://vitejs.dev', platform: 'Vite' },
      
      // YouTube
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', platform: 'YouTube' },
      { url: 'https://youtu.be/dQw4w9WgXcQ', platform: 'YouTube (short)' },
      
      // Spotify (if accessible)
      { url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', platform: 'Spotify Podcast' },
      
      // Substack
      { url: 'https://stratechery.substack.com/p/the-ai-summer', platform: 'Substack' },
      
      // Twitter/X (may be blocked)
      { url: 'https://twitter.com/elonmusk/status/1234567890', platform: 'Twitter' },
      
      // Other web content
      { url: 'https://blog.cloudflare.com/workers-ai/', platform: 'Cloudflare Blog' },
    ];
    
    for (const testCase of testUrls) {
      console.log(`📝 Testing ${testCase.platform}: ${testCase.url}`);
      
      const saveResponse = await fetch('http://localhost:8787/api/v1/bookmarks/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: testCase.url,
          notes: `Testing enhanced metadata extraction for ${testCase.platform}`
        })
      });
      
      if (saveResponse.ok) {
        const result = await saveResponse.json();
        const bookmark = result.data;
        
        console.log(`   ✅ Saved: ${bookmark.title}`);
        console.log(`   🏭 Source: ${bookmark.source || 'none'}`);
        console.log(`   📄 Content Type: ${bookmark.contentType || 'none'}`);
        console.log(`   🖼️  Thumbnail: ${bookmark.thumbnailUrl ? 'yes' : 'no'}`);
        console.log(`   🎨 Favicon: ${bookmark.faviconUrl ? 'yes' : 'no'}`);
        console.log(`   👤 Creator: ${bookmark.creator?.name || 'none'} ${bookmark.creator?.handle ? '(' + bookmark.creator.handle + ')' : ''}`);
        console.log(`   📖 Description: ${bookmark.description ? 'yes (' + bookmark.description.length + ' chars)' : 'no'}`);
        console.log(`   🌐 Language: ${bookmark.language || 'none'}`);
        
        // Platform-specific metadata display
        if (bookmark.videoMetadata && bookmark.videoMetadata.duration) {
          console.log(`   ⏰ Duration: ${Math.floor(bookmark.videoMetadata.duration / 60)}:${String(bookmark.videoMetadata.duration % 60).padStart(2, '0')}`);
        }
        if (bookmark.podcastMetadata) {
          console.log(`   🎧 Podcast: ${bookmark.podcastMetadata.episodeTitle || 'Episode'} ${bookmark.podcastMetadata.seriesName ? 'from ' + bookmark.podcastMetadata.seriesName : ''}`);
        }
        if (bookmark.articleMetadata) {
          console.log(`   📰 Article: ${bookmark.articleMetadata.wordCount ? bookmark.articleMetadata.wordCount + ' words' : ''} ${bookmark.articleMetadata.readingTime ? '(' + bookmark.articleMetadata.readingTime + ' min read)' : ''}`);
        }
        if (bookmark.postMetadata) {
          console.log(`   💬 Post: ${bookmark.postMetadata.postText ? '"' + bookmark.postMetadata.postText.substring(0, 50) + '..."' : 'Social media post'}`);
        }
        
        console.log('');
      } else {
        const error = await saveResponse.json();
        if (saveResponse.status === 409) {
          console.log(`   ⚠️  Already exists: ${error.duplicate?.title}`);
        } else {
          console.log(`   ❌ Failed: ${error.error}`);
        }
        console.log('');
      }
    }
    
    // Check how many bookmarks we have now
    const getResponse = await fetch('http://localhost:8787/api/v1/bookmarks');
    const getResult = await getResponse.json();
    console.log(`📊 Total bookmarks in database: ${getResult.meta?.total || 0}`);
    
    if (getResult.data && getResult.data.length > 0) {
      console.log('\n📚 Sample enhanced bookmark:');
      const sample = getResult.data[0];
      console.log(`   Title: ${sample.title}`);
      console.log(`   URL: ${sample.url}`);
      console.log(`   Source: ${sample.source}`);
      console.log(`   Content Type: ${sample.contentType}`);
      console.log(`   Has Description: ${sample.description ? 'yes' : 'no'}`);
      console.log(`   Has Thumbnail: ${sample.thumbnailUrl ? 'yes' : 'no'}`);
      console.log(`   Has Creator: ${sample.creator ? 'yes' : 'no'}`);
    }
    
    console.log('\n✅ Enhanced metadata extraction test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testEnhancedExtraction();