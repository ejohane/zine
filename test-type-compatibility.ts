// Test type compatibility between shared and API Content types

import type { Content as SharedContent } from './packages/shared/src/content-enrichment-service'
import type { Content as ApiContent, NewContent } from './packages/api/src/schema'

// Create a test shared content object with creator info
const sharedContent: SharedContent = {
  id: 'test-id',
  externalId: 'test-external',
  provider: 'youtube',
  url: 'https://youtube.com/watch?v=test',
  title: 'Test Video',
  creatorId: 'youtube:TestCreator',
  creatorName: 'Test Creator',
  creatorHandle: '@testcreator',
  createdAt: new Date(),
  updatedAt: new Date()
}

// Try to use it as NewContent for the API
const apiContent: Partial<NewContent> = sharedContent

// Check if the types are compatible
console.log('Type compatibility test passed - types are assignable')
