/**
 * Tests for Replicache sync routes
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../types';
import syncRoutes from './sync';

// ============================================================================
// Test Helpers
// ============================================================================

interface JsonResponse {
  error?: string;
  code?: string;
  requestId?: string;
  details?: Array<{ path: string; message: string; code: string }>;
  cookie?: { version: number; schemaVersion: number };
  lastMutationIDChanges?: Record<string, number>;
  patch?: Array<{ op: string; key?: string; value?: unknown }>;
}

/**
 * Create a test app with or without authentication
 */
function createTestApp(userId: string | null = null) {
  const app = new Hono<Env>();

  // Add request ID middleware
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    c.set('userId', userId);
    await next();
  });

  app.route('/api/replicache', syncRoutes);
  return app;
}

/**
 * Create mock environment bindings
 */
function createMockEnv(doResponse?: Response): Env['Bindings'] {
  const defaultDoResponse = new Response(
    JSON.stringify({
      cookie: { version: 1, schemaVersion: 1 },
      lastMutationIDChanges: {},
      patch: [],
    }),
    { status: 200 }
  );

  return {
    USER_DO: {
      idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-do-id' }),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue(doResponse ?? defaultDoResponse),
      }),
    } as unknown as DurableObjectNamespace,
    WEBHOOK_IDEMPOTENCY: {} as unknown as KVNamespace,
    ENVIRONMENT: 'test',
  };
}

/**
 * Create a valid push request body
 */
function createValidPushRequest() {
  return {
    clientGroupID: 'test-client-group',
    profileID: 'test-profile',
    mutations: [],
    schemaVersion: 1,
  };
}

/**
 * Create a valid pull request body
 */
function createValidPullRequest() {
  return {
    clientGroupID: 'test-client-group',
    profileID: 'test-profile',
    cookie: null,
    schemaVersion: 1,
  };
}

// ============================================================================
// Authentication Tests
// ============================================================================

describe('POST /api/replicache/push - Authentication', () => {
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
  });

  it('returns 401 when userId is not set', async () => {
    const app = createTestApp(null);

    const req = new Request('http://localhost/api/replicache/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidPushRequest()),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(401);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toBe('Authentication required');
    expect(body.requestId).toBe('test-request-id');
  });
});

describe('POST /api/replicache/pull - Authentication', () => {
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
  });

  it('returns 401 when userId is not set', async () => {
    const app = createTestApp(null);

    const req = new Request('http://localhost/api/replicache/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidPullRequest()),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(401);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toBe('Authentication required');
    expect(body.requestId).toBe('test-request-id');
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('POST /api/replicache/push - Validation', () => {
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
  });

  it('returns 400 when body is not valid JSON', async () => {
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('INVALID_JSON');
  });

  it('returns 400 when clientGroupID is missing', async () => {
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileID: 'test-profile',
        mutations: [],
      }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
    expect(body.details?.some((d) => d.path === 'clientGroupID')).toBe(true);
  });

  it('returns 400 when mutations is not an array', async () => {
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientGroupID: 'test-client-group',
        profileID: 'test-profile',
        mutations: 'not an array',
      }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
    expect(body.details?.some((d) => d.path === 'mutations')).toBe(true);
  });
});

