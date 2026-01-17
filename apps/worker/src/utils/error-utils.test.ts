import { describe, it, expect } from 'vitest';
import {
  serializeError,
  classifyError,
  createPollingError,
  formatPollingErrorLegacy,
} from './error-utils';

describe('serializeError', () => {
  describe('Error instances', () => {
    it('preserves error message', () => {
      const error = new Error('Connection timeout');
      const result = serializeError(error);

      expect(result.message).toBe('Connection timeout');
    });

    it('preserves error type', () => {
      const error = new TypeError('Invalid type');
      const result = serializeError(error);

      expect(result.type).toBe('TypeError');
    });

    it('preserves stack trace', () => {
      const error = new Error('Test error');
      const result = serializeError(error);

      expect(result.stack).toBeDefined();
      expect(result.stack).toContain('Error: Test error');
    });

    it('preserves error code if present', () => {
      const error = new Error('Connection refused') as Error & { code: string };
      error.code = 'ECONNREFUSED';
      const result = serializeError(error);

      expect(result.code).toBe('ECONNREFUSED');
    });

    it('preserves HTTP status if present', () => {
      const error = new Error('Not found') as Error & { status: number };
      error.status = 404;
      const result = serializeError(error);

      expect(result.status).toBe(404);
    });

    it('preserves statusCode if present', () => {
      const error = new Error('Server error') as Error & { statusCode: number };
      error.statusCode = 500;
      const result = serializeError(error);

      expect(result.status).toBe(500);
    });

    it('prefers status over statusCode', () => {
      const error = new Error('Error') as Error & { status: number; statusCode: number };
      error.status = 400;
      error.statusCode = 500;
      const result = serializeError(error);

      expect(result.status).toBe(400);
    });

    it('serializes error cause recursively', () => {
      const cause = new Error('Root cause');
      const error = new Error('Outer error', { cause });
      const result = serializeError(error);

      expect(result.cause).toBeDefined();
      expect(result.cause?.message).toBe('Root cause');
      expect(result.cause?.type).toBe('Error');
    });

    it('handles deeply nested causes', () => {
      const deepCause = new Error('Deep cause');
      const middleCause = new Error('Middle cause', { cause: deepCause });
      const error = new Error('Outer error', { cause: middleCause });
      const result = serializeError(error);

      expect(result.cause?.cause?.message).toBe('Deep cause');
    });
  });

  describe('String errors', () => {
    it('wraps string in structured format', () => {
      const result = serializeError('Something went wrong');

      expect(result.message).toBe('Something went wrong');
      expect(result.type).toBe('StringError');
      expect(result.stack).toBeUndefined();
    });

    it('handles empty string', () => {
      const result = serializeError('');

      expect(result.message).toBe('');
      expect(result.type).toBe('StringError');
    });
  });

  describe('null and undefined', () => {
    it('handles null', () => {
      const result = serializeError(null);

      expect(result.message).toBe('null');
      expect(result.type).toBe('null');
    });

    it('handles undefined', () => {
      const result = serializeError(undefined);

      expect(result.message).toBe('undefined');
      expect(result.type).toBe('undefined');
    });
  });

  describe('error-like objects', () => {
    it('handles objects with message property', () => {
      const errorLike = { message: 'Custom error', name: 'CustomError' };
      const result = serializeError(errorLike);

      expect(result.message).toBe('Custom error');
      expect(result.type).toBe('CustomError');
    });

    it('handles objects with only message', () => {
      const errorLike = { message: 'Just a message' };
      const result = serializeError(errorLike);

      expect(result.message).toBe('Just a message');
      expect(result.type).toBe('Object');
    });
  });

  describe('other values', () => {
    it('converts number to string', () => {
      const result = serializeError(42);

      expect(result.message).toBe('42');
      expect(result.type).toBe('number');
    });

    it('converts object without message to string', () => {
      const result = serializeError({ foo: 'bar' });

      expect(result.message).toBe('[object Object]');
      expect(result.type).toBe('object');
    });

    it('converts array to string', () => {
      const result = serializeError([1, 2, 3]);

      expect(result.message).toBe('1,2,3');
      expect(result.type).toBe('object');
    });
  });
});

