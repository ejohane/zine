/**
 * Tests for creator helper functions
 *
 * Tests all creator helper functions including:
 * - normalizeCreatorName
 * - generateSyntheticCreatorId
 * - findOrCreateCreator
 * - extractCreatorFromMetadata (for all providers)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeCreatorName,
  generateSyntheticCreatorId,
  findOrCreateCreator,
  extractCreatorFromMetadata,
  type CreatorParams,
} from './creators';

// ============================================================================
// Mock Date.now for consistent testing
// ============================================================================

const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z
const originalDateNow = Date.now;

beforeEach(() => {
  Date.now = vi.fn(() => MOCK_NOW);
});

afterEach(() => {
  Date.now = originalDateNow;
});

// ============================================================================
// normalizeCreatorName Tests
// ============================================================================

describe('normalizeCreatorName', () => {
  it('should convert to lowercase', () => {
    expect(normalizeCreatorName('Test Channel')).toBe('test channel');
    expect(normalizeCreatorName('TEST CHANNEL')).toBe('test channel');
    expect(normalizeCreatorName('TeSt ChAnNeL')).toBe('test channel');
  });

  it('should trim whitespace', () => {
    expect(normalizeCreatorName('  Test Channel  ')).toBe('test channel');
    expect(normalizeCreatorName('\tTest Channel\n')).toBe('test channel');
    expect(normalizeCreatorName('   ')).toBe('');
  });

  it('should handle empty string', () => {
    expect(normalizeCreatorName('')).toBe('');
  });

  it('should preserve unicode characters', () => {
    expect(normalizeCreatorName('日本語チャンネル')).toBe('日本語チャンネル');
    expect(normalizeCreatorName('Café Podcast')).toBe('café podcast');
  });

  it('should preserve internal whitespace', () => {
    expect(normalizeCreatorName('The  Double  Space')).toBe('the  double  space');
  });
});

// ============================================================================
// generateSyntheticCreatorId Tests
// ============================================================================

describe('generateSyntheticCreatorId', () => {
  it('should produce consistent hashes for same input', () => {
    const id1 = generateSyntheticCreatorId('WEB', 'Test Creator');
    const id2 = generateSyntheticCreatorId('WEB', 'Test Creator');
    expect(id1).toBe(id2);
  });

  it('should produce different hashes for different names', () => {
    const id1 = generateSyntheticCreatorId('WEB', 'Creator One');
    const id2 = generateSyntheticCreatorId('WEB', 'Creator Two');
    expect(id1).not.toBe(id2);
  });

  it('should produce different hashes for different providers', () => {
    const id1 = generateSyntheticCreatorId('WEB', 'Test Creator');
    const id2 = generateSyntheticCreatorId('RSS', 'Test Creator');
    expect(id1).not.toBe(id2);
  });

  it('should normalize name before hashing (case insensitive)', () => {
    const id1 = generateSyntheticCreatorId('WEB', 'Test Creator');
    const id2 = generateSyntheticCreatorId('WEB', 'TEST CREATOR');
    const id3 = generateSyntheticCreatorId('WEB', 'test creator');
    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  it('should normalize name before hashing (trimmed)', () => {
    const id1 = generateSyntheticCreatorId('WEB', 'Test Creator');
    const id2 = generateSyntheticCreatorId('WEB', '  Test Creator  ');
    expect(id1).toBe(id2);
  });

  it('should return a 32-character hex string', () => {
    const id = generateSyntheticCreatorId('WEB', 'Test Creator');
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it('should handle empty name', () => {
    const id = generateSyntheticCreatorId('WEB', '');
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it('should handle unicode characters', () => {
    const id1 = generateSyntheticCreatorId('WEB', '日本語クリエイター');
    const id2 = generateSyntheticCreatorId('WEB', '日本語クリエイター');
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(32);
  });
});

// ============================================================================
// extractCreatorFromMetadata Tests
// ============================================================================

describe('extractCreatorFromMetadata', () => {
  describe('YouTube metadata', () => {
    it('should extract creator from valid YouTube metadata', () => {
      const metadata = {
        snippet: {
          channelId: 'UC1234567890abcdefg',
          channelTitle: 'Test YouTube Channel',
        },
      };

      const result = extractCreatorFromMetadata('YOUTUBE', metadata);

      expect(result).toEqual({
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890abcdefg',
        name: 'Test YouTube Channel',
      });
    });

    it('should return null if channelId is missing', () => {
      const metadata = {
        snippet: {
          channelTitle: 'Test YouTube Channel',
        },
      };

      const result = extractCreatorFromMetadata('YOUTUBE', metadata);
      expect(result).toBeNull();
    });

    it('should return null if channelTitle is missing', () => {
      const metadata = {
        snippet: {
          channelId: 'UC1234567890abcdefg',
        },
      };

      const result = extractCreatorFromMetadata('YOUTUBE', metadata);
      expect(result).toBeNull();
    });

    it('should return null if snippet is missing', () => {
      const metadata = {};

      const result = extractCreatorFromMetadata('YOUTUBE', metadata);
      expect(result).toBeNull();
    });
  });

  describe('Spotify metadata', () => {
    it('should extract creator from valid Spotify metadata', () => {
      const metadata = {
        show: {
          id: 'show123abc',
          name: 'Test Podcast Show',
          images: [{ url: 'https://i.scdn.co/image/abc123' }],
        },
      };

      const result = extractCreatorFromMetadata('SPOTIFY', metadata);

      expect(result).toEqual({
        provider: 'SPOTIFY',
        providerCreatorId: 'show123abc',
        name: 'Test Podcast Show',
        imageUrl: 'https://i.scdn.co/image/abc123',
      });
    });

    it('should handle missing images', () => {
      const metadata = {
        show: {
          id: 'show123abc',
          name: 'Test Podcast Show',
        },
      };

      const result = extractCreatorFromMetadata('SPOTIFY', metadata);

      expect(result).toEqual({
        provider: 'SPOTIFY',
        providerCreatorId: 'show123abc',
        name: 'Test Podcast Show',
        imageUrl: undefined,
      });
    });

    it('should handle empty images array', () => {
      const metadata = {
        show: {
          id: 'show123abc',
          name: 'Test Podcast Show',
          images: [],
        },
      };

      const result = extractCreatorFromMetadata('SPOTIFY', metadata);
      expect(result?.imageUrl).toBeUndefined();
    });

    it('should return null if show.id is missing', () => {
      const metadata = {
        show: {
          name: 'Test Podcast Show',
        },
      };

      const result = extractCreatorFromMetadata('SPOTIFY', metadata);
      expect(result).toBeNull();
    });

    it('should return null if show.name is missing', () => {
      const metadata = {
        show: {
          id: 'show123abc',
        },
      };

      const result = extractCreatorFromMetadata('SPOTIFY', metadata);
      expect(result).toBeNull();
    });

    it('should return null if show is missing', () => {
      const metadata = {};

      const result = extractCreatorFromMetadata('SPOTIFY', metadata);
      expect(result).toBeNull();
    });
  });

  describe('X/Twitter metadata', () => {
    it('should extract creator from valid X metadata', () => {
      const metadata = {
        author: {
          id: '12345678',
          name: 'Test User',
          username: 'testuser',
        },
      };

      const result = extractCreatorFromMetadata('X', metadata);

      expect(result).toEqual({
        provider: 'X',
        providerCreatorId: '12345678',
        name: 'Test User',
        handle: 'testuser',
      });
    });

    it('should handle missing username', () => {
      const metadata = {
        author: {
          id: '12345678',
          name: 'Test User',
        },
      };

      const result = extractCreatorFromMetadata('X', metadata);

      expect(result).toEqual({
        provider: 'X',
        providerCreatorId: '12345678',
        name: 'Test User',
        handle: undefined,
      });
    });

    it('should return null if author.id is missing', () => {
      const metadata = {
        author: {
          name: 'Test User',
          username: 'testuser',
        },
      };

      const result = extractCreatorFromMetadata('X', metadata);
      expect(result).toBeNull();
    });

    it('should return null if author.name is missing', () => {
      const metadata = {
        author: {
          id: '12345678',
          username: 'testuser',
        },
      };

      const result = extractCreatorFromMetadata('X', metadata);
      expect(result).toBeNull();
    });

    it('should return null if author is missing', () => {
      const metadata = {};

      const result = extractCreatorFromMetadata('X', metadata);
      expect(result).toBeNull();
    });
  });

  describe('unsupported providers', () => {
    it('should return null for WEB provider', () => {
      const metadata = {
        author: 'Some Author',
      };

      const result = extractCreatorFromMetadata('WEB', metadata);
      expect(result).toBeNull();
    });

    it('should return null for RSS provider', () => {
      const metadata = {
        channel: {
          title: 'Some RSS Feed',
        },
      };

      const result = extractCreatorFromMetadata('RSS', metadata);
      expect(result).toBeNull();
    });

    it('should return null for unknown provider', () => {
      const result = extractCreatorFromMetadata('UNKNOWN', {});
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return null for null metadata', () => {
      const result = extractCreatorFromMetadata('YOUTUBE', null);
      expect(result).toBeNull();
    });

    it('should return null for undefined metadata', () => {
      const result = extractCreatorFromMetadata('YOUTUBE', undefined);
      expect(result).toBeNull();
    });

    it('should return null for non-object metadata', () => {
      expect(extractCreatorFromMetadata('YOUTUBE', 'string')).toBeNull();
      expect(extractCreatorFromMetadata('YOUTUBE', 123)).toBeNull();
      expect(extractCreatorFromMetadata('YOUTUBE', true)).toBeNull();
    });

    it('should handle metadata extraction errors gracefully', () => {
      // Create a getter that throws
      const metadata = {
        get snippet() {
          throw new Error('Getter error');
        },
      };

      // Should not throw, should return null
      const result = extractCreatorFromMetadata('YOUTUBE', metadata);
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// findOrCreateCreator Tests
// ============================================================================

describe('findOrCreateCreator', () => {
  // Create mock database context
  function createMockContext() {
    const mockDb = {
      query: {
        creators: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    };

    // Chain properly for insert
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    // Chain properly for update
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    return { db: mockDb };
  }

  const baseParams: CreatorParams = {
    provider: 'YOUTUBE',
    providerCreatorId: 'UC1234567890',
    name: 'Test Channel',
  };

  describe('creating new creator', () => {
    it('should create a new creator when none exists', async () => {
      const mockCtx = createMockContext();
      mockCtx.db.query.creators.findFirst.mockResolvedValue(null);

      const result = await findOrCreateCreator(mockCtx, baseParams);

      // Verify findFirst was called with correct parameters
      expect(mockCtx.db.query.creators.findFirst).toHaveBeenCalled();

      // Verify insert was called
      expect(mockCtx.db.insert).toHaveBeenCalled();

      // Verify result structure
      expect(result.id).toHaveLength(26); // ULID
      expect(result.provider).toBe('YOUTUBE');
      expect(result.providerCreatorId).toBe('UC1234567890');
      expect(result.name).toBe('Test Channel');
      expect(result.normalizedName).toBe('test channel');
      expect(result.createdAt).toBe(MOCK_NOW);
      expect(result.updatedAt).toBe(MOCK_NOW);
    });

    it('should include optional fields when provided', async () => {
      const mockCtx = createMockContext();
      mockCtx.db.query.creators.findFirst.mockResolvedValue(null);

      const paramsWithOptional: CreatorParams = {
        ...baseParams,
        imageUrl: 'https://example.com/image.jpg',
        description: 'A test channel',
        handle: '@testchannel',
        externalUrl: 'https://youtube.com/channel/UC1234567890',
      };

      const result = await findOrCreateCreator(mockCtx, paramsWithOptional);

      expect(result.imageUrl).toBe('https://example.com/image.jpg');
      expect(result.description).toBe('A test channel');
      expect(result.handle).toBe('@testchannel');
      expect(result.externalUrl).toBe('https://youtube.com/channel/UC1234567890');
    });
  });

  describe('finding existing creator', () => {
    it('should return existing creator without updating if no changes', async () => {
      const mockCtx = createMockContext();
      const existingCreator = {
        id: 'existing-id-123',
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: 'Test Channel',
        normalizedName: 'test channel',
        imageUrl: 'https://example.com/image.jpg',
        description: 'Existing description',
        handle: '@testchannel',
        externalUrl: 'https://youtube.com/channel/UC1234567890',
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      };
      mockCtx.db.query.creators.findFirst.mockResolvedValue(existingCreator);

      const paramsWithSameData: CreatorParams = {
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: 'Test Channel', // Same name
        imageUrl: 'https://example.com/image.jpg', // Same image
      };

      const result = await findOrCreateCreator(mockCtx, paramsWithSameData);

      // Should not call update since no changes
      expect(mockCtx.db.update).not.toHaveBeenCalled();
      expect(result.id).toBe('existing-id-123');
      expect(result.name).toBe('Test Channel');
    });

    it('should update existing creator when name changes', async () => {
      const mockCtx = createMockContext();
      const existingCreator = {
        id: 'existing-id-123',
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: 'Old Name',
        normalizedName: 'old name',
        imageUrl: null,
        description: null,
        handle: null,
        externalUrl: null,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      };
      mockCtx.db.query.creators.findFirst.mockResolvedValue(existingCreator);

      const paramsWithNewName: CreatorParams = {
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: 'New Name',
      };

      const result = await findOrCreateCreator(mockCtx, paramsWithNewName);

      // Should call update
      expect(mockCtx.db.update).toHaveBeenCalled();
      expect(result.name).toBe('New Name');
      expect(result.normalizedName).toBe('new name');
      expect(result.updatedAt).toBe(MOCK_NOW);
    });

    it('should update existing creator when new optional fields are provided', async () => {
      const mockCtx = createMockContext();
      const existingCreator = {
        id: 'existing-id-123',
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: 'Test Channel',
        normalizedName: 'test channel',
        imageUrl: null, // Was missing
        description: null, // Was missing
        handle: null,
        externalUrl: null,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      };
      mockCtx.db.query.creators.findFirst.mockResolvedValue(existingCreator);

      const paramsWithNewInfo: CreatorParams = {
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: 'Test Channel',
        imageUrl: 'https://example.com/new-image.jpg',
        description: 'New description',
      };

      const result = await findOrCreateCreator(mockCtx, paramsWithNewInfo);

      // Should call update since we have new info for null fields
      expect(mockCtx.db.update).toHaveBeenCalled();
      expect(result.imageUrl).toBe('https://example.com/new-image.jpg');
      expect(result.description).toBe('New description');
    });

    it('should not overwrite existing optional fields with undefined', async () => {
      const mockCtx = createMockContext();
      const existingCreator = {
        id: 'existing-id-123',
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: 'Test Channel',
        normalizedName: 'test channel',
        imageUrl: 'https://example.com/existing-image.jpg',
        description: 'Existing description',
        handle: '@existing',
        externalUrl: 'https://existing.url',
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      };
      mockCtx.db.query.creators.findFirst.mockResolvedValue(existingCreator);

      const paramsWithoutOptional: CreatorParams = {
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: 'Test Channel',
        // No optional fields provided
      };

      const result = await findOrCreateCreator(mockCtx, paramsWithoutOptional);

      // Should not update since we don't have new info (undefined doesn't overwrite)
      expect(mockCtx.db.update).not.toHaveBeenCalled();
      expect(result.imageUrl).toBe('https://example.com/existing-image.jpg');
      expect(result.description).toBe('Existing description');
    });
  });

  describe('edge cases', () => {
    it('should handle unicode characters in name', async () => {
      const mockCtx = createMockContext();
      mockCtx.db.query.creators.findFirst.mockResolvedValue(null);

      const unicodeParams: CreatorParams = {
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: '日本語チャンネル',
      };

      const result = await findOrCreateCreator(mockCtx, unicodeParams);

      expect(result.name).toBe('日本語チャンネル');
      expect(result.normalizedName).toBe('日本語チャンネル');
    });

    it('should handle whitespace-only names', async () => {
      const mockCtx = createMockContext();
      mockCtx.db.query.creators.findFirst.mockResolvedValue(null);

      const whitespaceParams: CreatorParams = {
        provider: 'YOUTUBE',
        providerCreatorId: 'UC1234567890',
        name: '   ',
      };

      const result = await findOrCreateCreator(mockCtx, whitespaceParams);

      expect(result.name).toBe('   ');
      expect(result.normalizedName).toBe('');
    });
  });
});
