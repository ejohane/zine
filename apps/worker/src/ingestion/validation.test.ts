/**
 * Tests for Validation Layer
 *
 * Tests for:
 * - Zod schema validation
 * - ValidationError class
 * - Required field validation
 * - URL format validation
 * - Duration sanity checks
 * - Timestamp range validation
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect } from 'vitest';
import { ContentType, Provider } from '@zine/shared';
import {
  validateCanonicalItem,
  ValidationError,
  isValidationError,
  canonicalItemSchema,
} from './validation';

// ============================================================================
// Test Data Factory
// ============================================================================

/**
 * Creates a valid canonical item for testing.
 * Override specific fields to test validation failures.
 */
function createValidItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '01H5EXAMPLE123456789012345',
    providerId: 'dQw4w9WgXcQ',
    provider: Provider.YOUTUBE,
    contentType: ContentType.VIDEO,
    title: 'Test Video Title',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    creator: 'Test Channel',
    publishedAt: 1705320000000, // 2024-01-15
    createdAt: 1705320000000,
    ...overrides,
  };
}

// ============================================================================
// ValidationError Class Tests
// ============================================================================

describe('ValidationError', () => {
  it('should create error with correct properties', () => {
    const error = new ValidationError('Test message', 'testField', 'testValue', {
      extra: 'context',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Test message');
    expect(error.field).toBe('testField');
    expect(error.value).toBe('testValue');
    expect(error.context).toEqual({ extra: 'context' });
  });

  it('should work without context', () => {
    const error = new ValidationError('Test message', 'testField', null);

    expect(error.context).toBeUndefined();
  });
});

describe('isValidationError', () => {
  it('should return true for ValidationError instances', () => {
    const error = new ValidationError('Test', 'field', 'value');
    expect(isValidationError(error)).toBe(true);
  });

  it('should return false for regular Error instances', () => {
    const error = new Error('Test');
    expect(isValidationError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isValidationError(null)).toBe(false);
    expect(isValidationError(undefined)).toBe(false);
    expect(isValidationError('string')).toBe(false);
    expect(isValidationError({ message: 'object' })).toBe(false);
  });
});

// ============================================================================
// Valid Item Tests
// ============================================================================

describe('validateCanonicalItem - Valid Items', () => {
  it('should pass validation for a valid YouTube item', () => {
    const item = createValidItem();
    const result = validateCanonicalItem(item);

    expect(result).toEqual(item);
  });

  it('should pass validation for a valid Spotify item', () => {
    const item = createValidItem({
      provider: Provider.SPOTIFY,
      contentType: ContentType.PODCAST,
      providerId: '1abc2def3ghi4jkl',
      canonicalUrl: 'https://open.spotify.com/episode/1abc2def3ghi4jkl',
    });
    const result = validateCanonicalItem(item);

    expect(result.provider).toBe(Provider.SPOTIFY);
  });

  it('should pass validation with optional fields present', () => {
    const item = createValidItem({
      description: 'A test description',
      creatorId: 'UC123456789',
      creatorImageUrl: 'https://example.com/creator.jpg',
      imageUrl: 'https://example.com/thumbnail.jpg',
      durationSeconds: 3600,
    });
    const result = validateCanonicalItem(item);

    expect(result.description).toBe('A test description');
    expect(result.durationSeconds).toBe(3600);
  });

  it('should pass validation with null optional fields', () => {
    const item = createValidItem({
      creatorImageUrl: null,
      imageUrl: null,
      durationSeconds: null,
    });
    const result = validateCanonicalItem(item);

    expect(result.creatorImageUrl).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.durationSeconds).toBeNull();
  });
});

// ============================================================================
// Required Field Validation Tests
// ============================================================================

describe('validateCanonicalItem - Required Fields', () => {
  it('should reject missing id', () => {
    const item = createValidItem({ id: '' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);
    expect(() => validateCanonicalItem(item)).toThrow('Item ID is required');
  });

  it('should reject missing providerId', () => {
    const item = createValidItem({ providerId: '' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);

    try {
      validateCanonicalItem(item);
    } catch (error) {
      expect(isValidationError(error)).toBe(true);
      if (isValidationError(error)) {
        expect(error.field).toBe('providerId');
        expect(error.message).toContain('Provider ID is required');
      }
    }
  });

  it('should reject missing title', () => {
    const item = createValidItem({ title: '' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.field).toBe('title');
      }
    }
  });

  it('should reject missing creator', () => {
    const item = createValidItem({ creator: '' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.field).toBe('creator');
      }
    }
  });

  it('should reject missing canonicalUrl', () => {
    const item = createValidItem({ canonicalUrl: '' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);
  });
});

// ============================================================================
// URL Validation Tests
// ============================================================================

describe('validateCanonicalItem - URL Validation', () => {
  it('should reject invalid canonicalUrl format', () => {
    const item = createValidItem({ canonicalUrl: 'not-a-url' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.field).toBe('canonicalUrl');
        expect(error.message).toContain('URL');
      }
    }
  });

  it('should reject invalid imageUrl format', () => {
    const item = createValidItem({ imageUrl: 'not-a-url' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);
  });

  it('should reject invalid creatorImageUrl format', () => {
    const item = createValidItem({ creatorImageUrl: 'ftp://invalid' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);
  });

  it('should accept valid https URLs', () => {
    const item = createValidItem({
      canonicalUrl: 'https://example.com/video',
      imageUrl: 'https://cdn.example.com/image.jpg',
    });

    expect(() => validateCanonicalItem(item)).not.toThrow();
  });

  it('should accept valid http URLs', () => {
    const item = createValidItem({
      canonicalUrl: 'http://example.com/video',
    });

    expect(() => validateCanonicalItem(item)).not.toThrow();
  });
});

// ============================================================================
// Duration Validation Tests
// ============================================================================

describe('validateCanonicalItem - Duration Validation', () => {
  it('should accept valid duration within range', () => {
    const item = createValidItem({ durationSeconds: 3600 }); // 1 hour

    expect(() => validateCanonicalItem(item)).not.toThrow();
  });

  it('should accept zero duration', () => {
    const item = createValidItem({ durationSeconds: 0 });

    expect(() => validateCanonicalItem(item)).not.toThrow();
  });

  it('should accept maximum valid duration (24 hours)', () => {
    const item = createValidItem({ durationSeconds: 86400 });

    expect(() => validateCanonicalItem(item)).not.toThrow();
  });

  it('should reject negative duration', () => {
    const item = createValidItem({ durationSeconds: -1 });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.field).toBe('durationSeconds');
        expect(error.message).toContain('negative');
      }
    }
  });

  it('should reject duration exceeding 24 hours', () => {
    const item = createValidItem({ durationSeconds: 86401 }); // 24h + 1s

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.field).toBe('durationSeconds');
        expect(error.message).toContain('exceeds 24 hours');
      }
    }
  });

  it('should reject non-integer duration', () => {
    const item = createValidItem({ durationSeconds: 3600.5 });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);
  });
});

