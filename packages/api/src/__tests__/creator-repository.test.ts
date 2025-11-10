import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CreatorRepository } from '../repositories/creator-repository'

describe('CreatorRepository - Reconciliation Methods', () => {
  let mockDB: any
  let repository: CreatorRepository

  beforeEach(() => {
    mockDB = {
      prepare: vi.fn()
    }
    repository = new CreatorRepository(mockDB)
  })

  describe('findByHandle', () => {
    it('should find creator by handle (case-insensitive)', async () => {
      const mockCreator = {
        id: 'youtube:UC123',
        name: 'Test Creator',
        handle: '@testcreator',
        avatar_url: 'https://example.com/avatar.jpg',
        url: 'https://youtube.com/@testcreator',
        platforms: '["youtube"]',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockCreator)
        })
      })

      const result = await repository.findByHandle('@TestCreator')

      expect(mockDB.prepare).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result?.handle).toBe('@testcreator')
      expect(result?.platforms).toEqual(['youtube'])
    })

    it('should return null when creator not found', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null)
        })
      })

      const result = await repository.findByHandle('@nonexistent')

      expect(result).toBeNull()
    })

    it('should normalize handle before searching', async () => {
      let capturedHandle: string | undefined

      mockDB.prepare.mockReturnValue({
        bind: vi.fn((handle: string) => {
          capturedHandle = handle
          return {
            first: vi.fn().mockResolvedValue(null)
          }
        })
      })

      await repository.findByHandle('  @TestUser  ')

      expect(capturedHandle).toBe('@testuser')
    })
  })

  describe('findByDomainPattern', () => {
    it('should find creators by domain pattern', async () => {
      const mockCreators = [
        {
          id: 'youtube:UC123',
          name: 'Creator One',
          url: 'https://youtube.com/@creatorone',
          platforms: '["youtube"]',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'youtube:UC456',
          name: 'Creator Two',
          url: 'https://youtube.com/@creatortwo',
          platforms: '["youtube"]',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: mockCreators })
        })
      })

      const results = await repository.findByDomainPattern('youtube.com')

      expect(mockDB.prepare).toHaveBeenCalled()
      expect(results).toHaveLength(2)
      expect(results[0].url).toContain('youtube.com')
    })

    it('should return empty array when no matches found', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      })

      const results = await repository.findByDomainPattern('nonexistent.com')

      expect(results).toEqual([])
    })
  })

  describe('findByPlatform', () => {
    it('should find creators by platform', async () => {
      const mockCreators = [
        {
          id: 'youtube:UC123',
          name: 'YouTube Creator',
          platforms: '["youtube"]',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'multi:123',
          name: 'Multi-Platform Creator',
          platforms: '["youtube","spotify"]',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: mockCreators })
        })
      })

      const results = await repository.findByPlatform('youtube')

      expect(mockDB.prepare).toHaveBeenCalled()
      expect(results).toHaveLength(2)
      results.forEach(creator => {
        expect(creator.platforms).toContain('youtube')
      })
    })

    it('should return empty array when no creators on platform', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      })

      const results = await repository.findByPlatform('unknown')

      expect(results).toEqual([])
    })

    it('should properly parse platforms JSON array', async () => {
      const mockCreator = {
        id: 'multi:123',
        name: 'Multi Creator',
        platforms: '["youtube","spotify","twitter"]',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [mockCreator] })
        })
      })

      const results = await repository.findByPlatform('spotify')

      expect(results[0].platforms).toEqual(['youtube', 'spotify', 'twitter'])
    })
  })
})
