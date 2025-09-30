#!/usr/bin/env bun

// Test saving YouTube content with creator info directly

import { ContentRepository } from './packages/api/src/repositories/content-repository.ts'
import { ContentEnrichmentService } from './packages/shared/src/content-enrichment-service.ts'

console.log('Testing YouTube content save with creator info...\n')

// First enrich the content
const service = new ContentEnrichmentService()
const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

const result = await service.enrichContent(testUrl, {
  forceRefresh: true,
  includeCreator: true
})

if (!result.success || !result.content) {
  console.error('Failed to enrich content')
  process.exit(1)
}

console.log('Enriched content:')
console.log('  Title:', result.content.title)
console.log('  Creator ID:', result.content.creatorId)
console.log('  Creator Name:', result.content.creatorName)
console.log('  Creator Handle:', result.content.creatorHandle)

// Now try to save it to the database
console.log('\nAttempting to save to database...')

// Log the exact data being passed
console.log('\nData being passed to upsert:')
console.log('  creatorId:', result.content.creatorId)
console.log('  creatorName:', result.content.creatorName)
console.log('  creatorHandle:', result.content.creatorHandle)

// Create a test database file
import Database from 'better-sqlite3'
const db = new Database(':memory:')

// Create the content table with creator fields
db.exec(`
  CREATE TABLE content (
    id TEXT PRIMARY KEY,
    external_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    url TEXT NOT NULL,
    canonical_url TEXT,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    content_type TEXT,
    creator_id TEXT,
    creator_name TEXT,
    creator_handle TEXT,
    creator_thumbnail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    enrichment_source TEXT,
    enrichment_version INTEGER
  )
`)

// Insert the content
const stmt = db.prepare(`
  INSERT INTO content (
    id, external_id, provider, url, title,
    creator_id, creator_name, creator_handle,
    enrichment_source, enrichment_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

stmt.run(
  result.content.id,
  result.content.externalId,
  result.content.provider,
  result.content.url,
  result.content.title,
  result.content.creatorId,
  result.content.creatorName,
  result.content.creatorHandle,
  result.content.enrichmentSource,
  result.content.enrichmentVersion
)

// Verify the data was saved
const saved = db.prepare('SELECT * FROM content WHERE id = ?').get(result.content.id)

console.log('\n✅ Content saved successfully!')
console.log('\nSaved content from database:')
console.log('  Title:', saved.title)
console.log('  Creator ID:', saved.creator_id)
console.log('  Creator Name:', saved.creator_name)
console.log('  Creator Handle:', saved.creator_handle)

const hasCreator = saved.creator_id && saved.creator_name
console.log(`\n${hasCreator ? '✅' : '❌'} Creator information persisted to database`)

db.close()
