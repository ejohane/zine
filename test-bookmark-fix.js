#!/usr/bin/env bun

// Test if the bookmark save flow properly passes creator details

// Mock repository with logging
class MockRepository {
  constructor() {
    this.ensureCreatorCalled = false
    this.createWithMetadataCalled = false
    this.creatorDataReceived = null
    this.bookmarkDataReceived = null
  }
  
  async ensureCreator(creatorData) {
    console.log('✅ ensureCreator called with:', creatorData)
    this.ensureCreatorCalled = true
    this.creatorDataReceived = creatorData
    // Simulate success
    return Promise.resolve()
  }
  
  async createWithMetadata(bookmarkData) {
    console.log('✅ createWithMetadata called')
    console.log('  Creator fields received:')
    console.log('    creatorId:', bookmarkData.creatorId)
    console.log('    creatorName:', bookmarkData.creatorName)
    console.log('    creatorHandle:', bookmarkData.creatorHandle)
    
    this.createWithMetadataCalled = true
    this.bookmarkDataReceived = bookmarkData
    
    // Return mock bookmark
    return {
      id: 'test-bookmark-id',
      userId: bookmarkData.userId,
      url: bookmarkData.url,
      title: bookmarkData.title
    }
  }
}

// Test the service
import { BookmarkSaveService } from './packages/shared/src/bookmark-save-service.ts'

const mockRepo = new MockRepository()
const service = new BookmarkSaveService(mockRepo)

console.log('Testing bookmark save with YouTube URL...\n')

const result = await service.saveBookmark({
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  notes: 'Test bookmark'
}, 'test-user')

console.log('\n=== Test Results ===')
console.log('ensureCreator called:', mockRepo.ensureCreatorCalled)
console.log('createWithMetadata called:', mockRepo.createWithMetadataCalled)

if (mockRepo.bookmarkDataReceived) {
  const hasCreatorInfo = !!(
    mockRepo.bookmarkDataReceived.creatorId || 
    mockRepo.bookmarkDataReceived.creatorName
  )
  console.log('Creator info passed to createWithMetadata:', hasCreatorInfo ? '✅ YES' : '❌ NO')
  
  if (!hasCreatorInfo) {
    console.log('\n❌ PROBLEM FOUND: Creator details not being passed to createWithMetadata!')
  }
}
