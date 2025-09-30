#!/usr/bin/env bun

// Debug the enrichment save flow

import { ContentEnrichmentService } from './packages/shared/src/content-enrichment-service.ts'

const testUrl = 'https://www.youtube.com/watch?v=kJQP7kiw5Fk' // Luis Fonsi - Despacito

console.log('Testing enrichment save flow...\n')

// Step 1: Enrich content
const service = new ContentEnrichmentService()
const result = await service.enrichContent(testUrl, {
  forceRefresh: true,
  includeCreator: true
})

if (!result.success || !result.content) {
  console.error('Enrichment failed')
  process.exit(1)
}

console.log('Step 1: Content enriched successfully')
console.log('  Title:', result.content.title)
console.log('  Creator ID:', result.content.creatorId)
console.log('  Creator Name:', result.content.creatorName)
console.log('  Provider:', result.content.provider)
console.log('  Enrichment Source:', result.content.enrichmentSource)

// Step 2: Check the content object structure
console.log('\nStep 2: Content object structure')
const hasAllRequiredFields = result.content.id && 
                             result.content.externalId && 
                             result.content.provider && 
                             result.content.url && 
                             result.content.title

console.log('  Has all required fields:', hasAllRequiredFields)
console.log('  Has creator info:', !!(result.content.creatorId && result.content.creatorName))

// Step 3: Check what would be saved
console.log('\nStep 3: Data that would be saved to DB')
const dataToSave = {
  id: result.content.id,
  externalId: result.content.externalId,
  provider: result.content.provider,
  url: result.content.url,
  title: result.content.title,
  creatorId: result.content.creatorId,
  creatorName: result.content.creatorName,
  creatorHandle: result.content.creatorHandle,
  enrichmentSource: result.content.enrichmentSource,
  enrichmentVersion: result.content.enrichmentVersion
}

console.log(JSON.stringify(dataToSave, null, 2))

// Step 4: Check if this matches what the ContentRepository expects
console.log('\nStep 4: Field presence check')
for (const [key, value] of Object.entries(dataToSave)) {
  const status = value !== null && value !== undefined ? '✅' : '❌'
  console.log(`  ${status} ${key}: ${value ?? 'null/undefined'}`)
}
