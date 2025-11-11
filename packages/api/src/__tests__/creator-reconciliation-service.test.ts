import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CreatorReconciliationService } from '../services/creator-reconciliation-service'

describe('CreatorReconciliationService', () => {
  let service: CreatorReconciliationService
  let mockDB: any
  let mockRepository: any

  const mockCreator1 = {
    id: 'youtube:UC123',
    name: 'Test Creator',
    handle: '@testcreator',
    url: 'https://youtube.com/@testcreator',
    platforms: ['youtube'],
    createdAt: new Date(),
    updatedAt: new Date()
  }



  beforeEach(() => {
    mockDB = {
      prepare: vi.fn()
    }

    service = new CreatorReconciliationService(mockDB)
    
    // Access the private repository property for mocking
    mockRepository = (service as any).repository
    
    // Mock getRecentCreators to prevent database access in Tier 5 matching
    vi.spyOn(mockRepository, 'getRecentCreators').mockResolvedValue([])
  })

  describe('Tier 1: Exact ID match', () => {
    it('should match by exact ID', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(mockCreator1)

      const result = await service.reconcileCreator({
        id: 'youtube:UC123',
        name: 'Test Creator'
      })

      expect(result.creator).toEqual(mockCreator1)
      expect(result.matchMethod).toBe('exact_id')
      expect(result.similarity).toBe(1.0)
      expect(result.timedOut).toBe(false)
    })

    it('should continue to next tier if ID not found', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(mockCreator1)

      const result = await service.reconcileCreator({
        id: 'youtube:UC999',
        name: 'Test Creator',
        handle: '@testcreator'
      })

      expect(result.matchMethod).toBe('handle')
    })
  })

  describe('Tier 2: Handle match', () => {
    it('should match by handle', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(mockCreator1)

      const result = await service.reconcileCreator({
        name: 'Test Creator',
        handle: '@testcreator'
      })

      expect(result.creator).toEqual(mockCreator1)
      expect(result.matchMethod).toBe('handle')
      expect(result.similarity).toBe(1.0)
    })

    it('should extract handle from subscription URL', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(mockCreator1)

      const result = await service.reconcileCreator(
        {
          name: 'Test Creator'
        },
        {
          subscriptionUrl: 'https://youtube.com/@testcreator'
        }
      )

      expect(result.matchMethod).toBe('handle')
      expect(mockRepository.findByHandle).toHaveBeenCalledWith('@testcreator')
    })
  })

  describe('Tier 3: Domain + fuzzy name match', () => {
    it('should match by domain and fuzzy name', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByDomainPattern').mockResolvedValue([mockCreator1])

      const result = await service.reconcileCreator({
        name: 'Test Creator Official', // Will normalize to "Test Creator"
        url: 'https://youtube.com/@testcreator'
      })

      expect(result.creator).toEqual(mockCreator1)
      expect(result.matchMethod).toBe('domain_fuzzy')
      expect(result.similarity).toBeGreaterThan(0.85)
    })

    it('should not match if similarity too low', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByDomainPattern').mockResolvedValue([mockCreator1])
      vi.spyOn(mockRepository, 'findByPlatform').mockResolvedValue([])

      const result = await service.reconcileCreator({
        name: 'Completely Different Name',
        url: 'https://youtube.com/@different'
      })

      expect(result.creator).toBeNull()
      expect(result.matchMethod).toBe('none')
    })
  })

  describe('Tier 4: Related domains + high similarity', () => {
    it('should match across related domains with high similarity', async () => {
      const youtubeCreator = {
        ...mockCreator1,
        url: 'https://youtube.com/@testcreator'
      }

      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByDomainPattern')
        .mockResolvedValueOnce([]) // First call for exact domain
        .mockResolvedValueOnce([youtubeCreator]) // Second call for related domain

      const result = await service.reconcileCreator({
        name: 'Test Creator',
        url: 'https://youtu.be/@testcreator' // Related to youtube.com
      })

      expect(result.creator).toEqual(youtubeCreator)
      expect(result.matchMethod).toBe('related_domain')
      expect(result.similarity).toBeGreaterThan(0.9)
    })

    it('should require higher similarity for related domains', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByDomainPattern')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockCreator1])
      vi.spyOn(mockRepository, 'findByPlatform').mockResolvedValue([])

      const result = await service.reconcileCreator({
        name: 'Test Creator Plus Extra', // Lower similarity, won't meet 0.9 threshold
        url: 'https://youtu.be/@test'
      })

      // Should not match because similarity doesn't meet 0.9 threshold for related domains
      expect(result.matchMethod).toBe('none')
    })
  })

  describe('Tier 5: Platform fuzzy match', () => {
    it('should match by platform with high similarity', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByDomainPattern').mockResolvedValue([])
      vi.spyOn(mockRepository, 'findByPlatform').mockResolvedValue([mockCreator1])

      const result = await service.reconcileCreator(
        {
          name: 'Test Creator'
        },
        {
          platform: 'youtube'
        }
      )

      expect(result.creator).toEqual(mockCreator1)
      expect(result.matchMethod).toBe('platform_fuzzy')
      expect(result.similarity).toBeGreaterThan(0.95)
    })

    it('should pick best match among multiple candidates', async () => {
      const creator1 = { ...mockCreator1, name: 'Test Creator' }
      const creator2 = { ...mockCreator1, id: 'youtube:UC456', name: 'Test Creatorr' }

      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByDomainPattern').mockResolvedValue([])
      vi.spyOn(mockRepository, 'findByPlatform').mockResolvedValue([creator1, creator2])

      const result = await service.reconcileCreator(
        {
          name: 'Test Creator'
        },
        {
          platform: 'youtube'
        }
      )

      expect(result.creator).toEqual(creator1) // Exact match should win
      expect(result.similarity).toBe(1.0)
    })
  })

  describe('Timeout handling', () => {
    it('should timeout if reconciliation takes too long', async () => {
      // Mock a slow repository call
      vi.spyOn(mockRepository, 'getCreator').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(null), 500))
      )

      const result = await service.reconcileCreator(
        {
          id: 'youtube:UC123',
          name: 'Test Creator'
        },
        {
          timeoutMs: 100 // Short timeout
        }
      )

      expect(result.creator).toBeNull()
      expect(result.timedOut).toBe(true)
      expect(result.matchMethod).toBe('none')
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(100)
    })

    it('should use default timeout of 200ms', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(mockCreator1)

      const result = await service.reconcileCreator({
        id: 'youtube:UC123',
        name: 'Test Creator'
      })

      expect(result.timedOut).toBe(false)
      expect(result.executionTimeMs).toBeLessThan(200)
    })
  })

  describe('Error handling', () => {
    it('should handle repository errors gracefully', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockRejectedValue(
        new Error('Database error')
      )

      const result = await service.reconcileCreator({
        id: 'youtube:UC123',
        name: 'Test Creator'
      })

      expect(result.creator).toBeNull()
      expect(result.matchMethod).toBe('none')
      expect(result.timedOut).toBe(false)
    })

    it('should track execution time even on error', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockRejectedValue(
        new Error('Database error')
      )

      const result = await service.reconcileCreator({
        id: 'youtube:UC123'
      })

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Performance tracking', () => {
    it('should track execution time for successful matches', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(mockCreator1)

      const result = await service.reconcileCreator({
        id: 'youtube:UC123',
        name: 'Test Creator'
      })

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.executionTimeMs).toBeLessThan(200)
    })

    it('should track execution time for no match', async () => {
      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByDomainPattern').mockResolvedValue([])
      vi.spyOn(mockRepository, 'findByPlatform').mockResolvedValue([])

      const result = await service.reconcileCreator(
        {
          name: 'Unknown Creator'
        },
        {
          platform: 'youtube'
        }
      )

      expect(result.creator).toBeNull()
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Two-Tier Model: Content Source Reconciliation', () => {
    const mockContentSource = {
      id: 'youtube:UCzQUP1qoWDoEbmsQxvdjxgQ',
      externalId: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
      platform: 'youtube',
      sourceType: 'channel',
      title: 'PowerfulJRE',
      description: 'The Joe Rogan Experience podcast',
      url: 'https://youtube.com/@joerogan',
      creatorName: 'Joe Rogan',
      subscriberCount: 17500000,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const mockExtractedCreator = {
      name: 'Joe Rogan',
      handle: '@joerogan',
      avatarUrl: 'https://example.com/avatar.jpg',
      bio: 'Podcast host',
      url: 'https://youtube.com/@joerogan',
      platform: 'youtube',
      platformId: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
      verified: true,
      subscriberCount: 17500000,
      alternativeNames: ['PowerfulJRE'],
      extractionConfidence: 0.95,
      extractionMethod: 'direct' as const
    }

    const mockCreator = {
      id: 'creator:UCzQUP1qoWDoEbmsQxvdjxgQ',
      name: 'Joe Rogan',
      handle: '@joerogan',
      avatarUrl: 'https://example.com/avatar.jpg',
      platforms: ['youtube'],
      alternativeNames: ['PowerfulJRE'],
      contentSourceIds: ['youtube:UCzQUP1qoWDoEbmsQxvdjxgQ'],
      platformHandles: { youtube: '@joerogan' },
      primaryPlatform: 'youtube',
      totalSubscribers: 17500000,
      reconciliationConfidence: 0.95,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    let mockContentSourceRepository: any
    let mockExtractionService: any

    beforeEach(() => {
      mockContentSourceRepository = (service as any).contentSourceRepository
      mockExtractionService = (service as any).extractionService
    })

    it('should reconcile content source to existing creator', async () => {
      // Mock extraction
      vi.spyOn(mockExtractionService, 'extractCreator').mockResolvedValue({
        success: true,
        creator: mockExtractedCreator
      })

      // Mock finding existing creator (returns null first, then the creator)
      vi.spyOn(mockRepository, 'getCreator')
        .mockResolvedValueOnce(null) // First call in reconcileCreator
        .mockResolvedValueOnce(mockCreator) // Second call to check handle

      // Mock handle-based finding
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(mockCreator)

      // Mock content source update
      vi.spyOn(mockContentSourceRepository, 'updateContentSource').mockResolvedValue(mockContentSource)

      // Mock creator consolidation update
      vi.spyOn(mockRepository, 'updateCreatorConsolidation').mockResolvedValue(mockCreator)

      const result = await service.reconcileContentSource(mockContentSource)

      expect(result.creator).toEqual(mockCreator)
      expect(result.isNew).toBe(false)
      expect(result.matchMethod).toBe('handle')
      expect(mockContentSourceRepository.updateContentSource).toHaveBeenCalledWith(
        mockContentSource.id,
        { creatorId: mockCreator.id }
      )
    })

    it('should create new creator when no match found', async () => {
      // Mock extraction
      vi.spyOn(mockExtractionService, 'extractCreator').mockResolvedValue({
        success: true,
        creator: mockExtractedCreator
      })

      // Mock no existing creator found for reconciliation, then return created creator
      const getCreatorSpy = vi.spyOn(mockRepository, 'getCreator')
      getCreatorSpy.mockImplementation(async (...args: any[]) => {
        const id = args[0] as string
        // If asking for the new creator ID, return it, otherwise null
        if (id === 'creator:UCzQUP1qoWDoEbmsQxvdjxgQ') {
          return mockCreator
        }
        return null
      })
      
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByDomainPattern').mockResolvedValue([])
      vi.spyOn(mockRepository, 'findByPlatform').mockResolvedValue([])
      vi.spyOn(mockRepository, 'getRecentCreators').mockResolvedValue([])

      // Mock creator creation
      vi.spyOn(mockRepository, 'upsertCreator').mockResolvedValue(mockCreator)
      vi.spyOn(mockRepository, 'updateCreatorConsolidation').mockResolvedValue(mockCreator)
      vi.spyOn(mockContentSourceRepository, 'updateContentSource').mockResolvedValue(mockContentSource)

      const result = await service.reconcileContentSource(mockContentSource)

      expect(result.isNew).toBe(true)
      expect(result.matchMethod).toBe('new_creator')
      expect(mockRepository.upsertCreator).toHaveBeenCalled()
    })

    it('should update alternative names when linking content source', async () => {
      const existingCreator = {
        ...mockCreator,
        alternativeNames: ['JRE'],
        contentSourceIds: []
      }

      vi.spyOn(mockExtractionService, 'extractCreator').mockResolvedValue({
        success: true,
        creator: mockExtractedCreator
      })

      vi.spyOn(mockRepository, 'getCreator')
        .mockResolvedValueOnce(null) // During reconciliation
        .mockResolvedValueOnce(existingCreator) // Second call
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(existingCreator)
      vi.spyOn(mockContentSourceRepository, 'updateContentSource').mockResolvedValue(mockContentSource)
      
      const updatedCreator = {
        ...existingCreator,
        alternativeNames: ['JRE', 'PowerfulJRE'],
        contentSourceIds: [mockContentSource.id]
      }
      vi.spyOn(mockRepository, 'updateCreatorConsolidation').mockResolvedValue(updatedCreator)

      await service.reconcileContentSource(mockContentSource)

      expect(mockRepository.updateCreatorConsolidation).toHaveBeenCalledWith(
        existingCreator.id,
        expect.objectContaining({
          alternativeNames: expect.arrayContaining(['PowerfulJRE'])
        })
      )
    })

    it('should add platform to creator when linking content source', async () => {
      const existingCreator = {
        ...mockCreator,
        platforms: ['spotify'],
        contentSourceIds: ['spotify:abc']
      }

      vi.spyOn(mockExtractionService, 'extractCreator').mockResolvedValue({
        success: true,
        creator: mockExtractedCreator
      })

      vi.spyOn(mockRepository, 'getCreator')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingCreator)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(existingCreator)
      vi.spyOn(mockContentSourceRepository, 'updateContentSource').mockResolvedValue(mockContentSource)
      
      const updatedCreator = {
        ...existingCreator,
        platforms: ['spotify', 'youtube']
      }
      vi.spyOn(mockRepository, 'updateCreatorConsolidation').mockResolvedValue(updatedCreator)

      await service.reconcileContentSource(mockContentSource)

      expect(mockRepository.updateCreatorConsolidation).toHaveBeenCalledWith(
        existingCreator.id,
        expect.objectContaining({
          platforms: ['spotify', 'youtube']
        })
      )
    })

    it('should handle extraction failure', async () => {
      vi.spyOn(mockExtractionService, 'extractCreator').mockResolvedValue({
        success: false,
        error: 'Unsupported platform'
      })

      await expect(
        service.reconcileContentSource(mockContentSource)
      ).rejects.toThrow('Failed to extract creator from content source')
    })

    it('should batch reconcile multiple content sources', async () => {
      const contentSource2 = {
        ...mockContentSource,
        id: 'spotify:4rOoJ6Egrf8K2IrywzwOMk',
        externalId: '4rOoJ6Egrf8K2IrywzwOMk',
        platform: 'spotify',
        sourceType: 'show',
        title: 'The Joe Rogan Experience'
      }

      vi.spyOn(mockExtractionService, 'extractCreator')
        .mockResolvedValueOnce({
          success: true,
          creator: mockExtractedCreator
        })
        .mockResolvedValueOnce({
          success: true,
          creator: { ...mockExtractedCreator, platform: 'spotify' }
        })

      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(mockCreator)
      vi.spyOn(mockContentSourceRepository, 'updateContentSource').mockResolvedValue({} as any)
      vi.spyOn(mockRepository, 'updateCreatorConsolidation').mockResolvedValue(mockCreator)

      const results = await service.reconcileContentSources([
        mockContentSource,
        contentSource2
      ])

      expect(results.size).toBe(2)
      expect(results.get(mockContentSource.id)?.creator).toEqual(mockCreator)
      expect(results.get(contentSource2.id)?.creator).toEqual(mockCreator)
    })

    it('should continue batch reconciliation on individual failures', async () => {
      const contentSource2 = {
        ...mockContentSource,
        id: 'spotify:4rOoJ6Egrf8K2IrywzwOMk',
        platform: 'spotify'
      }

      vi.spyOn(mockExtractionService, 'extractCreator')
        .mockResolvedValueOnce({
          success: false,
          error: 'Extraction failed'
        })
        .mockResolvedValueOnce({
          success: true,
          creator: mockExtractedCreator
        })

      vi.spyOn(mockRepository, 'getCreator').mockResolvedValue(null)
      vi.spyOn(mockRepository, 'findByHandle').mockResolvedValue(mockCreator)
      vi.spyOn(mockContentSourceRepository, 'updateContentSource').mockResolvedValue({} as any)
      vi.spyOn(mockRepository, 'updateCreatorConsolidation').mockResolvedValue(mockCreator)

      const results = await service.reconcileContentSources([
        mockContentSource,
        contentSource2
      ])

      // First source should fail, second should succeed
      expect(results.size).toBe(1)
      expect(results.get(contentSource2.id)?.creator).toEqual(mockCreator)
    })
  })
})
