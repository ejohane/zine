import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractHandleFromUrl, extractHandleFromSubscriptionUrl } from '../utils/handle-extraction'
import { YouTubeAPI } from '../external/youtube-api'

describe('Handle Extraction Utils', () => {
  describe('extractHandleFromUrl', () => {
    describe('YouTube URLs', () => {
      it('should extract handle from @username format', () => {
        const urls = [
          'https://www.youtube.com/@testuser',
          'https://youtube.com/@testuser',
          'https://www.youtube.com/@testuser/videos',
          'https://m.youtube.com/@test-user_123'
        ]

        urls.forEach(url => {
          const result = extractHandleFromUrl(url)
          expect(result.platform).toBe('youtube')
          expect(result.requiresApiCall).toBe(false)
          expect(result.handle).toBeTruthy()
          expect(result.handle?.startsWith('@')).toBe(true)
        })
      })

      it('should extract custom URL from /c/ format', () => {
        const result = extractHandleFromUrl('https://www.youtube.com/c/CustomChannelName')
        
        expect(result.platform).toBe('youtube')
        expect(result.requiresApiCall).toBe(false)
        expect(result.handle).toBe('CustomChannelName')
      })

      it('should flag channel ID URLs as requiring API call', () => {
        const result = extractHandleFromUrl('https://www.youtube.com/channel/UCxxxxxxxxxxxxx')
        
        expect(result.platform).toBe('youtube')
        expect(result.requiresApiCall).toBe(true)
        expect(result.handle).toBeUndefined()
      })

      it('should handle youtu.be short URLs', () => {
        const result = extractHandleFromUrl('https://youtu.be/@testuser')
        
        expect(result.platform).toBe('youtube')
        expect(result.handle).toBe('@testuser')
      })

      it('should handle malformed YouTube URLs gracefully', () => {
        const result = extractHandleFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
        
        expect(result.platform).toBe('youtube')
        expect(result.handle).toBeUndefined()
        expect(result.requiresApiCall).toBe(false)
      })
    })

    describe('Spotify URLs', () => {
      it('should return undefined for Spotify show URLs', () => {
        const result = extractHandleFromUrl('https://open.spotify.com/show/5CfCWKI5pZ28U0uOzXkDHe')
        
        expect(result.platform).toBe('spotify')
        expect(result.handle).toBeUndefined()
        expect(result.requiresApiCall).toBe(false)
      })

      it('should return undefined for Spotify episode URLs', () => {
        const result = extractHandleFromUrl('https://open.spotify.com/episode/xxxxx')
        
        expect(result.platform).toBe('spotify')
        expect(result.handle).toBeUndefined()
      })
    })

    describe('Unknown platforms', () => {
      it('should handle unknown platforms', () => {
        const result = extractHandleFromUrl('https://example.com/creator')
        
        expect(result.platform).toBe('unknown')
        expect(result.handle).toBeUndefined()
        expect(result.requiresApiCall).toBe(false)
      })

      it('should handle invalid URLs', () => {
        const result = extractHandleFromUrl('not a url')
        
        expect(result.platform).toBe('unknown')
        expect(result.handle).toBeUndefined()
      })
    })
  })

  describe('extractHandleFromSubscriptionUrl', () => {
    let mockYouTubeApi: YouTubeAPI

    beforeEach(() => {
      mockYouTubeApi = {
        getChannel: vi.fn()
      } as any
    })

    it('should return handle directly from URL if available', async () => {
      const handle = await extractHandleFromSubscriptionUrl(
        'https://www.youtube.com/@testuser',
        mockYouTubeApi
      )

      expect(handle).toBe('@testuser')
      expect(mockYouTubeApi.getChannel).not.toHaveBeenCalled()
    })

    it('should fetch handle from API for channel ID URLs', async () => {
      vi.mocked(mockYouTubeApi.getChannel).mockResolvedValue({
        id: 'UCxxxxx',
        snippet: {
          title: 'Test Channel',
          description: 'Test',
          thumbnails: {},
          publishedAt: '2020-01-01',
          customUrl: 'testchannel'
        }
      })

      const handle = await extractHandleFromSubscriptionUrl(
        'https://www.youtube.com/channel/UCxxxxx',
        mockYouTubeApi
      )

      expect(mockYouTubeApi.getChannel).toHaveBeenCalledWith('UCxxxxx')
      expect(handle).toBe('@testchannel')
    })

    it('should handle customUrl with @ prefix', async () => {
      vi.mocked(mockYouTubeApi.getChannel).mockResolvedValue({
        id: 'UCxxxxx',
        snippet: {
          title: 'Test Channel',
          description: 'Test',
          thumbnails: {},
          publishedAt: '2020-01-01',
          customUrl: '@testchannel'
        }
      })

      const handle = await extractHandleFromSubscriptionUrl(
        'https://www.youtube.com/channel/UCxxxxx',
        mockYouTubeApi
      )

      expect(handle).toBe('@testchannel')
    })

    it('should return undefined if API call fails', async () => {
      vi.mocked(mockYouTubeApi.getChannel).mockRejectedValue(
        new Error('API error')
      )

      const handle = await extractHandleFromSubscriptionUrl(
        'https://www.youtube.com/channel/UCxxxxx',
        mockYouTubeApi
      )

      expect(handle).toBeUndefined()
    })

    it('should return undefined if channel has no customUrl', async () => {
      vi.mocked(mockYouTubeApi.getChannel).mockResolvedValue({
        id: 'UCxxxxx',
        snippet: {
          title: 'Test Channel',
          description: 'Test',
          thumbnails: {},
          publishedAt: '2020-01-01'
          // No customUrl
        }
      })

      const handle = await extractHandleFromSubscriptionUrl(
        'https://www.youtube.com/channel/UCxxxxx',
        mockYouTubeApi
      )

      expect(handle).toBeUndefined()
    })

    it('should work without YouTube API provided', async () => {
      const handle = await extractHandleFromSubscriptionUrl(
        'https://www.youtube.com/@testuser'
      )

      expect(handle).toBe('@testuser')
    })

    it('should return undefined for channel IDs without API', async () => {
      const handle = await extractHandleFromSubscriptionUrl(
        'https://www.youtube.com/channel/UCxxxxx'
      )

      expect(handle).toBeUndefined()
    })

    it('should always return undefined for Spotify URLs', async () => {
      const handle = await extractHandleFromSubscriptionUrl(
        'https://open.spotify.com/show/5CfCWKI5pZ28U0uOzXkDHe',
        mockYouTubeApi
      )

      expect(handle).toBeUndefined()
      expect(mockYouTubeApi.getChannel).not.toHaveBeenCalled()
    })
  })
})
