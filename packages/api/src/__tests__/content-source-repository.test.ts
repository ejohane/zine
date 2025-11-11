import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ContentSourceRepository } from '../repositories/content-source-repository'

describe('ContentSourceRepository', () => {
  let mockDB: any
  let repository: ContentSourceRepository

  beforeEach(() => {
    mockDB = {
      prepare: vi.fn()
    }
    repository = new ContentSourceRepository(mockDB)
  })

  describe('createContentSource', () => {
    it('should create a new content source', async () => {
      const mockContentSource = {
        id: 'youtube:UCzQUP1qoWDoEbmsQxvdjxgQ',
        external_id: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
        platform: 'youtube',
        source_type: 'channel',
        title: 'PowerfulJRE',
        description: 'The Joe Rogan Experience',
        thumbnail_url: 'https://example.com/thumb.jpg',
        url: 'https://youtube.com/@PowerfulJRE',
        creator_id: 'creator:joe-rogan',
        creator_name: 'Joe Rogan',
        subscriber_count: 17500000,
        is_verified: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockContentSource)
        })
      })

      const input = {
        id: 'youtube:UCzQUP1qoWDoEbmsQxvdjxgQ',
        externalId: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'PowerfulJRE',
        description: 'The Joe Rogan Experience',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        url: 'https://youtube.com/@PowerfulJRE',
        creatorId: 'creator:joe-rogan',
        creatorName: 'Joe Rogan',
        subscriberCount: 17500000,
        isVerified: true
      }

      const result = await repository.createContentSource(input)

      expect(mockDB.prepare).toHaveBeenCalled()
      expect(result.id).toBe('youtube:UCzQUP1qoWDoEbmsQxvdjxgQ')
      expect(result.platform).toBe('youtube')
      expect(result.sourceType).toBe('channel')
      expect(result.title).toBe('PowerfulJRE')
      expect(result.isVerified).toBe(true)
    })

    it('should handle optional fields correctly', async () => {
      const mockContentSource = {
        id: 'spotify:4rOoJ6Egrf8K2IrywzwOMk',
        external_id: '4rOoJ6Egrf8K2IrywzwOMk',
        platform: 'spotify',
        source_type: 'show',
        title: 'The Joe Rogan Experience',
        url: 'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk',
        total_episodes: 2000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockContentSource)
        })
      })

      const input = {
        id: 'spotify:4rOoJ6Egrf8K2IrywzwOMk',
        externalId: '4rOoJ6Egrf8K2IrywzwOMk',
        platform: 'spotify',
        sourceType: 'show',
        title: 'The Joe Rogan Experience',
        url: 'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk',
        totalEpisodes: 2000
      }

      const result = await repository.createContentSource(input)

      expect(result.totalEpisodes).toBe(2000)
      expect(result.description).toBeUndefined()
      expect(result.creatorId).toBeUndefined()
    })
  })

  describe('getContentSource', () => {
    it('should retrieve content source by ID', async () => {
      const mockContentSource = {
        id: 'youtube:UCzQUP1qoWDoEbmsQxvdjxgQ',
        external_id: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
        platform: 'youtube',
        source_type: 'channel',
        title: 'PowerfulJRE',
        url: 'https://youtube.com/@PowerfulJRE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockContentSource)
        })
      })

      const result = await repository.getContentSource('youtube:UCzQUP1qoWDoEbmsQxvdjxgQ')

      expect(result).toBeTruthy()
      expect(result?.id).toBe('youtube:UCzQUP1qoWDoEbmsQxvdjxgQ')
    })

    it('should return null when content source not found', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null)
        })
      })

      const result = await repository.getContentSource('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getContentSourceByPlatformId', () => {
    it('should retrieve content source by platform and external ID', async () => {
      const mockContentSource = {
        id: 'youtube:UCzQUP1qoWDoEbmsQxvdjxgQ',
        external_id: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
        platform: 'youtube',
        source_type: 'channel',
        title: 'PowerfulJRE',
        url: 'https://youtube.com/@PowerfulJRE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockContentSource)
        })
      })

      const result = await repository.getContentSourceByPlatformId('youtube', 'UCzQUP1qoWDoEbmsQxvdjxgQ')

      expect(result).toBeTruthy()
      expect(result?.platform).toBe('youtube')
      expect(result?.externalId).toBe('UCzQUP1qoWDoEbmsQxvdjxgQ')
    })

    it('should return null when not found', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null)
        })
      })

      const result = await repository.getContentSourceByPlatformId('spotify', 'nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('updateContentSource', () => {
    it('should update content source fields', async () => {
      const mockUpdated = {
        id: 'youtube:UCzQUP1qoWDoEbmsQxvdjxgQ',
        external_id: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
        platform: 'youtube',
        source_type: 'channel',
        title: 'PowerfulJRE - Updated',
        url: 'https://youtube.com/@PowerfulJRE',
        creator_id: 'creator:joe-rogan',
        subscriber_count: 18000000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockUpdated)
        })
      })

      const result = await repository.updateContentSource('youtube:UCzQUP1qoWDoEbmsQxvdjxgQ', {
        title: 'PowerfulJRE - Updated',
        creatorId: 'creator:joe-rogan',
        subscriberCount: 18000000
      })

      expect(result.title).toBe('PowerfulJRE - Updated')
      expect(result.creatorId).toBe('creator:joe-rogan')
      expect(result.subscriberCount).toBe(18000000)
    })

    it('should update lastPolledAt timestamp', async () => {
      const now = new Date()
      const mockUpdated = {
        id: 'youtube:UCzQUP1qoWDoEbmsQxvdjxgQ',
        external_id: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
        platform: 'youtube',
        source_type: 'channel',
        title: 'PowerfulJRE',
        url: 'https://youtube.com/@PowerfulJRE',
        last_polled_at: now.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockUpdated)
        })
      })

      const result = await repository.updateContentSource('youtube:UCzQUP1qoWDoEbmsQxvdjxgQ', {
        lastPolledAt: now
      })

      expect(result.lastPolledAt).toBeInstanceOf(Date)
    })
  })

  describe('upsertContentSource', () => {
    it('should create when content source does not exist', async () => {
      const mockContentSource = {
        id: 'youtube:UCnew',
        external_id: 'UCnew',
        platform: 'youtube',
        source_type: 'channel',
        title: 'New Channel',
        url: 'https://youtube.com/@newchannel',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      // First call to getContentSource returns null (doesn't exist)
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null)
        })
      })

      // Second call to createContentSource
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockContentSource)
        })
      })

      const input = {
        id: 'youtube:UCnew',
        externalId: 'UCnew',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'New Channel',
        url: 'https://youtube.com/@newchannel'
      }

      const result = await repository.upsertContentSource(input)

      expect(result.id).toBe('youtube:UCnew')
      expect(result.title).toBe('New Channel')
    })

    it('should update when content source exists', async () => {
      const existing = {
        id: 'youtube:UCexisting',
        external_id: 'UCexisting',
        platform: 'youtube',
        source_type: 'channel',
        title: 'Old Title',
        url: 'https://youtube.com/@channel',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const updated = {
        ...existing,
        title: 'New Title',
        updated_at: new Date().toISOString()
      }

      // First call to getContentSource returns existing
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(existing)
        })
      })

      // Second call to updateContentSource
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(updated)
        })
      })

      const input = {
        id: 'youtube:UCexisting',
        externalId: 'UCexisting',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'New Title',
        url: 'https://youtube.com/@channel'
      }

      const result = await repository.upsertContentSource(input)

      expect(result.title).toBe('New Title')
    })
  })

  describe('getContentSourcesByCreator', () => {
    it('should retrieve all content sources for a creator', async () => {
      const mockSources = [
        {
          id: 'youtube:UCzQUP1qoWDoEbmsQxvdjxgQ',
          external_id: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
          platform: 'youtube',
          source_type: 'channel',
          title: 'PowerfulJRE',
          url: 'https://youtube.com/@PowerfulJRE',
          creator_id: 'creator:joe-rogan',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'spotify:4rOoJ6Egrf8K2IrywzwOMk',
          external_id: '4rOoJ6Egrf8K2IrywzwOMk',
          platform: 'spotify',
          source_type: 'show',
          title: 'The Joe Rogan Experience',
          url: 'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk',
          creator_id: 'creator:joe-rogan',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: mockSources })
        })
      })

      const results = await repository.getContentSourcesByCreator('creator:joe-rogan')

      expect(results).toHaveLength(2)
      expect(results[0].platform).toBe('youtube')
      expect(results[1].platform).toBe('spotify')
      expect(results[0].creatorId).toBe('creator:joe-rogan')
      expect(results[1].creatorId).toBe('creator:joe-rogan')
    })

    it('should return empty array when creator has no sources', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      })

      const results = await repository.getContentSourcesByCreator('creator:nosources')

      expect(results).toHaveLength(0)
    })
  })

  describe('getContentSourcesByPlatform', () => {
    it('should retrieve all content sources for a platform', async () => {
      const mockSources = [
        {
          id: 'youtube:UC1',
          external_id: 'UC1',
          platform: 'youtube',
          source_type: 'channel',
          title: 'Channel 1',
          url: 'https://youtube.com/@channel1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'youtube:UC2',
          external_id: 'UC2',
          platform: 'youtube',
          source_type: 'channel',
          title: 'Channel 2',
          url: 'https://youtube.com/@channel2',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: mockSources })
        })
      })

      const results = await repository.getContentSourcesByPlatform('youtube')

      expect(results).toHaveLength(2)
      expect(results.every(s => s.platform === 'youtube')).toBe(true)
    })
  })

  describe('getContentSourcesNeedingPoll', () => {
    it('should retrieve stale content sources', async () => {
      const oneHourAgo = new Date(Date.now() - 3600000)
      const mockSources = [
        {
          id: 'youtube:UCstale',
          external_id: 'UCstale',
          platform: 'youtube',
          source_type: 'channel',
          title: 'Stale Channel',
          url: 'https://youtube.com/@stale',
          last_polled_at: oneHourAgo.toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: mockSources })
        })
      })

      const results = await repository.getContentSourcesNeedingPoll(3600000, 50)

      expect(results.length).toBeGreaterThan(0)
    })

    it('should include sources with null lastPolledAt', async () => {
      const mockSources = [
        {
          id: 'youtube:UCnever',
          external_id: 'UCnever',
          platform: 'youtube',
          source_type: 'channel',
          title: 'Never Polled',
          url: 'https://youtube.com/@never',
          last_polled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: mockSources })
        })
      })

      const results = await repository.getContentSourcesNeedingPoll()

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].lastPolledAt).toBeUndefined()
    })
  })

  describe('deleteContentSource', () => {
    it('should delete a content source', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue(undefined)
        })
      })

      await repository.deleteContentSource('youtube:UCdelete')

      expect(mockDB.prepare).toHaveBeenCalled()
    })
  })

  describe('getContentSourcesWithoutCreator', () => {
    it('should retrieve content sources without assigned creator', async () => {
      const mockSources = [
        {
          id: 'youtube:UCorphan',
          external_id: 'UCorphan',
          platform: 'youtube',
          source_type: 'channel',
          title: 'Orphan Channel',
          url: 'https://youtube.com/@orphan',
          creator_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: mockSources })
        })
      })

      const results = await repository.getContentSourcesWithoutCreator()

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].creatorId).toBeUndefined()
    })
  })

  describe('getContentSourcesByType', () => {
    it('should retrieve content sources by source type', async () => {
      const mockShows = [
        {
          id: 'spotify:show1',
          external_id: 'show1',
          platform: 'spotify',
          source_type: 'show',
          title: 'Podcast Show 1',
          url: 'https://open.spotify.com/show/show1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'spotify:show2',
          external_id: 'show2',
          platform: 'spotify',
          source_type: 'show',
          title: 'Podcast Show 2',
          url: 'https://open.spotify.com/show/show2',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: mockShows })
        })
      })

      const results = await repository.getContentSourcesByType('show')

      expect(results).toHaveLength(2)
      expect(results.every(s => s.sourceType === 'show')).toBe(true)
    })
  })

  describe('metadata handling', () => {
    it('should serialize and deserialize metadata correctly', async () => {
      const metadata = {
        customField: 'value',
        nestedObject: {
          key: 'nestedValue'
        }
      }

      const mockContentSource = {
        id: 'youtube:UCmeta',
        external_id: 'UCmeta',
        platform: 'youtube',
        source_type: 'channel',
        title: 'Channel with Metadata',
        url: 'https://youtube.com/@meta',
        metadata: JSON.stringify(metadata),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockContentSource)
        })
      })

      const input = {
        id: 'youtube:UCmeta',
        externalId: 'UCmeta',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'Channel with Metadata',
        url: 'https://youtube.com/@meta',
        metadata
      }

      const result = await repository.createContentSource(input)

      expect(result.metadata).toEqual(metadata)
      expect(result.metadata?.customField).toBe('value')
      expect(result.metadata?.nestedObject.key).toBe('nestedValue')
    })
  })
})