describe('classifyError', () => {
  describe('JavaScript error types', () => {
    it('classifies TypeError', () => {
      expect(classifyError(new TypeError('Cannot read property'))).toBe('type_error');
    });

    it('classifies SyntaxError', () => {
      expect(classifyError(new SyntaxError('Unexpected token'))).toBe('syntax_error');
    });
  });

  describe('error codes', () => {
    it('classifies ETIMEDOUT as timeout', () => {
      const error = new Error('Timed out') as Error & { code: string };
      error.code = 'ETIMEDOUT';
      expect(classifyError(error)).toBe('timeout');
    });

    it('classifies ESOCKETTIMEDOUT as timeout', () => {
      const error = new Error('Socket timed out') as Error & { code: string };
      error.code = 'ESOCKETTIMEDOUT';
      expect(classifyError(error)).toBe('timeout');
    });

    it('classifies ECONNABORTED as timeout', () => {
      const error = new Error('Connection aborted') as Error & { code: string };
      error.code = 'ECONNABORTED';
      expect(classifyError(error)).toBe('timeout');
    });

    it('classifies ECONNREFUSED as connection', () => {
      const error = new Error('Connection refused') as Error & { code: string };
      error.code = 'ECONNREFUSED';
      expect(classifyError(error)).toBe('connection');
    });

    it('classifies ECONNRESET as connection', () => {
      const error = new Error('Connection reset') as Error & { code: string };
      error.code = 'ECONNRESET';
      expect(classifyError(error)).toBe('connection');
    });

    it('classifies ENOTFOUND as connection', () => {
      const error = new Error('Host not found') as Error & { code: string };
      error.code = 'ENOTFOUND';
      expect(classifyError(error)).toBe('connection');
    });

    it('classifies ENETUNREACH as connection', () => {
      const error = new Error('Network unreachable') as Error & { code: string };
      error.code = 'ENETUNREACH';
      expect(classifyError(error)).toBe('connection');
    });

    it('classifies EPARSE as parse_error', () => {
      const error = new Error('Parse error') as Error & { code: string };
      error.code = 'EPARSE';
      expect(classifyError(error)).toBe('parse_error');
    });
  });

  describe('HTTP status codes', () => {
    it('classifies 401 as unauthorized', () => {
      const error = new Error('Unauthorized') as Error & { status: number };
      error.status = 401;
      expect(classifyError(error)).toBe('unauthorized');
    });

    it('classifies 403 as forbidden', () => {
      const error = new Error('Forbidden') as Error & { status: number };
      error.status = 403;
      expect(classifyError(error)).toBe('forbidden');
    });

    it('classifies 404 as not_found', () => {
      const error = new Error('Not found') as Error & { status: number };
      error.status = 404;
      expect(classifyError(error)).toBe('not_found');
    });

    it('classifies 429 as rate_limit', () => {
      const error = new Error('Too many requests') as Error & { status: number };
      error.status = 429;
      expect(classifyError(error)).toBe('rate_limit');
    });

    it('classifies 5xx as server_error', () => {
      const error500 = new Error('Internal error') as Error & { status: number };
      error500.status = 500;
      expect(classifyError(error500)).toBe('server_error');

      const error503 = new Error('Service unavailable') as Error & { status: number };
      error503.status = 503;
      expect(classifyError(error503)).toBe('server_error');
    });

    it('classifies 4xx (except specific ones) as client_error', () => {
      const error400 = new Error('Bad request') as Error & { status: number };
      error400.status = 400;
      expect(classifyError(error400)).toBe('client_error');

      const error422 = new Error('Unprocessable') as Error & { status: number };
      error422.status = 422;
      expect(classifyError(error422)).toBe('client_error');
    });

    it('uses statusCode if status is not present', () => {
      const error = new Error('Not found') as Error & { statusCode: number };
      error.statusCode = 404;
      expect(classifyError(error)).toBe('not_found');
    });
  });

  describe('message patterns', () => {
    it('classifies timeout from message', () => {
      expect(classifyError(new Error('Connection timeout'))).toBe('timeout');
      expect(classifyError(new Error('Request timed out'))).toBe('timeout');
    });

    it('classifies rate limit from message', () => {
      expect(classifyError(new Error('Rate limit exceeded'))).toBe('rate_limit');
      expect(classifyError(new Error('Too many requests'))).toBe('rate_limit');
    });

    it('classifies connection from message', () => {
      expect(classifyError(new Error('Connection failed'))).toBe('connection');
      expect(classifyError(new Error('Network error'))).toBe('connection');
    });

    it('classifies parse error from message', () => {
      expect(classifyError(new Error('Failed to parse JSON'))).toBe('parse_error');
      expect(classifyError(new Error('Invalid JSON response'))).toBe('parse_error');
    });

    it('classifies transform error from message', () => {
      expect(classifyError(new Error('Transform failed'))).toBe('transform');
    });

    it('classifies database error from message', () => {
      expect(classifyError(new Error('Database error'))).toBe('database');
      expect(classifyError(new Error('SQLite constraint violation'))).toBe('database');
      expect(classifyError(new Error('D1 error occurred'))).toBe('database');
    });

    it('classifies validation error from message', () => {
      expect(classifyError(new Error('Invalid input'))).toBe('validation');
      expect(classifyError(new Error('Validation failed'))).toBe('validation');
    });
  });

  describe('unknown errors', () => {
    it('classifies unrecognized errors as unknown', () => {
      expect(classifyError(new Error('Something happened'))).toBe('unknown');
    });

    it('classifies non-Error values as unknown', () => {
      expect(classifyError('string error')).toBe('unknown');
      expect(classifyError(42)).toBe('unknown');
      expect(classifyError(null)).toBe('unknown');
      expect(classifyError(undefined)).toBe('unknown');
    });
  });
});

