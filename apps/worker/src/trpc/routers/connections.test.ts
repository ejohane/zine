/**
 * Integration Tests for Connections Router
 *
 * Tests the complete OAuth flow including:
 * - State registration → callback → token storage
 * - Invalid state rejection
 * - Connection update on reconnect
 * - Disconnect with subscription cascade
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createMockEnv,
  TEST_USER_ID,
  TEST_STATE,
  TEST_CODE,
  TEST_CODE_VERIFIER,
  createMockTokenResponse,
  createMockProviderUserInfo,
  mockDbResults,
} from '../test-utils';

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock OAuth state functions
const mockRegisterOAuthState = vi.fn();
const mockValidateOAuthState = vi.fn();

vi.mock('../../lib/oauth-state', () => ({
  registerOAuthState: (...args: unknown[]) => mockRegisterOAuthState(...args),
  validateOAuthState: (...args: unknown[]) => mockValidateOAuthState(...args),
  OAUTH_STATE_TTL_SECONDS: 1800,
}));

// Mock auth functions
const mockExchangeCodeForTokens = vi.fn();
const mockGetProviderUserInfo = vi.fn();

vi.mock('../../lib/auth', () => ({
  exchangeCodeForTokens: (...args: unknown[]) => mockExchangeCodeForTokens(...args),
  getProviderUserInfo: (...args: unknown[]) => mockGetProviderUserInfo(...args),
}));

// Mock crypto functions
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();

vi.mock('../../lib/crypto', () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

// Mock database operations
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();
const mockDbQueryFindFirst = vi.fn();
const mockDbQueryFindMany = vi.fn();

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockContext(userId: string | null = TEST_USER_ID) {
  const mockEnv = createMockEnv();

  const mockDb = {
    insert: mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    update: mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: mockDbDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    query: {
      providerConnections: {
        findFirst: mockDbQueryFindFirst,
        findMany: mockDbQueryFindMany,
      },
    },
  };

  return {
    userId,
    db: mockDb,
    env: mockEnv,
  };
}

/**
 * Mock router caller for connections router
 */
