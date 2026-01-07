import { describe, it, expect } from 'vitest';
import { ContentType, Provider } from '@zine/shared';
import { parseLink, isValidUrl } from './link-parser';

describe('isValidUrl', () => {
  describe('valid URLs', () => {
    it('accepts https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path')).toBe(true);
      expect(isValidUrl('https://example.com/path?query=value')).toBe(true);
    });

    it('accepts http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('accepts URLs with ports', () => {
      expect(isValidUrl('https://example.com:8080/path')).toBe(true);
    });

    it('accepts URLs with subdomains', () => {
      expect(isValidUrl('https://www.example.com')).toBe(true);
      expect(isValidUrl('https://sub.domain.example.com')).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('rejects empty string', () => {
      expect(isValidUrl('')).toBe(false);
    });

    it('rejects null/undefined', () => {
      // @ts-expect-error - testing runtime behavior
      expect(isValidUrl(null)).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isValidUrl(undefined)).toBe(false);
    });

    it('rejects plain text', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false);
    });

    it('rejects non-HTTP protocols', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('file:///path/to/file')).toBe(false);
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects malformed URLs', () => {
      expect(isValidUrl('http://')).toBe(false);
      expect(isValidUrl('https://')).toBe(false);
    });
  });
});

describe('parseLink', () => {
  describe('YouTube', () => {
    describe('standard watch URLs', () => {
      it('parses youtube.com/watch URLs', () => {
        const result = parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

        expect(result).toEqual({
          provider: Provider.YOUTUBE,
          contentType: ContentType.VIDEO,
          providerId: 'dQw4w9WgXcQ',
          canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
      });

      it('parses youtube.com without www', () => {
        const result = parseLink('https://youtube.com/watch?v=dQw4w9WgXcQ');

        expect(result).toEqual({
          provider: Provider.YOUTUBE,
          contentType: ContentType.VIDEO,
          providerId: 'dQw4w9WgXcQ',
          canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
      });

      it('parses mobile youtube URLs', () => {
        const result = parseLink('https://m.youtube.com/watch?v=dQw4w9WgXcQ');

        expect(result).toEqual({
          provider: Provider.YOUTUBE,
          contentType: ContentType.VIDEO,
          providerId: 'dQw4w9WgXcQ',
          canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
      });
    });

    describe('short URLs (youtu.be)', () => {
      it('parses youtu.be URLs', () => {
        const result = parseLink('https://youtu.be/dQw4w9WgXcQ');

        expect(result).toEqual({
          provider: Provider.YOUTUBE,
          contentType: ContentType.VIDEO,
          providerId: 'dQw4w9WgXcQ',
          canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
      });

      it('parses youtu.be URLs with timestamp', () => {
        const result = parseLink('https://youtu.be/dQw4w9WgXcQ?t=30');

        expect(result).toEqual({
          provider: Provider.YOUTUBE,
          contentType: ContentType.VIDEO,
          providerId: 'dQw4w9WgXcQ',
          canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
      });
    });

    describe('shorts URLs', () => {
      it('parses youtube.com/shorts URLs', () => {
        const result = parseLink('https://www.youtube.com/shorts/abc12345678');

        expect(result).toEqual({
          provider: Provider.YOUTUBE,
          contentType: ContentType.VIDEO,
          providerId: 'abc12345678',
          canonicalUrl: 'https://www.youtube.com/watch?v=abc12345678',
        });
      });
    });

    describe('live and embed URLs', () => {
      it('parses youtube.com/live URLs', () => {
        const result = parseLink('https://www.youtube.com/live/abc12345678');

        expect(result).toEqual({
          provider: Provider.YOUTUBE,
          contentType: ContentType.VIDEO,
          providerId: 'abc12345678',
          canonicalUrl: 'https://www.youtube.com/watch?v=abc12345678',
        });
      });

      it('parses youtube.com/embed URLs', () => {
        const result = parseLink('https://www.youtube.com/embed/abc12345678');

        expect(result).toEqual({
          provider: Provider.YOUTUBE,
          contentType: ContentType.VIDEO,
          providerId: 'abc12345678',
          canonicalUrl: 'https://www.youtube.com/watch?v=abc12345678',
        });
      });
    });

    describe('tracking parameter stripping', () => {
      it('strips t parameter from watch URLs', () => {
        const result = parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123');

        expect(result?.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      });

      it('strips feature parameter', () => {
        const result = parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share');

        expect(result?.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      });
    });

    describe('edge cases', () => {
      it('falls back to generic for invalid video ID length', () => {
        // Invalid YouTube URLs fall through to generic handler
        const shortResult = parseLink('https://youtube.com/watch?v=short');
        expect(shortResult?.provider).toBe(Provider.WEB);
        expect(shortResult?.contentType).toBe(ContentType.ARTICLE);

        const longResult = parseLink('https://youtube.com/watch?v=waytoolongvideoid');
        expect(longResult?.provider).toBe(Provider.WEB);
      });

      it('falls back to generic for missing video ID', () => {
        const result1 = parseLink('https://youtube.com/watch');
        expect(result1?.provider).toBe(Provider.WEB);

        const result2 = parseLink('https://youtube.com/watch?');
        expect(result2?.provider).toBe(Provider.WEB);
      });

      it('handles video IDs with special chars', () => {
        // YouTube video IDs can contain - and _
        const result = parseLink('https://youtube.com/watch?v=abc-_123456');

        expect(result?.provider).toBe(Provider.YOUTUBE);
        expect(result?.providerId).toBe('abc-_123456');
      });
    });
  });

  describe('Spotify', () => {
    describe('episode URLs', () => {
      it('parses open.spotify.com/episode URLs', () => {
        const result = parseLink('https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk');

        expect(result).toEqual({
          provider: Provider.SPOTIFY,
          contentType: ContentType.PODCAST,
          providerId: '4rOoJ6Egrf8K2IrywzwOMk',
          canonicalUrl: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk',
        });
      });

      it('strips si tracking parameter', () => {
        const result = parseLink(
          'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=abc123'
        );

        expect(result?.canonicalUrl).toBe(
          'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk'
        );
      });
    });

    describe('edge cases', () => {
      it('falls back to generic for invalid episode ID length', () => {
        // Invalid Spotify URLs fall through to generic handler
        const shortResult = parseLink('https://open.spotify.com/episode/short');
        expect(shortResult?.provider).toBe(Provider.WEB);
        expect(shortResult?.contentType).toBe(ContentType.ARTICLE);

        const longResult = parseLink(
          'https://open.spotify.com/episode/waytoolongepisodeid12345678'
        );
        expect(longResult?.provider).toBe(Provider.WEB);
      });

      it('falls back to generic for non-episode content types', () => {
        // Track URLs should fall through to generic
        const result = parseLink('https://open.spotify.com/track/abc123');
        expect(result?.provider).toBe(Provider.WEB);
        expect(result?.contentType).toBe(ContentType.ARTICLE);
      });

      it('falls back to generic for wrong hostname', () => {
        const result = parseLink('https://spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk');
        expect(result?.provider).toBe(Provider.WEB); // Falls through to generic
      });
    });
  });

  describe('Substack', () => {
    describe('post URLs', () => {
      it('parses *.substack.com/p/* URLs', () => {
        const result = parseLink('https://example.substack.com/p/hello-world');

        expect(result).toEqual({
          provider: Provider.SUBSTACK,
          contentType: ContentType.ARTICLE,
          providerId: 'example/hello-world',
          canonicalUrl: 'https://example.substack.com/p/hello-world',
        });
      });

      it('extracts publication name from subdomain', () => {
        const result = parseLink('https://stratechery.substack.com/p/the-great-analysis');

        expect(result?.providerId).toBe('stratechery/the-great-analysis');
      });
    });

    describe('tracking parameter stripping', () => {
      it('strips UTM parameters', () => {
        const result = parseLink(
          'https://example.substack.com/p/article?utm_source=twitter&utm_medium=social'
        );

        expect(result?.canonicalUrl).toBe('https://example.substack.com/p/article');
      });

      it('strips ref parameters', () => {
        const result = parseLink('https://example.substack.com/p/article?ref=dashboard');

        expect(result?.canonicalUrl).toBe('https://example.substack.com/p/article');
      });
    });

    describe('edge cases', () => {
      it('returns null for non-post URLs', () => {
        // Homepage should fall through to generic
        const result = parseLink('https://example.substack.com');
        expect(result?.provider).toBe(Provider.WEB);
      });

      it('returns null for missing slug', () => {
        const result = parseLink('https://example.substack.com/p/');
        expect(result?.provider).toBe(Provider.WEB); // Falls through to generic
      });
    });
  });

  describe('Twitter/X', () => {
    describe('status URLs', () => {
      it('parses twitter.com status URLs', () => {
        const result = parseLink('https://twitter.com/elonmusk/status/1234567890123456789');

        expect(result).toEqual({
          provider: Provider.RSS, // X is not OAuth-connected
          contentType: ContentType.POST,
          providerId: '1234567890123456789',
          canonicalUrl: 'https://x.com/elonmusk/status/1234567890123456789',
        });
      });

      it('parses x.com status URLs', () => {
        const result = parseLink('https://x.com/elonmusk/status/1234567890123456789');

        expect(result).toEqual({
          provider: Provider.RSS,
          contentType: ContentType.POST,
          providerId: '1234567890123456789',
          canonicalUrl: 'https://x.com/elonmusk/status/1234567890123456789',
        });
      });

      it('handles www prefix', () => {
        const result = parseLink('https://www.twitter.com/user/status/1234567890123456789');

        expect(result?.provider).toBe(Provider.RSS);
        expect(result?.providerId).toBe('1234567890123456789');
      });
    });

    describe('tracking parameter stripping', () => {
      it('strips s parameter', () => {
        const result = parseLink('https://twitter.com/user/status/1234567890123456789?s=20');

        expect(result?.canonicalUrl).toBe('https://x.com/user/status/1234567890123456789');
      });
    });

    describe('edge cases', () => {
      it('returns null for non-status URLs', () => {
        // Profile URL should fall through to generic
        const result = parseLink('https://twitter.com/elonmusk');
        expect(result?.provider).toBe(Provider.WEB);
        expect(result?.contentType).toBe(ContentType.ARTICLE);
      });

      it('returns null for invalid status ID (non-numeric)', () => {
        const result = parseLink('https://twitter.com/user/status/not-a-number');
        expect(result?.contentType).toBe(ContentType.ARTICLE); // Falls through to generic
      });
    });
  });

  describe('Generic URLs', () => {
    it('falls back to generic for unknown providers', () => {
      const result = parseLink('https://example.com/article/hello-world');

      expect(result).toEqual({
        provider: Provider.WEB,
        contentType: ContentType.ARTICLE,
        providerId: 'https://example.com/article/hello-world',
        canonicalUrl: 'https://example.com/article/hello-world',
      });
    });

    it('strips tracking parameters from generic URLs', () => {
      const result = parseLink(
        'https://example.com/article?utm_source=newsletter&utm_medium=email'
      );

      expect(result?.canonicalUrl).toBe('https://example.com/article');
      expect(result?.providerId).toBe('https://example.com/article');
    });

    it('preserves non-tracking query parameters', () => {
      const result = parseLink('https://example.com/article?page=2&sort=date');

      expect(result?.canonicalUrl).toBe('https://example.com/article?page=2&sort=date');
    });
  });

  describe('Invalid URLs', () => {
    it('returns null for invalid URLs', () => {
      expect(parseLink('not-a-url')).toBe(null);
      expect(parseLink('')).toBe(null);
      expect(parseLink('   ')).toBe(null);
    });

    it('returns null for non-HTTP URLs', () => {
      expect(parseLink('ftp://example.com/file')).toBe(null);
      expect(parseLink('file:///path/to/file')).toBe(null);
    });

    it('handles null/undefined gracefully', () => {
      // @ts-expect-error - testing runtime behavior
      expect(parseLink(null)).toBe(null);
      // @ts-expect-error - testing runtime behavior
      expect(parseLink(undefined)).toBe(null);
    });
  });
});
