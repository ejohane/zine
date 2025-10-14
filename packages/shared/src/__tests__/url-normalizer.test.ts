import { describe, it, expect } from 'vitest'
import { 
  normalizeUrl, 
  areUrlsDuplicates, 
  extractDomain,
  detectPlatform,
  isValidUrl 
} from '../url-normalizer'

describe('URL Normalizer', () => {
  describe('normalizeUrl', () => {
    describe('YouTube normalization', () => {
      it('should normalize youtube.com URLs', () => {
        const result = normalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be')
        expect(result.normalized).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ')
        expect(result.platform).toBe('youtube')
      })

      it('should convert youtu.be to youtube.com', () => {
        const result = normalizeUrl('https://youtu.be/dQw4w9WgXcQ')
        expect(result.normalized).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ')
        expect(result.platform).toBe('youtube')
      })

      it('should handle m.youtube.com', () => {
        const result = normalizeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')
        expect(result.normalized).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ')
        expect(result.platform).toBe('youtube')
      })

      it('should preserve time parameters', () => {
        const result = normalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')
        expect(result.normalized).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s')
      })

      it('should remove tracking parameters', () => {
        const result = normalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&ab_channel=TestChannel&utm_source=share')
        expect(result.normalized).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ')
      })

      it('should handle YouTube Shorts', () => {
        const result = normalizeUrl('https://www.youtube.com/shorts/abc123')
        expect(result.normalized).toBe('https://youtube.com/shorts/abc123')
        expect(result.platform).toBe('youtube')
      })

      it('should handle YouTube playlists', () => {
        const result = normalizeUrl('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')
        expect(result.normalized).toBe('https://youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')
        expect(result.platform).toBe('youtube')
      })

      it('should handle YouTube channels', () => {
        const result = normalizeUrl('https://www.youtube.com/channel/UC1234567890')
        expect(result.normalized).toBe('https://youtube.com/channel/UC1234567890')
        expect(result.platform).toBe('youtube')
      })
    })

    describe('Spotify normalization', () => {
      it('should normalize open.spotify.com URLs', () => {
        const result = normalizeUrl('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8?si=abc123')
        expect(result.normalized).toBe('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8')
        expect(result.platform).toBe('spotify')
      })

      it('should handle Spotify playlists', () => {
        const result = normalizeUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123')
        expect(result.normalized).toBe('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
        expect(result.platform).toBe('spotify')
      })

      it('should handle Spotify albums', () => {
        const result = normalizeUrl('https://open.spotify.com/album/6deiaArbeoqp1xPEGdEKp1?si=abc123')
        expect(result.normalized).toBe('https://open.spotify.com/album/6deiaArbeoqp1xPEGdEKp1')
        expect(result.platform).toBe('spotify')
      })

      it('should handle Spotify episodes', () => {
        const result = normalizeUrl('https://open.spotify.com/episode/4P86ZzHf7EOlRG7do9LkKZ?si=abc123')
        expect(result.normalized).toBe('https://open.spotify.com/episode/4P86ZzHf7EOlRG7do9LkKZ')
        expect(result.platform).toBe('spotify')
      })

      it('should handle Spotify shows', () => {
        const result = normalizeUrl('https://open.spotify.com/show/0ofXAdFIQQRsCYj9754UFx?si=abc123')
        expect(result.normalized).toBe('https://open.spotify.com/show/0ofXAdFIQQRsCYj9754UFx')
        expect(result.platform).toBe('spotify')
      })

      it('should remove Spotify tracking parameters', () => {
        const result = normalizeUrl('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8?highlight=spotify:track:1234&context=spotify:album:5678')
        expect(result.normalized).toBe('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8')
      })

      it('should normalize locale-prefixed Spotify URLs', () => {
        const result = normalizeUrl('https://open.spotify.com/intl-en/episode/4P86ZzHf7EOlRG7do9LkKZ?si=abc123')
        expect(result.normalized).toBe('https://open.spotify.com/episode/4P86ZzHf7EOlRG7do9LkKZ')
        expect(result.platform).toBe('spotify')
      })

      it('should normalize embedded Spotify URLs', () => {
        const result = normalizeUrl('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator')
        expect(result.normalized).toBe('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
        expect(result.platform).toBe('spotify')
      })

      it('should normalize embedded podcast Spotify URLs', () => {
        const result = normalizeUrl('https://open.spotify.com/embed-podcast/episode/4P86ZzHf7EOlRG7do9LkKZ?si=abc123')
        expect(result.normalized).toBe('https://open.spotify.com/episode/4P86ZzHf7EOlRG7do9LkKZ')
        expect(result.platform).toBe('spotify')
      })

      it('should normalize spotify URIs', () => {
        const result = normalizeUrl('spotify:episode:4P86ZzHf7EOlRG7do9LkKZ')
        expect(result.normalized).toBe('https://open.spotify.com/episode/4P86ZzHf7EOlRG7do9LkKZ')
        expect(result.platform).toBe('spotify')
      })

      it('should normalize spotify user playlist URIs', () => {
        const result = normalizeUrl('spotify:user:spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')
        expect(result.normalized).toBe('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
        expect(result.platform).toBe('spotify')
      })
    })

    describe('Twitter/X normalization', () => {
      it('should normalize twitter.com to x.com', () => {
        const result = normalizeUrl('https://twitter.com/user/status/1234567890')
        expect(result.normalized).toBe('https://x.com/user/status/1234567890')
        expect(result.platform).toBe('x')
      })

      it('should handle x.com URLs', () => {
        const result = normalizeUrl('https://x.com/user/status/1234567890?s=20')
        expect(result.normalized).toBe('https://x.com/user/status/1234567890')
        expect(result.platform).toBe('x')
      })

      it('should remove Twitter tracking parameters', () => {
        const result = normalizeUrl('https://twitter.com/user/status/1234567890?s=20&t=abc123')
        expect(result.normalized).toBe('https://x.com/user/status/1234567890')
      })
    })

    describe('General normalization', () => {
      it('should remove www prefix', () => {
        const result = normalizeUrl('https://www.example.com/page')
        expect(result.normalized).toBe('https://example.com/page')
        expect(result.domain).toBe('example.com')
      })

      it('should force HTTPS', () => {
        const result = normalizeUrl('http://example.com/page')
        expect(result.normalized).toBe('https://example.com/page')
      })

      it('should not force HTTPS for localhost', () => {
        const result = normalizeUrl('http://localhost:3000/page')
        expect(result.normalized).toBe('http://localhost:3000/page')
      })

      it('should remove trailing slashes', () => {
        const result = normalizeUrl('https://example.com/page/')
        expect(result.normalized).toBe('https://example.com/page')
      })

      it('should preserve root path slash', () => {
        const result = normalizeUrl('https://example.com/')
        expect(result.normalized).toBe('https://example.com/')
      })

      it('should remove hash fragments', () => {
        const result = normalizeUrl('https://example.com/page#section')
        expect(result.normalized).toBe('https://example.com/page')
      })

      it('should remove UTM parameters', () => {
        const result = normalizeUrl('https://example.com/page?utm_source=twitter&utm_medium=social&utm_campaign=test')
        expect(result.normalized).toBe('https://example.com/page')
      })

      it('should remove social media tracking parameters', () => {
        const result = normalizeUrl('https://example.com/page?fbclid=123&gclid=456')
        expect(result.normalized).toBe('https://example.com/page')
      })

      it('should preserve non-tracking query parameters', () => {
        const result = normalizeUrl('https://example.com/search?q=test&page=2')
        expect(result.normalized).toBe('https://example.com/search?q=test&page=2')
      })

      it('should handle invalid URLs gracefully', () => {
        const result = normalizeUrl('not-a-url')
        expect(result.normalized).toBe('not-a-url')
        expect(result.domain).toBe('')
      })
    })

    describe('Edge cases', () => {
      it('should handle URLs with ports', () => {
        const result = normalizeUrl('https://example.com:8080/page')
        expect(result.normalized).toBe('https://example.com:8080/page')
      })

      it('should handle URLs with auth', () => {
        const result = normalizeUrl('https://user:pass@example.com/page')
        expect(result.normalized).toBe('https://user:pass@example.com/page')
      })

      it('should handle very long URLs', () => {
        const longPath = '/very/long/path/'.repeat(50)
        const result = normalizeUrl(`https://example.com${longPath}`)
        expect(result.normalized).toBe(`https://example.com${longPath.slice(0, -1)}`)
      })

      it('should handle URLs with special characters', () => {
        const result = normalizeUrl('https://example.com/page?name=John%20Doe&age=30')
        // Node's URL class normalizes %20 to + in query strings
        expect(result.normalized).toBe('https://example.com/page?name=John+Doe&age=30')
      })

      it('should handle internationalized domain names', () => {
        const result = normalizeUrl('https://例え.jp/page')
        // Node's URL class converts IDNs to punycode
        expect(result.normalized).toBe('https://xn--r8jz45g.jp/page')
      })
    })
  })

  describe('areUrlsDuplicates', () => {
    it('should detect duplicate URLs with different tracking parameters', () => {
      const url1 = 'https://example.com/page?utm_source=twitter'
      const url2 = 'https://example.com/page?utm_source=facebook'
      expect(areUrlsDuplicates(url1, url2)).toBe(true)
    })

    it('should detect duplicate YouTube URLs in different formats', () => {
      const url1 = 'https://youtu.be/dQw4w9WgXcQ'
      const url2 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      expect(areUrlsDuplicates(url1, url2)).toBe(true)
    })

    it('should detect duplicate Spotify URLs and URIs', () => {
      const url1 = 'https://open.spotify.com/intl-en/episode/4P86ZzHf7EOlRG7do9LkKZ?si=abc123'
      const url2 = 'spotify:episode:4P86ZzHf7EOlRG7do9LkKZ'
      expect(areUrlsDuplicates(url1, url2)).toBe(true)
    })

    it('should detect duplicate URLs with www prefix', () => {
      const url1 = 'https://www.example.com/page'
      const url2 = 'https://example.com/page'
      expect(areUrlsDuplicates(url1, url2)).toBe(true)
    })

    it('should not detect different URLs as duplicates', () => {
      const url1 = 'https://example.com/page1'
      const url2 = 'https://example.com/page2'
      expect(areUrlsDuplicates(url1, url2)).toBe(false)
    })
  })

  describe('extractDomain', () => {
    it('should extract domain from URL', () => {
      expect(extractDomain('https://www.example.com/page')).toBe('example.com')
      expect(extractDomain('https://subdomain.example.com/page')).toBe('subdomain.example.com')
      expect(extractDomain('https://example.com:8080/page')).toBe('example.com')
    })

    it('should handle invalid URLs', () => {
      expect(extractDomain('not-a-url')).toBe('')
    })
  })

  describe('detectPlatform', () => {
    it('should detect YouTube platform', () => {
      expect(detectPlatform('https://youtube.com/watch?v=123')).toBe('youtube')
      expect(detectPlatform('https://youtu.be/123')).toBe('youtube')
    })

    it('should detect Spotify platform', () => {
      expect(detectPlatform('https://open.spotify.com/track/123')).toBe('spotify')
    })

    it('should detect X/Twitter platform', () => {
      expect(detectPlatform('https://twitter.com/user/status/123')).toBe('x')
      expect(detectPlatform('https://x.com/user/status/123')).toBe('x')
    })

    it('should detect Substack platform', () => {
      expect(detectPlatform('https://example.substack.com/p/article')).toBe('substack')
    })

    it('should default to web for unknown platforms', () => {
      expect(detectPlatform('https://example.com/page')).toBe('web')
    })
  })

  describe('isValidUrl', () => {
    it('should validate HTTP/HTTPS URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true)
      expect(isValidUrl('http://example.com')).toBe(true)
      expect(isValidUrl('https://example.com/page?query=test')).toBe(true)
    })

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false)
      expect(isValidUrl('ftp://example.com')).toBe(false)
      expect(isValidUrl('file:///path/to/file')).toBe(false)
      expect(isValidUrl('')).toBe(false)
    })
  })
})
