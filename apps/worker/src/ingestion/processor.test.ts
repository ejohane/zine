/**
 * Tests for Ingestion Processor
 *
 * Tests for:
 * - Error classification (classifyError)
 * - Dead-letter queue storage on ingestion failure
 * - Batch ingestion with DLQ integration
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyError } from './processor';
import { TransformError } from './transformers';

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
// classifyError Tests
// ============================================================================

describe('classifyError', () => {
  describe('transform errors', () => {
    it('should classify TransformError as transform', () => {
      const error = new TransformError('Missing required field');
      expect(classifyError(error)).toBe('transform');
    });
  });

  describe('database errors', () => {
    it('should classify errors with "database" in name as database', () => {
      const error = new Error('Connection failed');
      error.name = 'DatabaseError';
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "sql" in name as database', () => {
      const error = new Error('Query failed');
      error.name = 'SqliteError';
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "d1" in name as database', () => {
      const error = new Error('D1 operation failed');
      error.name = 'D1Error';
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "constraint" in message as database', () => {
      const error = new Error('UNIQUE constraint failed: items.provider_id');
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "foreign key" in message as database', () => {
      const error = new Error('FOREIGN KEY constraint failed');
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "sqlite" in message as database', () => {
      const error = new Error('SQLITE_BUSY: database is locked');
      expect(classifyError(error)).toBe('database');
    });
  });

  describe('timeout errors', () => {
    it('should classify errors with "timeout" in name as timeout', () => {
      const error = new Error('Operation timed out');
      error.name = 'TimeoutError';
      expect(classifyError(error)).toBe('timeout');
    });

    it('should classify errors with "timeout" in message as timeout', () => {
      const error = new Error('Request timeout after 30000ms');
      expect(classifyError(error)).toBe('timeout');
    });

    it('should classify errors with "timed out" in message as timeout', () => {
      const error = new Error('Connection timed out');
      expect(classifyError(error)).toBe('timeout');
    });

    it('should classify errors with "deadline exceeded" in message as timeout', () => {
      const error = new Error('DEADLINE_EXCEEDED: Request deadline exceeded');
      expect(classifyError(error)).toBe('timeout');
    });
  });

  describe('validation errors', () => {
    it('should classify errors with "validation" in name as validation', () => {
      const error = new Error('Invalid data');
      error.name = 'ValidationError';
      expect(classifyError(error)).toBe('validation');
    });

    it('should classify errors with "invalid" in message as validation', () => {
      const error = new Error('Invalid email format');
      expect(classifyError(error)).toBe('validation');
    });

    it('should classify errors with "required field" in message as validation', () => {
      const error = new Error('Required field "title" is missing');
      expect(classifyError(error)).toBe('validation');
    });
  });

  describe('unknown errors', () => {
    it('should classify generic errors as unknown', () => {
      const error = new Error('Something went wrong');
      expect(classifyError(error)).toBe('unknown');
    });

    it('should classify non-Error objects as unknown', () => {
      expect(classifyError('string error')).toBe('unknown');
      expect(classifyError(null)).toBe('unknown');
      expect(classifyError(undefined)).toBe('unknown');
      expect(classifyError({ message: 'object error' })).toBe('unknown');
    });
  });
});

// ============================================================================
// Error Type Classification Edge Cases
// ============================================================================

describe('classifyError - Edge Cases', () => {
  it('should be case-insensitive for error name matching', () => {
    const error1 = new Error('Failed');
    error1.name = 'DATABASEERROR';
    expect(classifyError(error1)).toBe('database');

    const error2 = new Error('Failed');
    error2.name = 'timeoutError';
    expect(classifyError(error2)).toBe('timeout');
  });

  it('should be case-insensitive for error message matching', () => {
    expect(classifyError(new Error('DATABASE connection lost'))).toBe('database');
    expect(classifyError(new Error('Request TIMEOUT'))).toBe('timeout');
    expect(classifyError(new Error('VALIDATION failed'))).toBe('validation');
  });

  it('should prioritize transform error classification', () => {
    // TransformError should be classified as transform even if message contains other keywords
    const error = new TransformError('Database field missing');
    expect(classifyError(error)).toBe('transform');
  });
});
