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
})
