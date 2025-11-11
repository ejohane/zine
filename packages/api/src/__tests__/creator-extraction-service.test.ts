import { describe, it, expect, beforeEach } from 'vitest'
import { CreatorExtractionService } from '../services/creator-extraction-service'
import type { ContentSource } from '../repositories/content-source-repository'

describe('CreatorExtractionService', () => {
  let service: CreatorExtractionService

  beforeEach(() => {
    service = new CreatorExtractionService()
  })

  describe('YouTube extraction', () => {
    it('should extract creator from YouTube channel with complete data', async () => {
      const contentSource: ContentSource = {
        id: 'youtube:UCzQUP1qoWDoEbmsQxvdjxgQ',
        externalId: 'UCzQUP1qoWDoEbmsQxvdjxgQ',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'PowerfulJRE',
        description: 'The Joe Rogan Experience podcast',
        thumbnailUrl: 'https://example.com/avatar.jpg',
        url: 'https://youtube.com/@PowerfulJRE',
        creatorName: 'Joe Rogan',
        subscriberCount: 17500000,
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.creator).toBeDefined()
      expect(result.creator?.name).toBe('Joe Rogan')
      expect(result.creator?.handle).toBe('@PowerfulJRE')
      expect(result.creator?.platform).toBe('youtube')
      expect(result.creator?.platformId).toBe('UCzQUP1qoWDoEbmsQxvdjxgQ')
      expect(result.creator?.avatarUrl).toBe('https://example.com/avatar.jpg')
      expect(result.creator?.subscriberCount).toBe(17500000)
      expect(result.creator?.verified).toBe(true)
      expect(result.creator?.extractionMethod).toBe('direct')
      expect(result.creator?.extractionConfidence).toBeGreaterThan(0.8)
    })

    it('should extract creator from YouTube channel with minimal data', async () => {
      const contentSource: ContentSource = {
        id: 'youtube:UC123',
        externalId: 'UC123',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'Test Channel',
        url: 'https://youtube.com/channel/UC123',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.creator).toBeDefined()
      expect(result.creator?.name).toBe('Test Channel')
      expect(result.creator?.platform).toBe('youtube')
      expect(result.creator?.extractionConfidence).toBeGreaterThan(0)
    })

    it('should use title as creator name when creatorName is missing', async () => {
      const contentSource: ContentSource = {
        id: 'youtube:UC456',
        externalId: 'UC456',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'Channel Title',
        url: 'https://youtube.com/channel/UC456',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.creator?.name).toBe('Channel Title')
    })

    it('should extract handle from URL', async () => {
      const contentSource: ContentSource = {
        id: 'youtube:UC789',
        externalId: 'UC789',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'Test',
        url: 'https://youtube.com/@testhandle',
        creatorName: 'Test Creator',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.creator?.handle).toBe('@testhandle')
    })

    it('should include alternative names when title differs from creator name', async () => {
      const contentSource: ContentSource = {
        id: 'youtube:UC999',
        externalId: 'UC999',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'PowerfulJRE',
        creatorName: 'Joe Rogan',
        url: 'https://youtube.com/@PowerfulJRE',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.creator?.alternativeNames).toContain('PowerfulJRE')
    })

    it('should warn on unexpected YouTube source type', async () => {
      const contentSource: ContentSource = {
        id: 'youtube:PL123',
        externalId: 'PL123',
        platform: 'youtube',
        sourceType: 'playlist',
        title: 'Playlist',
        url: 'https://youtube.com/playlist?list=PL123',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings?.some(w => w.includes('Unexpected YouTube source type'))).toBe(true)
    })
  })

  describe('Spotify extraction', () => {
    it('should extract creator from Spotify show with complete data', async () => {
      const contentSource: ContentSource = {
        id: 'spotify:4rOoJ6Egrf8K2IrywzwOMk',
        externalId: '4rOoJ6Egrf8K2IrywzwOMk',
        platform: 'spotify',
        sourceType: 'show',
        title: 'The Joe Rogan Experience',
        description: 'The official podcast of comedian Joe Rogan',
        thumbnailUrl: 'https://example.com/show-art.jpg',
        url: 'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk',
        creatorName: 'Joe Rogan',
        totalEpisodes: 2000,
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.creator).toBeDefined()
      expect(result.creator?.name).toBe('Joe Rogan')
      expect(result.creator?.platform).toBe('spotify')
      expect(result.creator?.platformId).toBe('4rOoJ6Egrf8K2IrywzwOMk')
      expect(result.creator?.avatarUrl).toBe('https://example.com/show-art.jpg')
      expect(result.creator?.extractionMethod).toBe('metadata')
      expect(result.creator?.extractionConfidence).toBeGreaterThan(0.7)
    })

    it('should extract creator from Spotify show with minimal data', async () => {
      const contentSource: ContentSource = {
        id: 'spotify:show123',
        externalId: 'show123',
        platform: 'spotify',
        sourceType: 'show',
        title: 'Podcast Show',
        url: 'https://open.spotify.com/show/show123',
        creatorName: 'Publisher Name',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.creator).toBeDefined()
      expect(result.creator?.name).toBe('Publisher Name')
      expect(result.creator?.platform).toBe('spotify')
    })

    it('should fail when Spotify show is missing creator name', async () => {
      const contentSource: ContentSource = {
        id: 'spotify:show456',
        externalId: 'show456',
        platform: 'spotify',
        sourceType: 'show',
        title: 'Show Without Publisher',
        url: 'https://open.spotify.com/show/show456',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should include alternative names for Spotify shows', async () => {
      const contentSource: ContentSource = {
        id: 'spotify:show789',
        externalId: 'show789',
        platform: 'spotify',
        sourceType: 'show',
        title: 'The Daily',
        creatorName: 'The New York Times',
        url: 'https://open.spotify.com/show/show789',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.creator?.alternativeNames).toContain('The Daily')
    })

    it('should have lower confidence for Spotify extraction', async () => {
      const contentSource: ContentSource = {
        id: 'spotify:show999',
        externalId: 'show999',
        platform: 'spotify',
        sourceType: 'show',
        title: 'Test Show',
        creatorName: 'Test Publisher',
        url: 'https://open.spotify.com/show/show999',
        thumbnailUrl: 'https://example.com/art.jpg',
        description: 'Test description',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      // Spotify extraction should be capped at 0.8
      expect(result.creator?.extractionConfidence).toBeLessThanOrEqual(0.8)
    })

    it('should warn on unexpected Spotify source type', async () => {
      const contentSource: ContentSource = {
        id: 'spotify:album123',
        externalId: 'album123',
        platform: 'spotify',
        sourceType: 'album',
        title: 'Album',
        creatorName: 'Artist',
        url: 'https://open.spotify.com/album/album123',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings?.some(w => w.includes('Unexpected Spotify source type'))).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should fail when platform is missing', async () => {
      const contentSource = {
        id: 'test:123',
        externalId: '123',
        platform: '',
        sourceType: 'channel',
        title: 'Test',
        url: 'https://example.com',
        createdAt: new Date(),
        updatedAt: new Date()
      } as ContentSource

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(false)
      expect(result.error).toContain('missing platform')
    })

    it('should fail for unsupported platform', async () => {
      const contentSource: ContentSource = {
        id: 'twitter:123',
        externalId: '123',
        platform: 'twitter',
        sourceType: 'profile',
        title: 'Test',
        url: 'https://twitter.com/test',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsupported platform')
    })
  })

  describe('Batch extraction', () => {
    it('should extract creators from multiple content sources', async () => {
      const contentSources: ContentSource[] = [
        {
          id: 'youtube:UC1',
          externalId: 'UC1',
          platform: 'youtube',
          sourceType: 'channel',
          title: 'Channel 1',
          url: 'https://youtube.com/@channel1',
          creatorName: 'Creator 1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'spotify:show1',
          externalId: 'show1',
          platform: 'spotify',
          sourceType: 'show',
          title: 'Show 1',
          url: 'https://open.spotify.com/show/show1',
          creatorName: 'Publisher 1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]

      const results = await service.extractCreators(contentSources)

      expect(results.size).toBe(2)
      expect(results.get('youtube:UC1')?.success).toBe(true)
      expect(results.get('spotify:show1')?.success).toBe(true)
    })

    it('should handle mixed success and failure in batch', async () => {
      const contentSources: ContentSource[] = [
        {
          id: 'youtube:UC1',
          externalId: 'UC1',
          platform: 'youtube',
          sourceType: 'channel',
          title: 'Channel 1',
          url: 'https://youtube.com/@channel1',
          creatorName: 'Creator 1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'spotify:show1',
          externalId: 'show1',
          platform: 'spotify',
          sourceType: 'show',
          title: 'Show Without Publisher',
          url: 'https://open.spotify.com/show/show1',
          // Missing creatorName - should fail
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]

      const results = await service.extractCreators(contentSources)

      expect(results.size).toBe(2)
      expect(results.get('youtube:UC1')?.success).toBe(true)
      expect(results.get('spotify:show1')?.success).toBe(false)
    })
  })

  describe('Statistics', () => {
    it('should calculate extraction statistics', async () => {
      const contentSources: ContentSource[] = [
        {
          id: 'youtube:UC1',
          externalId: 'UC1',
          platform: 'youtube',
          sourceType: 'channel',
          title: 'Channel 1',
          url: 'https://youtube.com/@channel1',
          creatorName: 'Creator 1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'youtube:UC2',
          externalId: 'UC2',
          platform: 'youtube',
          sourceType: 'channel',
          title: 'Channel 2',
          url: 'https://youtube.com/@channel2',
          creatorName: 'Creator 2',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'spotify:show1',
          externalId: 'show1',
          platform: 'spotify',
          sourceType: 'show',
          title: 'Show 1',
          url: 'https://open.spotify.com/show/show1',
          creatorName: 'Publisher 1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]

      const results = await service.extractCreators(contentSources)
      const stats = service.getStatistics(results)

      expect(stats.total).toBe(3)
      expect(stats.successful).toBe(3)
      expect(stats.failed).toBe(0)
      expect(stats.byPlatform['youtube']).toBe(2)
      expect(stats.byPlatform['spotify']).toBe(1)
      expect(stats.avgConfidence).toBeGreaterThan(0)
    })

    it('should handle empty results', () => {
      const results = new Map()
      const stats = service.getStatistics(results)

      expect(stats.total).toBe(0)
      expect(stats.successful).toBe(0)
      expect(stats.failed).toBe(0)
      expect(stats.avgConfidence).toBe(0)
    })
  })

  describe('Confidence scoring', () => {
    it('should give higher confidence for YouTube with complete data', async () => {
      const complete: ContentSource = {
        id: 'youtube:UC1',
        externalId: 'UC1',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'Channel',
        url: 'https://youtube.com/@handle',
        creatorName: 'Creator',
        thumbnailUrl: 'https://example.com/avatar.jpg',
        description: 'Bio',
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const minimal: ContentSource = {
        id: 'youtube:UC2',
        externalId: 'UC2',
        platform: 'youtube',
        sourceType: 'channel',
        title: 'Channel',
        url: 'https://youtube.com/channel/UC2',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const completeResult = await service.extractCreator(complete)
      const minimalResult = await service.extractCreator(minimal)

      expect(completeResult.creator?.extractionConfidence).toBeGreaterThan(
        minimalResult.creator?.extractionConfidence || 0
      )
    })

    it('should cap Spotify confidence at 0.8', async () => {
      const contentSource: ContentSource = {
        id: 'spotify:show1',
        externalId: 'show1',
        platform: 'spotify',
        sourceType: 'show',
        title: 'Show',
        url: 'https://open.spotify.com/show/show1',
        creatorName: 'Publisher',
        thumbnailUrl: 'https://example.com/art.jpg',
        description: 'Description',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await service.extractCreator(contentSource)

      expect(result.creator?.extractionConfidence).toBeLessThanOrEqual(0.8)
    })
  })
})