describe('createPollingError', () => {
  it('creates structured polling error', () => {
    const error = new Error('API error');
    const result = createPollingError('sub-123', error, {
      showId: 'show-456',
      operation: 'fetchEpisodes',
    });

    expect(result.subscriptionId).toBe('sub-123');
    expect(result.error.message).toBe('API error');
    expect(result.error.type).toBe('Error');
    expect(result.errorType).toBe('unknown');
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.context).toEqual({
      showId: 'show-456',
      operation: 'fetchEpisodes',
    });
  });

  it('classifies error type', () => {
    const error = new Error('Rate limit exceeded') as Error & { status: number };
    error.status = 429;
    const result = createPollingError('sub-123', error);

    expect(result.errorType).toBe('rate_limit');
  });

  it('handles errors without context', () => {
    const error = new Error('Test');
    const result = createPollingError('sub-123', error);

    expect(result.context).toBeUndefined();
  });
});

describe('formatPollingErrorLegacy', () => {
  it('formats error for legacy systems', () => {
    const error = new Error('API timeout');
    const pollingError = createPollingError('sub-123', error, {
      showId: 'show-456',
    });
    const result = formatPollingErrorLegacy(pollingError);

    expect(result.subscriptionId).toBe('sub-123');
    expect(result.error).toContain('[timeout]');
    expect(result.error).toContain('Error');
    expect(result.error).toContain('API timeout');
    expect(result.error).toContain('showId');
    expect(result.error).toContain('show-456');
  });

  it('works without context', () => {
    const error = new Error('Simple error');
    const pollingError = createPollingError('sub-123', error);
    const result = formatPollingErrorLegacy(pollingError);

    expect(result.subscriptionId).toBe('sub-123');
    expect(result.error).toContain('Simple error');
    expect(result.error).not.toContain('(');
  });
});
