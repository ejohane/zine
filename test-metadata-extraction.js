// Test enhanced metadata extraction directly
import { enhancedMetadataExtractor } from './packages/shared/dist/enhanced-metadata-extractor.js'

async function testMetadataExtraction() {
  try {
    console.log('🔍 Testing Enhanced Metadata Extraction Directly\n');
    
    const testUrls = [
      // Web/GitHub (should work reliably)
      { url: 'https://github.com/facebook/react', platform: 'GitHub', expected: 'web' },
      { url: 'https://vitejs.dev', platform: 'Vite', expected: 'web' },
      
      // YouTube (should use YouTube extractor)
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', platform: 'YouTube', expected: 'youtube' },
      { url: 'https://youtu.be/dQw4w9WgXcQ', platform: 'YouTube (short)', expected: 'youtube' },
      
      // Spotify (should use Spotify extractor)
      { url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', platform: 'Spotify', expected: 'spotify' },
      
      // Substack (should use Substack extractor)
      { url: 'https://stratechery.substack.com/p/the-ai-summer', platform: 'Substack', expected: 'substack' },
    ];
    
    for (const testCase of testUrls) {
      console.log(`🧪 Testing ${testCase.platform}: ${testCase.url}`);
      
      try {
        const result = await enhancedMetadataExtractor.extractMetadata(testCase.url);
        
        if (result.success && result.metadata) {
          const metadata = result.metadata;
          
          console.log(`   ✅ Success!`);
          console.log(`   📋 Title: ${metadata.title}`);
          console.log(`   🏭 Source: ${metadata.source} ${metadata.source === testCase.expected ? '✅' : '❌ (expected ' + testCase.expected + ')'}`);
          console.log(`   📄 Content Type: ${metadata.contentType}`);
          console.log(`   🖼️  Thumbnail: ${metadata.thumbnailUrl ? '✅' : '❌'}`);
          console.log(`   🎨 Favicon: ${metadata.faviconUrl ? '✅' : '❌'}`);
          console.log(`   👤 Creator: ${metadata.creator?.name || 'none'} ${metadata.creator?.handle ? '(' + metadata.creator.handle + ')' : ''}`);
          console.log(`   📖 Description: ${metadata.description ? '✅ (' + metadata.description.length + ' chars)' : '❌'}`);
          console.log(`   🌐 Language: ${metadata.language || 'none'}`);
          console.log(`   📅 Published: ${metadata.publishedAt ? metadata.publishedAt.toISOString().split('T')[0] : 'none'}`);
          
          // Platform-specific metadata
          if (metadata.videoMetadata) {
            console.log(`   📹 Video: ${metadata.videoMetadata.duration ? Math.floor(metadata.videoMetadata.duration / 60) + ':' + String(metadata.videoMetadata.duration % 60).padStart(2, '0') : 'no duration'}`);
          }
          if (metadata.podcastMetadata) {
            console.log(`   🎧 Podcast: ${metadata.podcastMetadata.episodeTitle || 'no episode title'}`);
          }
          if (metadata.articleMetadata) {
            console.log(`   📰 Article: ${metadata.articleMetadata.wordCount ? metadata.articleMetadata.wordCount + ' words' : 'no word count'} ${metadata.articleMetadata.readingTime ? '(' + metadata.articleMetadata.readingTime + ' min)' : ''}`);
          }
          if (metadata.postMetadata) {
            console.log(`   💬 Post: ${metadata.postMetadata.postText ? '"' + metadata.postMetadata.postText.substring(0, 80) + '..."' : 'no post text'}`);
          }
          
        } else {
          console.log(`   ❌ Failed: ${result.error || 'Unknown error'}`);
        }
        
      } catch (error) {
        console.log(`   💥 Exception: ${error.message}`);
      }
      
      console.log('');
      
      // Add a small delay to be respectful to servers
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('✅ Metadata extraction testing completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testMetadataExtraction();