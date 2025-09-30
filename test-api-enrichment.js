#!/usr/bin/env bun

// Test the API enrichment endpoint directly

const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

// Import types and services
import { SaveBookmarkSchema } from './packages/shared/src/index.ts'
import { ContentEnrichmentService } from './packages/shared/src/content-enrichment-service.ts'

console.log('Testing content enrichment mapping...\n')

// Test the enrichment service directly
const service = new ContentEnrichmentService()
const result = await service.enrichContent(testUrl, {
  forceRefresh: true,
  includeCreator: true
})

if (result.success && result.content) {
  console.log('✅ Enrichment successful!\n')
  
  // Check what fields are present
  console.log('Content fields present:')
  const creatorFields = ['creatorId', 'creatorName', 'creatorHandle', 'creatorThumbnail']
  
  for (const field of creatorFields) {
    const value = result.content[field]
    const status = value ? '✅' : '❌'
    console.log(`  ${status} ${field}: ${value || 'undefined'}`)
  }
  
  // Log the entire content object for debugging
  console.log('\nFull content object keys:', Object.keys(result.content).sort())
  
  // Check if the content object matches what the API expects
  const hasCreatorInfo = result.content.creatorId || result.content.creatorName
  console.log(`\n${hasCreatorInfo ? '✅' : '❌'} Content has creator information`)
  
} else {
  console.log('❌ Enrichment failed:', result.error)
}
