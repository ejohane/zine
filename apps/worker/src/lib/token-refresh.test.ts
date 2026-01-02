/**
 * Tests for OAuth Token Refresh with Distributed Locking
 *
 * Tests getValidAccessToken, TokenRefreshError, and distributed locking behavior:
 * - Token validation (skip refresh when still valid)
 * - Token refresh flow (acquire lock, refresh, persist, release)
 * - Distributed locking (wait for other worker, timeout handling)
 * - Provider-specific refresh (YouTube, Spotify)
 * - Token persistence (encryption, expiry calculation)
 * - Error handling (decryption failures, provider errors)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderConnection, TokenRefreshEnv } from './token-refresh';
import { getValidAccessToken, TokenRefreshError } from './token-refresh';

// ============================================================================
// Mocks
// ============================================================================

// Mock the crypto module
vi.mock('./crypto', () => ({
  encrypt: vi.fn((value: string) => Promise.resolve(`encrypted:${value}`)),
  decrypt: vi.fn((value: string) => {
    if (value.startsWith('encrypted:')) {
      return Promise.resolve(value.replace('encrypted:', ''));
    }
    if (value.startsWith('fail:')) {
      return Promise.reject(new Error('Decryption failed'));
    }
    return Promise.resolve(value);
  }),
}));

// Mock the locks module
const mockTryAcquireLock = vi.fn().mockResolvedValue(true);
const mockReleaseLock = vi.fn().mockResolvedValue(undefined);

vi.mock('./locks', () => ({
  tryAcquireLock: (kv: KVNamespace, key: string, ttl: number) => mockTryAcquireLock(kv, key, ttl),
  releaseLock: (kv: KVNamespace, key: string) => mockReleaseLock(kv, key),
}));

// Mock drizzle-orm
const mockSelectResult: ProviderConnection[] = [];
const mockDbSelect = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve(mockSelectResult)),
    })),
  })),
}));
const mockDbUpdate = vi.fn(() => ({
  set: vi.fn(() => ({
    where: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => ({
    select: mockDbSelect,
    update: mockDbUpdate,
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

vi.mock('../db/schema', () => ({
  providerConnections: { id: 'id' },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function createMockConnection(overrides?: Partial<ProviderConnection>): ProviderConnection {
  return {
    id: 'conn-123',
    userId: 'user-456',
    provider: 'YOUTUBE',
    providerUserId: 'yt-user',
    accessToken: 'encrypted:old-access-token',
    refreshToken: 'encrypted:refresh-token',
    tokenExpiresAt: MOCK_NOW - 1000, // Expired by default
    scopes: 'read',
    connectedAt: MOCK_NOW - 86400000,
    lastRefreshedAt: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

function createMockEnv(overrides?: Partial<TokenRefreshEnv>): TokenRefreshEnv {
  return {
    DB: {} as D1Database,
    OAUTH_STATE_KV: {} as KVNamespace,
    ENCRYPTION_KEY: 'test-encryption-key',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    SPOTIFY_CLIENT_ID: 'spotify-client-id',
    SPOTIFY_CLIENT_SECRET: 'spotify-secret',
    ...overrides,
  };
}

function createSuccessfulTokenResponse(overrides?: { refresh_token?: string }) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      access_token: 'new-access-token',
      expires_in: 3600, // 1 hour
      refresh_token: overrides?.refresh_token,
    }),
  };
}

// ============================================================================
// Test Setup
// ============================================================================

const originalDateNow = Date.now;

beforeEach(() => {
  // Mock Date.now directly (vi.setSystemTime not available in Workers pool)
  Date.now = vi.fn(() => MOCK_NOW);
  vi.clearAllMocks();

  // Reset default mock behaviors
  mockTryAcquireLock.mockResolvedValue(true);
  mockReleaseLock.mockResolvedValue(undefined);
  mockSelectResult.length = 0;
  mockFetch.mockReset();
});

afterEach(() => {
  Date.now = originalDateNow;
});

// ============================================================================
// getValidAccessToken - Token Still Valid
// ============================================================================

describe('getValidAccessToken - token still valid', () => {
  it('should return decrypted token when not expired (outside buffer)', async () => {
    // Token expires in 10 minutes (outside 5-minute buffer)
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW + 10 * 60 * 1000,
      accessToken: 'encrypted:valid-access-token',
    });
    const env = createMockEnv();

    const result = await getValidAccessToken(connection, env);

    expect(result).toBe('valid-access-token');
  });

  it('should not acquire lock when token valid', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW + 10 * 60 * 1000,
    });
    const env = createMockEnv();

    await getValidAccessToken(connection, env);

    expect(mockTryAcquireLock).not.toHaveBeenCalled();
  });

  it('should not call provider API when token valid', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW + 10 * 60 * 1000,
    });
    const env = createMockEnv();

    await getValidAccessToken(connection, env);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should consider token expired when within 5-minute buffer', async () => {
    // Token expires in 4 minutes (within 5-minute buffer)
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW + 4 * 60 * 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    // Should have tried to refresh
    expect(mockTryAcquireLock).toHaveBeenCalled();
  });

  it('should not refresh when token expires exactly at buffer boundary', async () => {
    // Token expires in exactly 5 minutes (at buffer boundary)
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW + FIVE_MINUTES_MS + 1,
    });
    const env = createMockEnv();

    await getValidAccessToken(connection, env);

    expect(mockTryAcquireLock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// getValidAccessToken - Token Needs Refresh
// ============================================================================

describe('getValidAccessToken - token needs refresh', () => {
  it('should acquire lock when token expired', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    expect(mockTryAcquireLock).toHaveBeenCalledWith(
      env.OAUTH_STATE_KV,
      'token:refresh:conn-123',
      60
    );
  });

  it('should call provider refresh endpoint', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
      provider: 'YOUTUBE',
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
  });

  it('should persist refreshed tokens to database', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it('should release lock after refresh', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    expect(mockReleaseLock).toHaveBeenCalledWith(env.OAUTH_STATE_KV, 'token:refresh:conn-123');
  });

  it('should return new decrypted access token', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    const result = await getValidAccessToken(connection, env);

    expect(result).toBe('new-access-token');
  });
});

// ============================================================================
// Distributed Locking Behavior
// ============================================================================

describe('distributed locking behavior', () => {
  it('should acquire lock before refresh', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    expect(mockTryAcquireLock).toHaveBeenCalledTimes(1);
    // Lock acquisition should happen before fetch - verify by checking call order
    const lockCallOrder = mockTryAcquireLock.mock.invocationCallOrder[0];
    const fetchCallOrder = mockFetch.mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(fetchCallOrder);
  });

  it('should release lock on successful refresh', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    expect(mockReleaseLock).toHaveBeenCalledWith(env.OAUTH_STATE_KV, 'token:refresh:conn-123');
  });

  it('should release lock on failed refresh (error path)', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('Unauthorized'),
    });

    await expect(getValidAccessToken(connection, env)).rejects.toThrow(TokenRefreshError);

    expect(mockReleaseLock).toHaveBeenCalledWith(env.OAUTH_STATE_KV, 'token:refresh:conn-123');
  });

  // Skip: vi.advanceTimersByTimeAsync not compatible with Workers vitest pool
  it.skip('should wait and read updated token when lock held by another', async () => {
    const connection = createMockConnection({
      id: 'conn-456',
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();

    // Lock is held by another worker
    mockTryAcquireLock.mockResolvedValue(false);

    // After waiting, the token is refreshed by other worker
    const updatedConnection = createMockConnection({
      id: 'conn-456',
      tokenExpiresAt: MOCK_NOW + ONE_HOUR_MS,
      accessToken: 'encrypted:refreshed-by-other',
    });
    mockSelectResult.push(updatedConnection);

    // Start the operation and advance timers
    const resultPromise = getValidAccessToken(connection, env);
    await vi.advanceTimersByTimeAsync(2500); // LOCK_WAIT_MS is 2000ms
    const result = await resultPromise;

    expect(result).toBe('refreshed-by-other');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Skip: vi.advanceTimersByTimeAsync not compatible with Workers vitest pool
  it.skip('should throw REFRESH_IN_PROGRESS after wait if still locked and token not updated', async () => {
    const connection = createMockConnection({
      id: 'conn-789',
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();

    // Lock is held by another worker
    mockTryAcquireLock.mockResolvedValue(false);

    // After waiting, token is still expired (other worker failed)
    const stillExpiredConnection = createMockConnection({
      id: 'conn-789',
      tokenExpiresAt: MOCK_NOW - 500, // Still expired
      accessToken: 'encrypted:still-old-token',
    });
    mockSelectResult.push(stillExpiredConnection);

    // Start the operation and advance timers
    const resultPromise = getValidAccessToken(connection, env);
    await vi.advanceTimersByTimeAsync(2500);

    await expect(resultPromise).rejects.toThrow(TokenRefreshError);

    // Reset mocks and test again for the error code
    mockSelectResult.length = 0;
    mockSelectResult.push(stillExpiredConnection);
    const resultPromise2 = getValidAccessToken(connection, env);
    await vi.advanceTimersByTimeAsync(2500);

    await expect(resultPromise2).rejects.toMatchObject({
      code: 'REFRESH_IN_PROGRESS',
    });
  });

  // Skip: vi.advanceTimersByTimeAsync not compatible with Workers vitest pool
  it.skip('should throw REFRESH_IN_PROGRESS when connection not found after wait', async () => {
    const connection = createMockConnection({
      id: 'conn-deleted',
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();

    // Lock is held by another worker
    mockTryAcquireLock.mockResolvedValue(false);

    // Connection was deleted
    // mockSelectResult is empty - no connection found

    // Start the operation and advance timers
    const resultPromise = getValidAccessToken(connection, env);
    await vi.advanceTimersByTimeAsync(2500);

    await expect(resultPromise).rejects.toThrow(TokenRefreshError);

    // Reset and test again for the error code
    const resultPromise2 = getValidAccessToken(connection, env);
    await vi.advanceTimersByTimeAsync(2500);

    await expect(resultPromise2).rejects.toMatchObject({
      code: 'REFRESH_IN_PROGRESS',
    });
  });
});

// ============================================================================
// Provider-Specific Refresh
// ============================================================================

describe('provider-specific refresh', () => {
  it('should use correct token URL for YOUTUBE', async () => {
    const connection = createMockConnection({
      provider: 'YOUTUBE',
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.any(Object)
    );
  });

  it('should use correct token URL for SPOTIFY', async () => {
    const connection = createMockConnection({
      provider: 'SPOTIFY',
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://accounts.spotify.com/api/token',
      expect.any(Object)
    );
  });

  it('should include client_id in request', async () => {
    const connection = createMockConnection({
      provider: 'YOUTUBE',
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    const fetchCall = mockFetch.mock.calls[0];
    const body = fetchCall[1].body as URLSearchParams;
    expect(body.get('client_id')).toBe('google-client-id');
  });

  it('should include client_secret when available', async () => {
    const connection = createMockConnection({
      provider: 'SPOTIFY',
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    const fetchCall = mockFetch.mock.calls[0];
    const body = fetchCall[1].body as URLSearchParams;
    expect(body.get('client_secret')).toBe('spotify-secret');
  });

  it('should not include client_secret when not available (Google PKCE)', async () => {
    const connection = createMockConnection({
      provider: 'YOUTUBE',
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv({
      GOOGLE_CLIENT_SECRET: undefined,
    });
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    const fetchCall = mockFetch.mock.calls[0];
    const body = fetchCall[1].body as URLSearchParams;
    expect(body.get('client_secret')).toBeNull();
  });

  it('should include grant_type and refresh_token in request', async () => {
    const connection = createMockConnection({
      provider: 'YOUTUBE',
      tokenExpiresAt: MOCK_NOW - 1000,
      refreshToken: 'encrypted:my-refresh-token',
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    const fetchCall = mockFetch.mock.calls[0];
    const body = fetchCall[1].body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('my-refresh-token');
  });

  it('should throw INVALID_PROVIDER for unknown provider', async () => {
    const connection = createMockConnection({
      provider: 'UNKNOWN_PROVIDER',
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();

    await expect(getValidAccessToken(connection, env)).rejects.toThrow(TokenRefreshError);
    await expect(getValidAccessToken(connection, env)).rejects.toMatchObject({
      code: 'INVALID_PROVIDER',
    });
  });
});

// ============================================================================
// Token Persistence
// ============================================================================

describe('token persistence', () => {
  it('should encrypt new access token before storage', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    const { encrypt } = await import('./crypto');

    await getValidAccessToken(connection, env);

    expect(encrypt).toHaveBeenCalledWith('new-access-token', env.ENCRYPTION_KEY);
  });

  it('should update tokenExpiresAt correctly', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'new-token',
        expires_in: 7200, // 2 hours
      }),
    });

    await getValidAccessToken(connection, env);

    // Verify update was called with correct expiry
    const updateCall = mockDbUpdate.mock.results[0].value;
    const setCall = updateCall.set.mock.calls[0][0];
    expect(setCall.tokenExpiresAt).toBe(MOCK_NOW + 7200 * 1000);
  });

  it('should update lastRefreshedAt', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    const updateCall = mockDbUpdate.mock.results[0].value;
    const setCall = updateCall.set.mock.calls[0][0];
    expect(setCall.lastRefreshedAt).toBe(MOCK_NOW);
  });

  it('should set status to ACTIVE', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
      status: 'EXPIRED',
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    await getValidAccessToken(connection, env);

    const updateCall = mockDbUpdate.mock.results[0].value;
    const setCall = updateCall.set.mock.calls[0][0];
    expect(setCall.status).toBe('ACTIVE');
  });

  it('should update refreshToken if provider rotated it', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(
      createSuccessfulTokenResponse({
        refresh_token: 'new-refresh-token',
      })
    );

    const { encrypt } = await import('./crypto');

    await getValidAccessToken(connection, env);

    // Should encrypt the new refresh token
    expect(encrypt).toHaveBeenCalledWith('new-refresh-token', env.ENCRYPTION_KEY);

    // Should include in update
    const updateCall = mockDbUpdate.mock.results[0].value;
    const setCall = updateCall.set.mock.calls[0][0];
    expect(setCall.refreshToken).toBe('encrypted:new-refresh-token');
  });

  it('should not update refreshToken if provider did not rotate it', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse()); // No refresh_token in response

    await getValidAccessToken(connection, env);

    const updateCall = mockDbUpdate.mock.results[0].value;
    const setCall = updateCall.set.mock.calls[0][0];
    expect(setCall.refreshToken).toBeUndefined();
  });
});

// ============================================================================
// Error Handling
// ============================================================================

describe('error handling', () => {
  it('should throw DECRYPTION_FAILED when refresh token cannot be decrypted', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
      refreshToken: 'fail:invalid-encrypted-data', // Will trigger mock decryption failure
    });
    const env = createMockEnv();

    await expect(getValidAccessToken(connection, env)).rejects.toThrow(TokenRefreshError);
    await expect(getValidAccessToken(connection, env)).rejects.toMatchObject({
      code: 'DECRYPTION_FAILED',
    });
  });

  it('should throw REFRESH_FAILED on provider HTTP error', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Bad Request'),
    });

    await expect(getValidAccessToken(connection, env)).rejects.toThrow(TokenRefreshError);
    await expect(getValidAccessToken(connection, env)).rejects.toMatchObject({
      code: 'REFRESH_FAILED',
    });
  });

  it('should include provider error details in REFRESH_FAILED', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('{"error": "invalid_grant"}'),
    });

    try {
      await getValidAccessToken(connection, env);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TokenRefreshError);
      const tokenError = error as TokenRefreshError;
      expect(tokenError.code).toBe('REFRESH_FAILED');
      expect(tokenError.details).toContain('invalid_grant');
    }
  });

  it('should release lock even when refresh fails', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Server error'),
    });

    await expect(getValidAccessToken(connection, env)).rejects.toThrow();

    expect(mockReleaseLock).toHaveBeenCalled();
  });
});

// ============================================================================
// TokenRefreshError Tests
// ============================================================================

describe('TokenRefreshError', () => {
  it('should have correct name and code', () => {
    const error = new TokenRefreshError('REFRESH_FAILED', 'Test message', 'test details');

    expect(error.name).toBe('TokenRefreshError');
    expect(error.code).toBe('REFRESH_FAILED');
    expect(error.message).toBe('Test message');
    expect(error.details).toBe('test details');
  });

  it('should be catchable as Error', () => {
    const error = new TokenRefreshError('CONNECTION_NOT_FOUND', 'Test');
    expect(error instanceof Error).toBe(true);
  });

  it('should work with all error codes', () => {
    const codes = [
      'REFRESH_IN_PROGRESS',
      'REFRESH_FAILED',
      'CONNECTION_NOT_FOUND',
      'INVALID_PROVIDER',
      'DECRYPTION_FAILED',
    ] as const;

    for (const code of codes) {
      const error = new TokenRefreshError(code, `Error: ${code}`);
      expect(error.code).toBe(code);
    }
  });

  it('should allow undefined details', () => {
    const error = new TokenRefreshError('REFRESH_FAILED', 'No details');
    expect(error.details).toBeUndefined();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration scenarios', () => {
  it('should handle full refresh flow for YouTube', async () => {
    const connection = createMockConnection({
      provider: 'YOUTUBE',
      tokenExpiresAt: MOCK_NOW - 1000,
      accessToken: 'encrypted:old-yt-token',
      refreshToken: 'encrypted:yt-refresh-token',
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'new-yt-access-token',
        expires_in: 3600,
      }),
    });

    const result = await getValidAccessToken(connection, env);

    expect(result).toBe('new-yt-access-token');
    expect(mockTryAcquireLock).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.any(Object)
    );
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockReleaseLock).toHaveBeenCalled();
  });

  it('should handle full refresh flow for Spotify with token rotation', async () => {
    const connection = createMockConnection({
      provider: 'SPOTIFY',
      tokenExpiresAt: MOCK_NOW - 1000,
      accessToken: 'encrypted:old-spotify-token',
      refreshToken: 'encrypted:spotify-refresh-token',
    });
    const env = createMockEnv();
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'new-spotify-access-token',
        expires_in: 3600,
        refresh_token: 'rotated-spotify-refresh-token', // Spotify rotates tokens
      }),
    });

    const result = await getValidAccessToken(connection, env);

    expect(result).toBe('new-spotify-access-token');

    // Verify refresh token was updated
    const updateCall = mockDbUpdate.mock.results[0].value;
    const setCall = updateCall.set.mock.calls[0][0];
    expect(setCall.refreshToken).toBe('encrypted:rotated-spotify-refresh-token');
  });

  // Skip: vi.advanceTimersByTimeAsync not compatible with Workers vitest pool
  it.skip('should handle multiple rapid refresh requests with locking', async () => {
    const connection = createMockConnection({
      tokenExpiresAt: MOCK_NOW - 1000,
    });
    const env = createMockEnv();

    // First call acquires lock
    mockTryAcquireLock.mockResolvedValueOnce(true);
    mockFetch.mockResolvedValue(createSuccessfulTokenResponse());

    // Second call (simulated concurrent) fails to acquire lock
    mockTryAcquireLock.mockResolvedValueOnce(false);

    // After wait, token is refreshed
    const updatedConnection = createMockConnection({
      tokenExpiresAt: MOCK_NOW + ONE_HOUR_MS,
      accessToken: 'encrypted:concurrent-refreshed-token',
    });
    mockSelectResult.push(updatedConnection);

    // First request
    const result1 = await getValidAccessToken(connection, env);
    expect(result1).toBe('new-access-token');

    // Second request (concurrent) - advance timers for the sleep
    const resultPromise2 = getValidAccessToken(connection, env);
    await vi.advanceTimersByTimeAsync(2500);
    const result2 = await resultPromise2;
    expect(result2).toBe('concurrent-refreshed-token');
  });
});