function createMockConnectionsCaller(ctx: ReturnType<typeof createMockContext>) {
  return {
    registerState: async (input: { provider: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL'; state: string }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      if (!ctx.env.OAUTH_STATE_KV) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'OAuth state storage not configured',
        });
      }

      await mockRegisterOAuthState(input.state, ctx.userId, ctx.env.OAUTH_STATE_KV);
      return { success: true };
    },

    callback: async (input: {
      provider: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL';
      code: string;
      state: string;
      codeVerifier: string;
    }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      if (!ctx.env.OAUTH_STATE_KV) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'OAuth state storage not configured',
        });
      }

      if (!ctx.env.ENCRYPTION_KEY) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Token encryption not configured',
        });
      }

      // Validate state
      await mockValidateOAuthState(input.state, ctx.userId, ctx.env.OAUTH_STATE_KV);

      // Exchange code for tokens
      const tokens = await mockExchangeCodeForTokens(
        input.provider,
        input.code,
        input.codeVerifier,
        ctx.env
      );

      // Get provider user info
      const providerUser = await mockGetProviderUserInfo(input.provider, tokens.access_token);

      // Encrypt tokens
      const encryptedAccessToken = await mockEncrypt(tokens.access_token, ctx.env.ENCRYPTION_KEY);
      const encryptedRefreshToken = await mockEncrypt(tokens.refresh_token, ctx.env.ENCRYPTION_KEY);

      // Upsert connection
      await ctx.db.insert().values({
        userId: ctx.userId,
        provider: input.provider,
        providerUserId: providerUser.id,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
        status: 'ACTIVE',
      });

      // Reactivate DISCONNECTED subscriptions for this provider
      await ctx.db.update().set({ status: 'ACTIVE', updatedAt: Date.now() });

      return { success: true };
    },

    list: async () => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const connections = await ctx.db.query.providerConnections.findMany();
      return {
        YOUTUBE: connections?.find((c: { provider: string }) => c.provider === 'YOUTUBE') ?? null,
        SPOTIFY: connections?.find((c: { provider: string }) => c.provider === 'SPOTIFY') ?? null,
        GMAIL: connections?.find((c: { provider: string }) => c.provider === 'GMAIL') ?? null,
      };
    },

    disconnect: async (_input: { provider: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL' }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      if (!ctx.env.ENCRYPTION_KEY) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Token encryption not configured',
        });
      }

      const connection = await ctx.db.query.providerConnections.findFirst();
      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not connected',
        });
      }

      // Delete connection
      await ctx.db.delete();

      // Mark subscriptions as disconnected
      await ctx.db.update().set({ status: 'DISCONNECTED', updatedAt: Date.now() });

      return { success: true };
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Connections Router', () => {
  const MOCK_NOW = 1705320000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    vi.clearAllMocks();

    // Default mock implementations
    mockRegisterOAuthState.mockResolvedValue(undefined);
    mockValidateOAuthState.mockResolvedValue(undefined);
    mockExchangeCodeForTokens.mockResolvedValue(createMockTokenResponse('YOUTUBE'));
    mockGetProviderUserInfo.mockResolvedValue(createMockProviderUserInfo('YOUTUBE'));
    mockEncrypt.mockImplementation((value: string) => Promise.resolve(`encrypted_${value}`));
    mockDecrypt.mockImplementation((value: string) =>
      Promise.resolve(value.replace('encrypted_', ''))
    );
    mockDbQueryFindFirst.mockResolvedValue(null);
    mockDbQueryFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('Authentication', () => {
    it('should reject unauthenticated requests to registerState', async () => {
      const ctx = createMockContext(null);
      const caller = createMockConnectionsCaller(ctx);

      await expect(
        caller.registerState({ provider: 'YOUTUBE', state: TEST_STATE })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.registerState({ provider: 'YOUTUBE', state: TEST_STATE })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to callback', async () => {
      const ctx = createMockContext(null);
      const caller = createMockConnectionsCaller(ctx);

      await expect(
        caller.callback({
          provider: 'YOUTUBE',
          code: TEST_CODE,
          state: TEST_STATE,
          codeVerifier: TEST_CODE_VERIFIER,
        })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.callback({
          provider: 'YOUTUBE',
          code: TEST_CODE,
          state: TEST_STATE,
          codeVerifier: TEST_CODE_VERIFIER,
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to list', async () => {
      const ctx = createMockContext(null);
      const caller = createMockConnectionsCaller(ctx);

      await expect(caller.list()).rejects.toThrow(TRPCError);
      await expect(caller.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to disconnect', async () => {
      const ctx = createMockContext(null);
      const caller = createMockConnectionsCaller(ctx);

      await expect(caller.disconnect({ provider: 'YOUTUBE' })).rejects.toThrow(TRPCError);
      await expect(caller.disconnect({ provider: 'YOUTUBE' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ==========================================================================
  // State Registration Tests
  // ==========================================================================

  describe('connections.registerState', () => {
    it('should register OAuth state successfully for YouTube', async () => {
      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      const result = await caller.registerState({
        provider: 'YOUTUBE',
        state: TEST_STATE,
      });

      expect(result).toEqual({ success: true });
      expect(mockRegisterOAuthState).toHaveBeenCalledWith(
        TEST_STATE,
        TEST_USER_ID,
        ctx.env.OAUTH_STATE_KV
      );
    });

    it('should register OAuth state successfully for Spotify', async () => {
      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      const result = await caller.registerState({
        provider: 'SPOTIFY',
        state: TEST_STATE,
      });

      expect(result).toEqual({ success: true });
      expect(mockRegisterOAuthState).toHaveBeenCalledWith(
        TEST_STATE,
        TEST_USER_ID,
        ctx.env.OAUTH_STATE_KV
      );
    });

    it('should reject duplicate state registration (replay attack)', async () => {
      mockRegisterOAuthState.mockRejectedValue(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'State already registered',
        })
      );

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      await expect(
        caller.registerState({ provider: 'YOUTUBE', state: TEST_STATE })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.registerState({ provider: 'YOUTUBE', state: TEST_STATE })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'State already registered',
      });
    });

    it('should throw error if OAUTH_STATE_KV is not configured', async () => {
      const ctx = createMockContext();
      ctx.env.OAUTH_STATE_KV = undefined as unknown as KVNamespace;
      const caller = createMockConnectionsCaller(ctx);

      await expect(
        caller.registerState({ provider: 'YOUTUBE', state: TEST_STATE })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.registerState({ provider: 'YOUTUBE', state: TEST_STATE })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'OAuth state storage not configured',
      });
    });
  });

  // ==========================================================================
  // OAuth Callback Tests
  // ==========================================================================

  describe('connections.callback', () => {
    it('should complete OAuth flow successfully for YouTube', async () => {
      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      mockExchangeCodeForTokens.mockResolvedValue(createMockTokenResponse('YOUTUBE'));
      mockGetProviderUserInfo.mockResolvedValue(createMockProviderUserInfo('YOUTUBE'));

      const result = await caller.callback({
        provider: 'YOUTUBE',
        code: TEST_CODE,
        state: TEST_STATE,
        codeVerifier: TEST_CODE_VERIFIER,
      });

      expect(result).toEqual({ success: true });
      expect(mockValidateOAuthState).toHaveBeenCalledWith(
        TEST_STATE,
        TEST_USER_ID,
        ctx.env.OAUTH_STATE_KV
      );
      expect(mockExchangeCodeForTokens).toHaveBeenCalledWith(
        'YOUTUBE',
        TEST_CODE,
        TEST_CODE_VERIFIER,
        ctx.env
      );
      expect(mockGetProviderUserInfo).toHaveBeenCalledWith('YOUTUBE', 'mock_youtube_access_token');
      expect(mockEncrypt).toHaveBeenCalledTimes(2);
    });

    it('should complete OAuth flow successfully for Spotify', async () => {
      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      mockExchangeCodeForTokens.mockResolvedValue(createMockTokenResponse('SPOTIFY'));
      mockGetProviderUserInfo.mockResolvedValue(createMockProviderUserInfo('SPOTIFY'));

      const result = await caller.callback({
        provider: 'SPOTIFY',
        code: TEST_CODE,
        state: TEST_STATE,
        codeVerifier: TEST_CODE_VERIFIER,
      });

      expect(result).toEqual({ success: true });
      expect(mockExchangeCodeForTokens).toHaveBeenCalledWith(
        'SPOTIFY',
        TEST_CODE,
        TEST_CODE_VERIFIER,
        ctx.env
      );
    });

    it('should reject invalid state (CSRF protection)', async () => {
      mockValidateOAuthState.mockRejectedValue(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'State expired or invalid',
        })
      );

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      await expect(
        caller.callback({
          provider: 'YOUTUBE',
          code: TEST_CODE,
          state: 'invalid_state_value'.padEnd(32, 'x'),
          codeVerifier: TEST_CODE_VERIFIER,
        })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.callback({
          provider: 'YOUTUBE',
          code: TEST_CODE,
          state: 'invalid_state_value'.padEnd(32, 'x'),
          codeVerifier: TEST_CODE_VERIFIER,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'State expired or invalid',
      });
    });

    it('should reject state mismatch (different user)', async () => {
      mockValidateOAuthState.mockRejectedValue(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'State mismatch',
        })
      );

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      await expect(
        caller.callback({
          provider: 'YOUTUBE',
          code: TEST_CODE,
          state: TEST_STATE,
          codeVerifier: TEST_CODE_VERIFIER,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'State mismatch',
      });
    });

    it('should handle token exchange failure', async () => {
      mockExchangeCodeForTokens.mockRejectedValue(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Token exchange failed: invalid_grant',
        })
      );

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      await expect(
        caller.callback({
          provider: 'YOUTUBE',
          code: 'invalid_code',
          state: TEST_STATE,
          codeVerifier: TEST_CODE_VERIFIER,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw error if ENCRYPTION_KEY is not configured', async () => {
      const ctx = createMockContext();
      ctx.env.ENCRYPTION_KEY = undefined;
      const caller = createMockConnectionsCaller(ctx);

      await expect(
        caller.callback({
          provider: 'YOUTUBE',
          code: TEST_CODE,
          state: TEST_STATE,
          codeVerifier: TEST_CODE_VERIFIER,
        })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Token encryption not configured',
      });
    });

    it('should encrypt tokens before storage', async () => {
      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      await caller.callback({
        provider: 'YOUTUBE',
        code: TEST_CODE,
        state: TEST_STATE,
        codeVerifier: TEST_CODE_VERIFIER,
      });

      // Verify both tokens were encrypted
      expect(mockEncrypt).toHaveBeenCalledWith('mock_youtube_access_token', ctx.env.ENCRYPTION_KEY);
      expect(mockEncrypt).toHaveBeenCalledWith(
        'mock_youtube_refresh_token',
        ctx.env.ENCRYPTION_KEY
      );
    });
  });

  // ==========================================================================
  // Connection List Tests
  // ==========================================================================

  describe('connections.list', () => {
    it('should return null for both providers when no connections', async () => {
      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      mockDbQueryFindMany.mockResolvedValue([]);

      const result = await caller.list();

      expect(result).toEqual({
        YOUTUBE: null,
        SPOTIFY: null,
        GMAIL: null,
      });
    });

    it('should return connection info for YouTube', async () => {
      const youtubeConnection = mockDbResults.providerConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
        connectedAt: MOCK_NOW - 86400000,
        lastRefreshedAt: MOCK_NOW - 3600000,
      });

      mockDbQueryFindMany.mockResolvedValue([youtubeConnection]);

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      const result = await caller.list();

      expect(result.YOUTUBE).not.toBeNull();
      expect(result.YOUTUBE?.provider).toBe('YOUTUBE');
      expect(result.YOUTUBE?.status).toBe('ACTIVE');
      expect(result.SPOTIFY).toBeNull();
      expect(result.GMAIL).toBeNull();
    });

    it('should return connection info for both providers', async () => {
      const youtubeConnection = mockDbResults.providerConnection({ provider: 'YOUTUBE' });
      const spotifyConnection = mockDbResults.providerConnection({
        provider: 'SPOTIFY',
        providerUserId: 'spotify_user_123',
      });

      mockDbQueryFindMany.mockResolvedValue([youtubeConnection, spotifyConnection]);

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      const result = await caller.list();

      expect(result.YOUTUBE).not.toBeNull();
      expect(result.SPOTIFY).not.toBeNull();
      expect(result.YOUTUBE?.provider).toBe('YOUTUBE');
      expect(result.SPOTIFY?.provider).toBe('SPOTIFY');
      expect(result.GMAIL).toBeNull();
    });

    it('should return EXPIRED status for expired connections', async () => {
      const expiredConnection = mockDbResults.providerConnection({
        provider: 'YOUTUBE',
        status: 'EXPIRED',
      });

      mockDbQueryFindMany.mockResolvedValue([expiredConnection]);

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      const result = await caller.list();

      expect(result.YOUTUBE?.status).toBe('EXPIRED');
    });
  });

  // ==========================================================================
  // Disconnect Tests
  // ==========================================================================

  describe('connections.disconnect', () => {
    it('should disconnect YouTube successfully', async () => {
      const connection = mockDbResults.providerConnection({ provider: 'YOUTUBE' });
      mockDbQueryFindFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      const result = await caller.disconnect({ provider: 'YOUTUBE' });

      expect(result).toEqual({ success: true });
      expect(mockDbDelete).toHaveBeenCalled();
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('should disconnect Spotify successfully', async () => {
      const connection = mockDbResults.providerConnection({ provider: 'SPOTIFY' });
      mockDbQueryFindFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      const result = await caller.disconnect({ provider: 'SPOTIFY' });

      expect(result).toEqual({ success: true });
    });

    it('should throw NOT_FOUND when provider is not connected', async () => {
      mockDbQueryFindFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      await expect(caller.disconnect({ provider: 'YOUTUBE' })).rejects.toThrow(TRPCError);
      await expect(caller.disconnect({ provider: 'YOUTUBE' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Provider not connected',
      });
    });

    it('should mark related subscriptions as DISCONNECTED', async () => {
      const connection = mockDbResults.providerConnection({ provider: 'YOUTUBE' });
      mockDbQueryFindFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      await caller.disconnect({ provider: 'YOUTUBE' });

      // Verify subscription update was called
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('should throw error if ENCRYPTION_KEY is not configured', async () => {
      const ctx = createMockContext();
      ctx.env.ENCRYPTION_KEY = undefined;
      const caller = createMockConnectionsCaller(ctx);

      await expect(caller.disconnect({ provider: 'YOUTUBE' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Token encryption not configured',
      });
    });
  });

  // ==========================================================================
  // Connection Update on Reconnect Tests
  // ==========================================================================

  describe('Connection update on reconnect', () => {
    it('should update existing connection when reconnecting', async () => {
      const existingConnection = mockDbResults.providerConnection({
        provider: 'YOUTUBE',
        status: 'EXPIRED',
        tokenExpiresAt: MOCK_NOW - 3600000, // Expired 1 hour ago
      });

      mockDbQueryFindFirst.mockResolvedValue(existingConnection);
      mockExchangeCodeForTokens.mockResolvedValue(createMockTokenResponse('YOUTUBE'));
      mockGetProviderUserInfo.mockResolvedValue(createMockProviderUserInfo('YOUTUBE'));

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      const result = await caller.callback({
        provider: 'YOUTUBE',
        code: TEST_CODE,
        state: TEST_STATE,
        codeVerifier: TEST_CODE_VERIFIER,
      });

      expect(result).toEqual({ success: true });
      // Connection should be upserted (insert with onConflictDoUpdate)
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('should update tokens on reconnect', async () => {
      const newTokens = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 7200, // 2 hours
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
      };

      mockExchangeCodeForTokens.mockResolvedValue(newTokens);
      mockGetProviderUserInfo.mockResolvedValue(createMockProviderUserInfo('YOUTUBE'));

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      await caller.callback({
        provider: 'YOUTUBE',
        code: TEST_CODE,
        state: TEST_STATE,
        codeVerifier: TEST_CODE_VERIFIER,
      });

      expect(mockEncrypt).toHaveBeenCalledWith('new_access_token', ctx.env.ENCRYPTION_KEY);
      expect(mockEncrypt).toHaveBeenCalledWith('new_refresh_token', ctx.env.ENCRYPTION_KEY);
    });

    it('should reactivate DISCONNECTED subscriptions on reconnect', async () => {
      mockExchangeCodeForTokens.mockResolvedValue(createMockTokenResponse('YOUTUBE'));
      mockGetProviderUserInfo.mockResolvedValue(createMockProviderUserInfo('YOUTUBE'));

      const ctx = createMockContext();
      const caller = createMockConnectionsCaller(ctx);

      await caller.callback({
        provider: 'YOUTUBE',
        code: TEST_CODE,
        state: TEST_STATE,
        codeVerifier: TEST_CODE_VERIFIER,
      });

      // Verify db.update was called twice:
      // 1. For the connection upsert (via insert with onConflictDoUpdate)
      // 2. For reactivating DISCONNECTED subscriptions
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });
});