describe('POST /api/replicache/pull - Validation', () => {
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
  });

  it('returns 400 when body is not valid JSON', async () => {
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('INVALID_JSON');
  });

  it('returns 400 when clientGroupID is missing', async () => {
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileID: 'test-profile',
        cookie: null,
      }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
    expect(body.details?.some((d) => d.path === 'clientGroupID')).toBe(true);
  });

  it('returns 400 when cookie has invalid structure', async () => {
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientGroupID: 'test-client-group',
        profileID: 'test-profile',
        cookie: { invalid: 'structure' },
      }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

// ============================================================================
// Success Tests
// ============================================================================

describe('POST /api/replicache/push - Success', () => {
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 on valid push request', async () => {
    const doResponse = new Response(JSON.stringify({}), { status: 200 });
    mockEnv = createMockEnv(doResponse);
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidPushRequest()),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    // Verify DO was called correctly
    expect(mockEnv.USER_DO.idFromName).toHaveBeenCalledWith('user_123');
    expect(mockEnv.USER_DO.get).toHaveBeenCalled();
  });

  it('forwards push request to Durable Object', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    mockEnv = {
      ...createMockEnv(),
      USER_DO: {
        idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-do-id' }),
        get: vi.fn().mockReturnValue({ fetch: mockFetch }),
      } as unknown as DurableObjectNamespace,
    };
    const app = createTestApp('user_123');

    const pushRequest = createValidPushRequest();
    const req = new Request('http://localhost/api/replicache/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pushRequest),
    });

    await app.fetch(req, mockEnv);

    // Verify the DO fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith(
      'http://do/push',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Request-ID': 'test-request-id',
        }),
      })
    );

    // Verify the body was passed correctly
    const fetchCall = mockFetch.mock.calls[0];
    const passedBody = JSON.parse(fetchCall[1].body);
    expect(passedBody.clientGroupID).toBe(pushRequest.clientGroupID);
    expect(passedBody.mutations).toEqual(pushRequest.mutations);
  });
});

describe('POST /api/replicache/pull - Success', () => {
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 on valid pull request', async () => {
    const pullResponse = {
      cookie: { version: 1, schemaVersion: 1 },
      lastMutationIDChanges: {},
      patch: [],
    };
    const doResponse = new Response(JSON.stringify(pullResponse), { status: 200 });
    mockEnv = createMockEnv(doResponse);
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidPullRequest()),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonResponse;
    expect(body.cookie).toEqual(pullResponse.cookie);
    expect(body.patch).toEqual(pullResponse.patch);

    // Verify DO was called correctly
    expect(mockEnv.USER_DO.idFromName).toHaveBeenCalledWith('user_123');
    expect(mockEnv.USER_DO.get).toHaveBeenCalled();
  });

  it('forwards pull request to Durable Object with cookie', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cookie: { version: 2, schemaVersion: 1 },
          lastMutationIDChanges: {},
          patch: [{ op: 'put', key: 'item/1', value: { id: '1' } }],
        }),
        { status: 200 }
      )
    );
    mockEnv = {
      ...createMockEnv(),
      USER_DO: {
        idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-do-id' }),
        get: vi.fn().mockReturnValue({ fetch: mockFetch }),
      } as unknown as DurableObjectNamespace,
    };
    const app = createTestApp('user_123');

    const pullRequest = {
      ...createValidPullRequest(),
      cookie: { version: 1, schemaVersion: 1 },
    };
    const req = new Request('http://localhost/api/replicache/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pullRequest),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    // Verify the DO fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith(
      'http://do/pull',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Request-ID': 'test-request-id',
        }),
      })
    );

    // Verify the body was passed correctly
    const fetchCall = mockFetch.mock.calls[0];
    const passedBody = JSON.parse(fetchCall[1].body);
    expect(passedBody.cookie).toEqual(pullRequest.cookie);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Durable Object Error Handling', () => {
  let mockEnv: Env['Bindings'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 when DO fetch fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('DO connection failed'));
    mockEnv = {
      ...createMockEnv(),
      USER_DO: {
        idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-do-id' }),
        get: vi.fn().mockReturnValue({ fetch: mockFetch }),
      } as unknown as DurableObjectNamespace,
    };
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidPushRequest()),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(500);

    const body = (await res.json()) as JsonResponse;
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('forwards DO 400 errors to client', async () => {
    const doError = { error: 'Invalid mutation', details: 'Unknown mutator' };
    const doResponse = new Response(JSON.stringify(doError), { status: 400 });
    mockEnv = createMockEnv(doResponse);
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidPushRequest()),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonResponse;
    expect(body.error).toBe('Invalid mutation');
  });

  it('forwards DO 500 errors to client', async () => {
    const doError = { error: 'Internal error', code: 'DO_ERROR' };
    const doResponse = new Response(JSON.stringify(doError), { status: 500 });
    mockEnv = createMockEnv(doResponse);
    const app = createTestApp('user_123');

    const req = new Request('http://localhost/api/replicache/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidPullRequest()),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(500);

    const body = (await res.json()) as JsonResponse;
    expect(body.error).toBe('Internal error');
  });
});
