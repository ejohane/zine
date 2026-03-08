/**
 * Tests for authentication middleware
 *
 * @vitest-environment miniflare
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../types';

const { mockVerifyClerkToken, mockInsert } = vi.hoisted(() => {
  const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn().mockReturnValue({
    onConflictDoNothing: mockOnConflictDoNothing,
  });
  const mockInsert = vi.fn().mockReturnValue({
    values: mockValues,
  });

  return {
    mockVerifyClerkToken: vi.fn(),
    mockOnConflictDoNothing,
    mockValues,
    mockInsert,
  };
});

vi.mock('../lib/auth', () => ({
  verifyClerkToken: mockVerifyClerkToken,
}));

vi.mock('../db', () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
  })),
}));

import { authMiddleware } from './auth';

interface AuthResponse {
  userId?: string | null;
  code?: string;
  error?: string;
}

function createTestApp() {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    await next();
  });

  app.use('/protected', authMiddleware());
  app.get('/protected', (c) => c.json({ userId: c.get('userId') ?? null }));

  return app;
}

function createMockEnv(overrides: Partial<Env['Bindings']> = {}): Env['Bindings'] {
  return {
    DB: {} as D1Database,
    WEBHOOK_IDEMPOTENCY: {} as KVNamespace,
    OAUTH_STATE_KV: {} as KVNamespace,
    ARTICLE_CONTENT: {} as R2Bucket,
    SPOTIFY_CACHE: {} as KVNamespace,
    CREATOR_CONTENT_CACHE: {} as KVNamespace,
    ENVIRONMENT: 'test',
    ...overrides,
  } as Env['Bindings'];
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyClerkToken.mockReset();
  });

  it('bypasses auth only for development without a configured Clerk JWKS URL', async () => {
    const app = createTestApp();
    const req = new Request('http://localhost/protected');

    const res = await app.fetch(req, createMockEnv({ ENVIRONMENT: 'development' }));

    expect(res.status).toBe(200);
    expect((await res.json()) as AuthResponse).toEqual({ userId: 'dev-user-001' });
    expect(mockVerifyClerkToken).not.toHaveBeenCalled();
  });

  it('requires an auth header outside development even when CLERK_JWKS_URL is unset', async () => {
    const app = createTestApp();
    const req = new Request('http://localhost/protected');

    const res = await app.fetch(req, createMockEnv({ ENVIRONMENT: 'production' }));

    expect(res.status).toBe(401);
    expect((await res.json()) as AuthResponse).toMatchObject({
      code: 'MISSING_AUTH_HEADER',
      error: 'Authorization header is required',
    });
    expect(mockVerifyClerkToken).not.toHaveBeenCalled();
  });

  it('falls back to the myzine Clerk JWKS URL when none is configured', async () => {
    mockVerifyClerkToken.mockResolvedValue({
      success: true,
      userId: 'user_live_123',
      payload: { sub: 'user_live_123' },
    });

    const app = createTestApp();
    const req = new Request('http://localhost/protected', {
      headers: {
        Authorization: 'Bearer test-token',
      },
    });

    const res = await app.fetch(req, createMockEnv({ ENVIRONMENT: 'production' }));

    expect(res.status).toBe(200);
    expect((await res.json()) as AuthResponse).toEqual({ userId: 'user_live_123' });
    expect(mockVerifyClerkToken).toHaveBeenCalledWith(
      'test-token',
      'https://clerk.myzine.app/.well-known/jwks.json'
    );
  });
});