// ============================================================================
// Timestamp Validation Tests
// ============================================================================

describe('validateCanonicalItem - Timestamp Validation', () => {
  it('should accept valid timestamp in recent past', () => {
    const item = createValidItem({ publishedAt: Date.now() - 86400000 }); // Yesterday

    expect(() => validateCanonicalItem(item)).not.toThrow();
  });

  it('should reject timestamp before year 2000', () => {
    const item = createValidItem({ publishedAt: 946684799999 }); // Just before 2000

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.field).toBe('publishedAt');
        expect(error.message).toContain('too far in the past');
      }
    }
  });

  it('should reject timestamp after year 2100', () => {
    const item = createValidItem({ publishedAt: 4102444800001 }); // Just after 2100

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.field).toBe('publishedAt');
        expect(error.message).toContain('too far in the future');
      }
    }
  });

  it('should reject Unix epoch (0)', () => {
    const item = createValidItem({ publishedAt: 0 });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);
  });

  it('should accept timestamp at boundary (year 2000)', () => {
    const item = createValidItem({ publishedAt: 946684800000 }); // Exactly 2000

    expect(() => validateCanonicalItem(item)).not.toThrow();
  });
});

// ============================================================================
// Provider/ContentType Validation Tests
// ============================================================================

describe('validateCanonicalItem - Enum Validation', () => {
  it('should reject invalid provider', () => {
    const item = createValidItem({ provider: 'INVALID' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);
  });

  it('should reject invalid contentType', () => {
    const item = createValidItem({ contentType: 'INVALID' });

    expect(() => validateCanonicalItem(item)).toThrow(ValidationError);
  });

  it('should accept all valid providers', () => {
    expect(() =>
      validateCanonicalItem(createValidItem({ provider: Provider.YOUTUBE }))
    ).not.toThrow();

    expect(() =>
      validateCanonicalItem(createValidItem({ provider: Provider.SPOTIFY }))
    ).not.toThrow();
  });

  it('should accept all valid content types', () => {
    expect(() =>
      validateCanonicalItem(createValidItem({ contentType: ContentType.VIDEO }))
    ).not.toThrow();

    expect(() =>
      validateCanonicalItem(createValidItem({ contentType: ContentType.PODCAST }))
    ).not.toThrow();
  });
});

// ============================================================================
// Error Context Tests
// ============================================================================

describe('validateCanonicalItem - Error Context', () => {
  it('should include providerId in error context when available', () => {
    const item = createValidItem({ title: '' });

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.context?.providerId).toBe('dQw4w9WgXcQ');
      }
    }
  });

  it('should include all validation errors in context', () => {
    const item = createValidItem({ title: '', creator: '' });

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        const allErrors = error.context?.allErrors as Array<{ path: string }>;
        expect(allErrors).toBeDefined();
        expect(allErrors.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('should include raw data in context when provided', () => {
    const item = createValidItem({ title: '' });
    const rawData = { originalField: 'value' };

    try {
      validateCanonicalItem(item, rawData);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.context?.rawData).toEqual(rawData);
      }
    }
  });

  it('should include the invalid value in error', () => {
    const item = createValidItem({ providerId: '' });

    try {
      validateCanonicalItem(item);
    } catch (error) {
      if (isValidationError(error)) {
        expect(error.value).toBe('');
      }
    }
  });
});

// ============================================================================
// Schema Direct Tests
// ============================================================================

describe('canonicalItemSchema', () => {
  it('should be a Zod schema', () => {
    expect(canonicalItemSchema.safeParse).toBeDefined();
    expect(canonicalItemSchema.parse).toBeDefined();
  });

  it('should return success for valid data', () => {
    const item = createValidItem();
    const result = canonicalItemSchema.safeParse(item);

    expect(result.success).toBe(true);
  });

  it('should return error details for invalid data', () => {
    const item = createValidItem({ title: '' });
    const result = canonicalItemSchema.safeParse(item);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.length).toBeGreaterThan(0);
      expect(result.error.errors[0].path).toContain('title');
    }
  });
});
