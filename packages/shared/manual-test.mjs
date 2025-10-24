import { enhancedMetadataExtractor } from './dist/enhanced-metadata-extractor.js'

console.log('🧪 Testing creator extraction for seangoedecke.com\n')

const result = await enhancedMetadataExtractor.extractMetadata('https://www.seangoedecke.com/good-times-are-over/')

console.log('\n📊 Results:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('Success:', result.success)
console.log('Title:', result.metadata?.title)
console.log('Content Type:', result.metadata?.contentType)
console.log('\n👤 Creator Info:')
console.log('  Name:', result.metadata?.creator?.name || '❌ MISSING')
console.log('  ID:', result.metadata?.creator?.id || '❌ MISSING')
console.log('  URL:', result.metadata?.creator?.url || '(none)')
console.log('  Method:', result.metadata?.creator?.extractionMethod || '❌ MISSING')
console.log('  Confidence:', result.metadata?.creator?.confidence || '❌ MISSING')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
