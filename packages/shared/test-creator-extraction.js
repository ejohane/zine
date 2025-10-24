import { enhancedMetadataExtractor } from './src/enhanced-metadata-extractor.js'

async function test() {
  console.log('Testing creator extraction for seangoedecke.com...\n')
  
  const result = await enhancedMetadataExtractor.extractMetadata('https://www.seangoedecke.com/good-times-are-over/')
  
  if (result.success && result.metadata) {
    console.log('✅ Extraction successful!')
    console.log('\nCreator Info:')
    console.log('  Name:', result.metadata.creator?.name || 'MISSING')
    console.log('  ID:', result.metadata.creator?.id || 'MISSING')
    console.log('  URL:', result.metadata.creator?.url || 'MISSING')
    console.log('  Extraction Method:', result.metadata.creator?.extractionMethod || 'MISSING')
    console.log('  Confidence:', result.metadata.creator?.confidence || 'MISSING')
    console.log('\nTitle:', result.metadata.title)
    console.log('Content Type:', result.metadata.contentType)
  } else {
    console.log('❌ Extraction failed:', result.error)
  }
}

test().catch(console.error)
