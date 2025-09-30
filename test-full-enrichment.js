#!/usr/bin/env bun

// Test full content enrichment flow

import { ContentEnrichmentService } from './packages/shared/src/content-enrichment-service.ts'

const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

console.log('Testing full content enrichment flow...\n')
console.log(`URL: ${testUrl}\n`)

const service = new ContentEnrichmentService()

const result = await service.enrichContent(testUrl, {
  forceRefresh: true,
  includeEngagement: true,
  includeCreator: true
})

if (result.success && result.content) {
  console.log('✅ Enrichment successful!')
  console.log('\nContent:')
  console.log('  Title:', result.content.title)
  console.log('  Provider:', result.content.provider)
  console.log('  Content Type:', result.content.contentType)
  
  console.log('\nCreator Information:')
  console.log('  Creator ID:', result.content.creatorId || '❌ MISSING')
  console.log('  Creator Name:', result.content.creatorName || '❌ MISSING')
  console.log('  Creator Handle:', result.content.creatorHandle || '❌ MISSING')
  console.log('  Creator Thumbnail:', result.content.creatorThumbnail || '❌ MISSING')
  
  console.log('\nEnrichment Metadata:')
  console.log('  Source:', result.source)
  console.log('  Enrichment Source:', result.content.enrichmentSource)
  console.log('  Enrichment Version:', result.content.enrichmentVersion)
} else {
  console.log('❌ Enrichment failed:', result.error)
}