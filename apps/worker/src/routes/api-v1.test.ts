/**
 * @vitest-environment miniflare
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { ContentType, Provider } from '@zine/shared';
import type { Env } from '../types';

const { mockCreateDb, mockCreateContext, mockCreateCaller, mockLibrary, mockPreview, mockSave } =
  vi.hoisted(() => ({
    mockCreateDb: vi.fn(),
    mockCreateContext: vi.fn(async (c: { get: (key: string) => unknown }) => ({
      userId: c.get('userId'),
    })),
    mockCreateCaller: vi.fn(),
    mockLibrary: vi.fn(),
    mockPreview: vi.fn(),
    mockSave: vi.fn(),
  }));

vi.mock('../db', () => ({
  createDb: mockCreateDb,
}));

vi.mock('../trpc/context', () => ({
  createContext: mockCreateContext,
}));

vi.mock('../trpc/router', () => ({
  appRouter: {
    createCaller: mockCreateCaller,
  },
}));

import apiV1Routes from './api-v1';

type JsonBody = Record<string, unknown>;

const READ_WRITE_TOKEN = 'zine_pat_read_write_token';
const READ_ONLY_TOKEN = 'zine_pat_read_only_token';

function createTokenRecord(scopes: string[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'token_1',
    userId: 'user_123',
    name: 'Codex',
    tokenHash: 'hash',
    tokenPrefix: 'zine_pat_read',
    scopesJson: JSON.stringify(scopes),
    createdAt: Date.now(),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function createTestApp() {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    c.set('traceId', 'test-trace-id');
    await next();
  });

  app.route('/api/v1', apiV1Routes);
  return app;
}

function createMockEnv(): Env['Bindings'] {
  return {
    DB: {} as D1Database,
    WEBHOOK_IDEMPOTENCY: {} as KVNamespace,
    OAUTH_STATE_KV: {} as KVNamespace,
    ARTICLE_CONTENT: {} as R2Bucket,
    SPOTIFY_CACHE: {} as KVNamespace,
    CREATOR_CONTENT_CACHE: {} as KVNamespace,
    ENVIRONMENT: 'test',
  } as Env['Bindings'];
}

function mockDbToken(token: ReturnType<typeof createTokenRecord> | null) {
  const tokenUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const tokenUpdateSet = vi.fn().mockReturnValue({ where: tokenUpdateWhere });
  mockCreateDb.mockReturnValue({
    query: {
      apiTokens: {
        findFirst: vi.fn(async () => token),
      },
    },
    update: vi.fn().mockReturnValue({ set: tokenUpdateSet }),
  });
}

describe('apiV1Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbToken(createTokenRecord(['bookmarks:read', 'bookmarks:write']));
    mockCreateCaller.mockReturnValue({
      items: {
        library: mockLibrary,
      },
      bookmarks: {
        preview: mockPreview,
        save: mockSave,
      },
    });
  });

  it('serves an OpenAPI document without PAT auth', async () => {
    const app = createTestApp();

    const res = await app.fetch(new Request('http://localhost/api/v1/openapi.json'), {});

    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonBody;
    expect(body.openapi).toBe('3.1.0');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks');
  });

  it('returns 401 for missing and invalid tokens', async () => {
    const app = createTestApp();

    const missing = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks'),
      createMockEnv()
    );

    mockDbToken(null);
    const invalid = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it('returns 401 for revoked tokens', async () => {
    mockDbToken(
      createTokenRecord(['bookmarks:read', 'bookmarks:write'], {
        revokedAt: Date.now(),
      })
    );
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(401);
  });

  it('returns 403 when the token is missing the required scope', async () => {
    mockDbToken(createTokenRecord(['bookmarks:read']));
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_ONLY_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: 'https://example.com/article' }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(403);
    expect((await res.json()) as JsonBody).toMatchObject({ code: 'FORBIDDEN' });
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('lists bookmarks for the token owner', async () => {
    mockLibrary.mockResolvedValue({
      items: [{ id: 'ui_1', title: 'Recent bookmark' }],
      nextCursor: 'next-cursor',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks?limit=20&cursor=abc&search=recent', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockCreateCaller).toHaveBeenCalledWith({ userId: 'user_123' });
    expect(mockLibrary).toHaveBeenCalledWith({
      limit: 20,
      cursor: 'abc',
      search: 'recent',
      filter: {
        isFinished: undefined,
      },
    });
    expect((await res.json()) as JsonBody).toMatchObject({
      items: [{ title: 'Recent bookmark' }],
      nextCursor: 'next-cursor',
    });
  });

  it('previews and saves a bookmark URL for tokens with write scope', async () => {
    mockPreview.mockResolvedValue({
      provider: Provider.WEB,
      contentType: ContentType.ARTICLE,
      providerId: 'https://example.com/article',
      title: 'Article title',
      creator: 'Example',
      thumbnailUrl: null,
      duration: null,
      canonicalUrl: 'https://example.com/article',
      source: 'opengraph',
      description: 'Article summary',
    });
    mockSave.mockResolvedValue({
      itemId: 'item_1',
      userItemId: 'ui_1',
      status: 'created',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: 'https://example.com/article' }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockPreview).toHaveBeenCalledWith({ url: 'https://example.com/article' });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/article',
        title: 'Article title',
      })
    );
    expect((await res.json()) as JsonBody).toMatchObject({
      bookmark: {
        status: 'created',
      },
      item: {
        title: 'Article title',
      },
    });
  });
});
