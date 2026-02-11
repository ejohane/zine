/**
 * Tests for route-validation utilities
 */

import {
  isValidId,
  validateItemId,
  isValidProviderRoute,
  normalizeProviderRoute,
  toBackendProvider,
  validateProviderRoute,
  validateAndConvertProvider,
  validateAndConvertDiscoverProvider,
  VALID_PROVIDER_ROUTES,
  VALID_DISCOVER_PROVIDER_ROUTES,
} from './route-validation';

describe('route-validation', () => {
  // ===========================================================================
  // ID Validation Tests
  // ===========================================================================

  describe('isValidId', () => {
    it('returns true for valid non-empty strings', () => {
      expect(isValidId('abc123')).toBe(true);
      expect(isValidId('1')).toBe(true);
      expect(isValidId('a'.repeat(100))).toBe(true);
    });

    it('returns false for empty strings', () => {
      expect(isValidId('')).toBe(false);
    });

    it('returns false for strings exceeding max length', () => {
      expect(isValidId('a'.repeat(101))).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isValidId(undefined)).toBe(false);
      expect(isValidId(null)).toBe(false);
      expect(isValidId(123)).toBe(false);
      expect(isValidId({})).toBe(false);
      expect(isValidId([])).toBe(false);
    });
  });

  describe('validateItemId', () => {
    it('returns success for valid IDs', () => {
      const result = validateItemId('abc123');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('abc123');
      }
    });

    it('returns error for empty string', () => {
      const result = validateItemId('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Item ID is required');
      }
    });

    it('returns error for non-string values', () => {
      const result = validateItemId(undefined);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Item ID is required');
      }
    });

    it('returns error for strings exceeding max length', () => {
      const result = validateItemId('a'.repeat(101));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Item ID is too long');
      }
    });
  });

  // ===========================================================================
  // Provider Validation Tests
  // ===========================================================================

  describe('isValidProviderRoute', () => {
    it('returns true for valid lowercase providers', () => {
      expect(isValidProviderRoute('youtube')).toBe(true);
      expect(isValidProviderRoute('spotify')).toBe(true);
      expect(isValidProviderRoute('gmail')).toBe(true);
    });

    it('returns true for valid uppercase providers (case-insensitive)', () => {
      expect(isValidProviderRoute('YOUTUBE')).toBe(true);
      expect(isValidProviderRoute('SPOTIFY')).toBe(true);
      expect(isValidProviderRoute('GMAIL')).toBe(true);
    });

    it('returns true for mixed case providers', () => {
      expect(isValidProviderRoute('YouTube')).toBe(true);
      expect(isValidProviderRoute('Spotify')).toBe(true);
      expect(isValidProviderRoute('Gmail')).toBe(true);
    });

    it('returns false for invalid providers', () => {
      expect(isValidProviderRoute('invalid')).toBe(false);
      expect(isValidProviderRoute('rss')).toBe(false);
      expect(isValidProviderRoute('substack')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isValidProviderRoute(undefined)).toBe(false);
      expect(isValidProviderRoute(null)).toBe(false);
      expect(isValidProviderRoute(123)).toBe(false);
    });
  });

  describe('normalizeProviderRoute', () => {
    it('returns lowercase for valid providers', () => {
      expect(normalizeProviderRoute('youtube')).toBe('youtube');
      expect(normalizeProviderRoute('YOUTUBE')).toBe('youtube');
      expect(normalizeProviderRoute('YouTube')).toBe('youtube');
      expect(normalizeProviderRoute('spotify')).toBe('spotify');
      expect(normalizeProviderRoute('SPOTIFY')).toBe('spotify');
      expect(normalizeProviderRoute('GMAIL')).toBe('gmail');
    });

    it('returns undefined for invalid providers', () => {
      expect(normalizeProviderRoute('invalid')).toBeUndefined();
      expect(normalizeProviderRoute('')).toBeUndefined();
    });

    it('returns undefined for non-string values', () => {
      expect(normalizeProviderRoute(undefined)).toBeUndefined();
      expect(normalizeProviderRoute(null)).toBeUndefined();
      expect(normalizeProviderRoute(123)).toBeUndefined();
    });
  });

  describe('toBackendProvider', () => {
    it('converts lowercase route to uppercase backend format', () => {
      expect(toBackendProvider('youtube')).toBe('YOUTUBE');
      expect(toBackendProvider('spotify')).toBe('SPOTIFY');
      expect(toBackendProvider('gmail')).toBe('GMAIL');
    });
  });

  describe('validateProviderRoute', () => {
    it('returns success with normalized lowercase provider', () => {
      const result = validateProviderRoute('YOUTUBE');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('youtube');
      }
    });

    it('returns error for invalid provider', () => {
      const result = validateProviderRoute('invalid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toContain('Invalid provider');
        expect(result.message).toContain('youtube');
        expect(result.message).toContain('spotify');
      }
    });

    it('returns error for non-string values', () => {
      const result = validateProviderRoute(undefined);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Provider is required');
      }
    });
  });

  describe('validateAndConvertProvider', () => {
    it('returns success with uppercase backend provider', () => {
      const youtubeResult = validateAndConvertProvider('youtube');
      expect(youtubeResult.success).toBe(true);
      if (youtubeResult.success) {
        expect(youtubeResult.data).toBe('YOUTUBE');
      }

      const spotifyResult = validateAndConvertProvider('Spotify');
      expect(spotifyResult.success).toBe(true);
      if (spotifyResult.success) {
        expect(spotifyResult.data).toBe('SPOTIFY');
      }

      const gmailResult = validateAndConvertProvider('gmail');
      expect(gmailResult.success).toBe(true);
      if (gmailResult.success) {
        expect(gmailResult.data).toBe('GMAIL');
      }
    });

    it('returns error for invalid provider', () => {
      const result = validateAndConvertProvider('invalid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toContain('Invalid provider');
      }
    });
  });

  describe('validateAndConvertDiscoverProvider', () => {
    it('allows youtube and spotify', () => {
      expect(validateAndConvertDiscoverProvider('youtube')).toEqual({
        success: true,
        data: 'YOUTUBE',
      });
      expect(validateAndConvertDiscoverProvider('spotify')).toEqual({
        success: true,
        data: 'SPOTIFY',
      });
    });

    it('rejects gmail for discovery', () => {
      const result = validateAndConvertDiscoverProvider('gmail');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toContain('not supported for discovery');
      }
    });
  });

  describe('VALID_PROVIDER_ROUTES', () => {
    it('contains expected providers', () => {
      expect(VALID_PROVIDER_ROUTES).toContain('youtube');
      expect(VALID_PROVIDER_ROUTES).toContain('spotify');
      expect(VALID_PROVIDER_ROUTES).toContain('gmail');
      expect(VALID_PROVIDER_ROUTES.length).toBe(3);
    });

    it('keeps discovery providers limited to youtube/spotify', () => {
      expect(VALID_DISCOVER_PROVIDER_ROUTES).toEqual(['youtube', 'spotify']);
    });
  });
});
