#!/usr/bin/env bun

// Test YouTube creator extraction flow

import { enhancedMetadataExtractor } from './packages/shared/src/enhanced-metadata-extractor.ts'

const testUrls = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
  'https://www.youtube.com/watch?v=9bZkp7q19f0', // PSY - GANGNAM STYLE
  'https://youtu.be/kJQP7kiw5Fk', // Luis Fonsi - Despacito
]

console.log('Testing YouTube creator extraction...\n')

for (const url of testUrls) {
  console.log(`\n=== Testing URL: ${url} ===`)
  
  try {
    const result = await enhancedMetadataExtractor.extractMetadata(url)
    
    if (result.success && result.metadata) {
      console.log('Title:', result.metadata.title)
      console.log('Creator:', result.metadata.creator)
      console.log('Source:', result.metadata.source)
      console.log('Content Type:', result.metadata.contentType)
      
      if (result.metadata.creator) {
        console.log('\nCreator Details:')
        console.log('  ID:', result.metadata.creator.id)
        console.log('  Name:', result.metadata.creator.name)
        console.log('  URL:', result.metadata.creator.url)
        console.log('  Handle:', result.metadata.creator.handle)
      } else {
        console.log('\n⚠️  No creator information extracted!')
      }
    } else {
      console.log('❌ Extraction failed:', result.error)
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
  }
}