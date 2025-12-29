/**
 * Tests for connection health monitoring and error classification
 *
 * Tests the error classification functions used in polling health monitoring:
 * - isTokenExpiredError: Identifies 401/unauthorized errors
 * - isRefreshTokenInvalid: Identifies permanent refresh token failures
 * - isAccessRevokedError: Identifies 403/permission revoked errors
 */

import { describe, it, expect } from 'vitest';
import { isTokenExpiredError, isRefreshTokenInvalid, isAccessRevokedError } from './health';

// ============================================================================
// isTokenExpiredError Tests
// ============================================================================

describe('isTokenExpiredError', () => {
  describe('should return true for token expiration errors', () => {
    it('identifies 401 status code in message', () => {
      const error = new Error('Request failed with status 401');
      expect(isTokenExpiredError(error)).toBe(true);
    });

    it('identifies "unauthorized" keyword', () => {
      const error = new Error('Unauthorized access to resource');
      expect(isTokenExpiredError(error)).toBe(true);
    });

    it('identifies "token expired" phrase', () => {
      const error = new Error('The access token expired');
      expect(isTokenExpiredError(error)).toBe(true);
    });

    it('handles mixed case', () => {
      const error = new Error('UNAUTHORIZED - Token Expired');
      expect(isTokenExpiredError(error)).toBe(true);
    });
  });

  describe('should return false for non-expiration errors', () => {
    it('returns false for network errors', () => {
      const error = new Error('Network connection failed');
      expect(isTokenExpiredError(error)).toBe(false);
    });

    it('returns false for 403 forbidden', () => {
      const error = new Error('Request failed with status 403');
      expect(isTokenExpiredError(error)).toBe(false);
    });

    it('returns false for 500 server errors', () => {
      const error = new Error('Internal server error 500');
      expect(isTokenExpiredError(error)).toBe(false);
    });

    it('returns false for generic errors', () => {
      const error = new Error('Something went wrong');
      expect(isTokenExpiredError(error)).toBe(false);
    });
  });
});

// ============================================================================
// isRefreshTokenInvalid Tests
// ============================================================================

describe('isRefreshTokenInvalid', () => {
  describe('should return true for permanent refresh failures', () => {
    it('identifies "invalid_grant" OAuth error', () => {
      const error = new Error('OAuth error: invalid_grant');
      expect(isRefreshTokenInvalid(error)).toBe(true);
    });

    it('identifies refresh token mention', () => {
      const error = new Error('The refresh token has been revoked');
      expect(isRefreshTokenInvalid(error)).toBe(true);
    });

    it('identifies "revoked" keyword', () => {
      const error = new Error('Token was revoked by user');
      expect(isRefreshTokenInvalid(error)).toBe(true);
    });

    it('handles mixed case', () => {
      const error = new Error('INVALID_GRANT: Refresh Token expired');
      expect(isRefreshTokenInvalid(error)).toBe(true);
    });
  });

  describe('should return false for transient errors', () => {
    it('returns false for network timeout', () => {
      const error = new Error('Request timeout after 30000ms');
      expect(isRefreshTokenInvalid(error)).toBe(false);
    });

    it('returns false for server errors', () => {
      const error = new Error('Token server returned 500');
      expect(isRefreshTokenInvalid(error)).toBe(false);
    });

    it('returns false for rate limiting', () => {
      const error = new Error('Too many requests - rate limited');
      expect(isRefreshTokenInvalid(error)).toBe(false);
    });

    it('returns false for generic token errors', () => {
      const error = new Error('Token validation failed');
      expect(isRefreshTokenInvalid(error)).toBe(false);
    });
  });
});

// ============================================================================
// isAccessRevokedError Tests
// ============================================================================

describe('isAccessRevokedError', () => {
  describe('should return true for access revocation errors', () => {
    it('identifies 403 status code', () => {
      const error = new Error('Request failed with status 403');
      expect(isAccessRevokedError(error)).toBe(true);
    });

    it('identifies "access revoked" phrase', () => {
      const error = new Error('Access revoked by user');
      expect(isAccessRevokedError(error)).toBe(true);
    });

    it('identifies "insufficient permissions" phrase', () => {
      const error = new Error('Insufficient permissions for this operation');
      expect(isAccessRevokedError(error)).toBe(true);
    });

    it('handles mixed case', () => {
      const error = new Error('ACCESS REVOKED - Insufficient Permissions');
      expect(isAccessRevokedError(error)).toBe(true);
    });
  });

  describe('should return false for non-revocation errors', () => {
    it('returns false for 401 unauthorized', () => {
      const error = new Error('Request failed with status 401');
      expect(isAccessRevokedError(error)).toBe(false);
    });

    it('returns false for 404 not found', () => {
      const error = new Error('Resource not found 404');
      expect(isAccessRevokedError(error)).toBe(false);
    });

    it('returns false for network errors', () => {
      const error = new Error('Connection refused');
      expect(isAccessRevokedError(error)).toBe(false);
    });

    it('returns false for generic permission errors without revoke keyword', () => {
      const error = new Error('Permission denied');
      expect(isAccessRevokedError(error)).toBe(false);
    });
  });
});

// ============================================================================
// Combined Error Classification Tests
// ============================================================================

describe('Error classification priority', () => {
  it('classifies 401 as token expired, not revoked', () => {
    const error = new Error('401 Unauthorized');
    expect(isTokenExpiredError(error)).toBe(true);
    expect(isAccessRevokedError(error)).toBe(false);
  });

  it('classifies 403 as access revoked, not token expired', () => {
    const error = new Error('403 Forbidden');
    expect(isAccessRevokedError(error)).toBe(true);
    expect(isTokenExpiredError(error)).toBe(false);
  });

  it('classifies invalid_grant as refresh token invalid', () => {
    const error = new Error('invalid_grant: Token has been revoked');
    expect(isRefreshTokenInvalid(error)).toBe(true);
    // Note: isAccessRevokedError checks for 'access revoked', not just 'revoked'
    // So this won't match isAccessRevokedError
    expect(isAccessRevokedError(error)).toBe(false);
  });

  it('classifies network errors as none of the above', () => {
    const error = new Error('fetch failed: network timeout');
    expect(isTokenExpiredError(error)).toBe(false);
    expect(isRefreshTokenInvalid(error)).toBe(false);
    expect(isAccessRevokedError(error)).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  it('handles empty error message', () => {
    const error = new Error('');
    expect(isTokenExpiredError(error)).toBe(false);
    expect(isRefreshTokenInvalid(error)).toBe(false);
    expect(isAccessRevokedError(error)).toBe(false);
  });

  it('handles error with only whitespace', () => {
    const error = new Error('   ');
    expect(isTokenExpiredError(error)).toBe(false);
    expect(isRefreshTokenInvalid(error)).toBe(false);
    expect(isAccessRevokedError(error)).toBe(false);
  });

  it('handles very long error messages', () => {
    const longPrefix = 'x'.repeat(1000);
    const error = new Error(`${longPrefix} 401 unauthorized`);
    expect(isTokenExpiredError(error)).toBe(true);
  });

  it('handles unicode in error messages', () => {
    const error = new Error('认证失败 401 unauthorized');
    expect(isTokenExpiredError(error)).toBe(true);
  });
});
