/**
 * Tests for authentication routes
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../types';

// Mock svix for testing
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn((body: string, _headers: Record<string, string>) => {
      // Parse the body and return it as the event
      return JSON.parse(body);
    }),
  })),
}));

// Mock drizzle-orm for testing
const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  }),
});

const mockDelete = vi.fn().mockReturnValue({
  where: vi.fn().mockResolvedValue(undefined),
});

const mockFindFirst = vi.fn();

vi.mock('../db', () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
    delete: mockDelete,
    query: {
      users: {
        findFirst: mockFindFirst,
      },
    },
  })),
}));

// Import after mocking
import authRoutes from './auth';

// ============================================================================
// Test Helpers
// ============================================================================

interface JsonResponse {
  code?: string;
  error?: string;
  message?: string;
  svixId?: string;
  eventType?: string;
  userId?: string;
  profile?: Record<string, unknown>;
  id?: string;
  email?: string | null;
  createdAt?: string;
  updatedAt?: string;
  requestId?: string;
}

function createTestApp() {
  const app = new Hono<Env>();

  // Add request ID middleware
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    await next();
  });

  app.route('/api/auth', authRoutes);
  return app;
}

function createMockEnv(): Env['Bindings'] {
  return {
    DB: {
      // Mock D1Database - not used directly since we mock createDb
    } as unknown as D1Database,
    WEBHOOK_IDEMPOTENCY: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    OAUTH_STATE_KV: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    ENVIRONMENT: 'test',
    CLERK_WEBHOOK_SECRET: 'whsec_test_secret',
  };
}

function createWebhookHeaders(svixId = 'msg_test123') {
  return {
    'svix-id': svixId,
    'svix-timestamp': String(Math.floor(Date.now() / 1000)),
    'svix-signature': 'v1,test_signature',
  };
}

// ============================================================================
// Webhook Tests
// ============================================================================

describe('POST /api/auth/webhook', () => {
  let app: ReturnType<typeof createTestApp>;
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    mockEnv = createMockEnv();
  });

  it('returns 500 if CLERK_WEBHOOK_SECRET is not configured', async () => {
    const envWithoutSecret = { ...mockEnv, CLERK_WEBHOOK_SECRET: undefined };

    const req = new Request('http://localhost/api/auth/webhook', {
      method: 'POST',
      headers: createWebhookHeaders(),
      body: JSON.stringify({ type: 'user.created', data: { id: 'user_123' } }),
    });

    const res = await app.fetch(req, envWithoutSecret);
    expect(res.status).toBe(500);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('WEBHOOK_NOT_CONFIGURED');
  });

  it('returns 400 if Svix headers are missing', async () => {
    const req = new Request('http://localhost/api/auth/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user.created', data: { id: 'user_123' } }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('MISSING_SVIX_HEADERS');
  });

  it('returns 200 for duplicate events (idempotency)', async () => {
    // Mock KV to return existing event
    mockEnv.WEBHOOK_IDEMPOTENCY.get = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ eventType: 'user.created', processedAt: new Date().toISOString() })
      );

    const req = new Request('http://localhost/api/auth/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createWebhookHeaders('msg_duplicate'),
      },
      body: JSON.stringify({ type: 'user.created', data: { id: 'user_123' } }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonResponse;
    expect(body.message).toBe('Event already processed');
    expect(body.svixId).toBe('msg_duplicate');
  });

  it('processes user.created event successfully', async () => {
    const req = new Request('http://localhost/api/auth/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createWebhookHeaders(),
      },
      body: JSON.stringify({
        type: 'user.created',
        data: {
          id: 'user_123',
          email_addresses: [{ id: 'email_1', email_address: 'test@example.com' }],
          first_name: 'Test',
          last_name: 'User',
          image_url: 'https://example.com/avatar.png',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        object: 'event',
      }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonResponse;
    expect(body.message).toBe('Webhook processed successfully');
    expect(body.eventType).toBe('user.created');
    expect(body.userId).toBe('user_123');

    // Verify idempotency key was stored
    expect(mockEnv.WEBHOOK_IDEMPOTENCY.put).toHaveBeenCalledWith(
      'svix:msg_test123',
      expect.any(String),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );

    // Verify D1 insert was called
    expect(mockInsert).toHaveBeenCalled();
  });

  it('processes user.deleted event successfully', async () => {
    const req = new Request('http://localhost/api/auth/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createWebhookHeaders(),
      },
      body: JSON.stringify({
        type: 'user.deleted',
        data: {
          id: 'user_456',
          email_addresses: [],
          first_name: null,
          last_name: null,
          image_url: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        object: 'event',
      }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonResponse;
    expect(body.eventType).toBe('user.deleted');
  });

  it('logs but does not process user.updated events', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const req = new Request('http://localhost/api/auth/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createWebhookHeaders(),
      },
      body: JSON.stringify({
        type: 'user.updated',
        data: {
          id: 'user_789',
          email_addresses: [],
          first_name: 'Updated',
          last_name: 'User',
          image_url: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        object: 'event',
      }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('user.updated'));

    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Authenticated Routes Tests
// ============================================================================

describe('GET /api/auth/me', () => {
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
  });

  it('returns 401 if not authenticated', async () => {
    // Create app that sets userId to null
    const authApp = new Hono<Env>();
    authApp.use('*', async (c, next) => {
      c.set('requestId', 'test-request-id');
      c.set('userId', null);
      await next();
    });
    authApp.route('/api/auth', authRoutes);

    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
    });

    const res = await authApp.fetch(req, mockEnv);
    expect(res.status).toBe(401);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns user profile when authenticated', async () => {
    // Create app that sets userId
    const authApp = new Hono<Env>();
    authApp.use('*', async (c, next) => {
      c.set('requestId', 'test-request-id');
      c.set('userId', 'user_authenticated');
      await next();
    });
    authApp.route('/api/auth', authRoutes);

    // Mock D1 query to return user profile
    mockFindFirst.mockResolvedValue({
      id: 'user_authenticated',
      email: 'user@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
    });

    const res = await authApp.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonResponse;
    expect(body.id).toBe('user_authenticated');
    expect(body.email).toBe('user@example.com');
  });
});

describe('DELETE /api/auth/account', () => {
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
  });

  it('returns 401 if not authenticated', async () => {
    const authApp = new Hono<Env>();
    authApp.use('*', async (c, next) => {
      c.set('requestId', 'test-request-id');
      c.set('userId', null);
      await next();
    });
    authApp.route('/api/auth', authRoutes);

    const req = new Request('http://localhost/api/auth/account', {
      method: 'DELETE',
    });

    const res = await authApp.fetch(req, mockEnv);
    expect(res.status).toBe(401);
  });

  it('deletes account when authenticated', async () => {
    const authApp = new Hono<Env>();
    authApp.use('*', async (c, next) => {
      c.set('requestId', 'test-request-id');
      c.set('userId', 'user_to_delete');
      await next();
    });
    authApp.route('/api/auth', authRoutes);

    const req = new Request('http://localhost/api/auth/account', {
      method: 'DELETE',
    });

    const res = await authApp.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonResponse;
    expect(body.message).toBe('Account data deleted successfully');
    expect(body.userId).toBe('user_to_delete');
  });
});
