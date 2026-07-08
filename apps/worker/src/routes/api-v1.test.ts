/**
 * @vitest-environment miniflare
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { TRPCError } from '@trpc/server';
import { ContentType, Provider, UserItemState } from '@zine/shared';
import type { Env } from '../types';

const {
  mockCreateDb,
  mockCreateContext,
  mockCreateCaller,
  mockInbox,
  mockLibrary,
  mockGetItem,
  mockBookmarkInboxItem,
  mockArchiveInboxItem,
  mockUnbookmark,
  mockSetTags,
  mockMarkOpened,
  mockUpdateProgress,
  mockGetArticleContent,
  mockListTags,
  mockPreview,
  mockSave,
  mockInitiateSyncJob,
  mockGetActiveSyncJob,
  mockGetJobStatus,
  mockGetSyncStatus,
  mockFindUserItem,
  mockUserItemUpdateSet,
  mockConsumptionInsertValues,
} = vi.hoisted(() => ({
  mockCreateDb: vi.fn(),
  mockCreateContext: vi.fn(async (c: { get: (key: string) => unknown }) => ({
    userId: c.get('userId'),
  })),
  mockCreateCaller: vi.fn(),
  mockInbox: vi.fn(),
  mockLibrary: vi.fn(),
  mockGetItem: vi.fn(),
  mockBookmarkInboxItem: vi.fn(),
  mockArchiveInboxItem: vi.fn(),
  mockUnbookmark: vi.fn(),
  mockSetTags: vi.fn(),
  mockMarkOpened: vi.fn(),
  mockUpdateProgress: vi.fn(),
  mockGetArticleContent: vi.fn(),
  mockListTags: vi.fn(),
  mockPreview: vi.fn(),
  mockSave: vi.fn(),
  mockInitiateSyncJob: vi.fn(),
  mockGetActiveSyncJob: vi.fn(),
  mockGetJobStatus: vi.fn(),
  mockGetSyncStatus: vi.fn(),
  mockFindUserItem: vi.fn(),
  mockUserItemUpdateSet: vi.fn(),
  mockConsumptionInsertValues: vi.fn(),
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

vi.mock('../sync/service', async () => {
  class RateLimitError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'RateLimitError';
    }
  }

  return {
    initiateSyncJob: mockInitiateSyncJob,
    getActiveSyncJob: mockGetActiveSyncJob,
    getJobStatus: mockGetJobStatus,
    getSyncStatus: mockGetSyncStatus,
    RateLimitError,
  };
});

import apiV1Routes from './api-v1';
import { RateLimitError } from '../sync/service';

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
  const userItemUpdateWhere = vi.fn().mockResolvedValue(undefined);
  mockUserItemUpdateSet.mockReturnValue({ where: userItemUpdateWhere });
  mockConsumptionInsertValues.mockResolvedValue(undefined);

  mockCreateDb.mockReturnValue({
    query: {
      apiTokens: {
        findFirst: vi.fn(async () => token),
      },
      userItems: {
        findFirst: mockFindUserItem,
      },
    },
    update: vi.fn().mockReturnValueOnce({ set: tokenUpdateSet }).mockReturnValue({
      set: mockUserItemUpdateSet,
    }),
    insert: vi.fn().mockReturnValue({ values: mockConsumptionInsertValues }),
  });
}

function createBookmarkRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ui_1',
    userId: 'user_123',
    itemId: 'item_1',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2026-01-01T00:00:00.000Z',
    bookmarkedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    lastOpenedAt: null,
    progressPosition: null,
    progressDuration: null,
    progressUpdatedAt: null,
    isFinished: false,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('apiV1Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbToken(createTokenRecord(['bookmarks:read', 'bookmarks:write']));
    mockCreateCaller.mockReturnValue({
      items: {
        inbox: mockInbox,
        library: mockLibrary,
        get: mockGetItem,
        bookmark: mockBookmarkInboxItem,
        archive: mockArchiveInboxItem,
        unbookmark: mockUnbookmark,
        setTags: mockSetTags,
        markOpened: mockMarkOpened,
        updateProgress: mockUpdateProgress,
        getArticleContent: mockGetArticleContent,
        listTags: mockListTags,
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
    expect(body.paths).toHaveProperty('/api/v1/inbox');
    expect(body.paths).toHaveProperty('/api/v1/inbox/{id}/bookmark');
    expect(body.paths).toHaveProperty('/api/v1/inbox/{id}/archive');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/preview');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}/tags');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}/opened');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}/progress');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}/article-content');
    expect(body.paths).toHaveProperty('/api/v1/tags');
    expect(body.paths).toHaveProperty('/api/v1/sync-jobs');
    expect(body.paths).toHaveProperty('/api/v1/sync-jobs/{jobId}');
    expect(body.paths).toHaveProperty('/api/v1/sync-jobs/active');
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

  it('returns 403 when listing inbox without read scope', async () => {
    mockDbToken(createTokenRecord(['bookmarks:write']));
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/inbox', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(403);
    expect((await res.json()) as JsonBody).toMatchObject({ code: 'FORBIDDEN' });
    expect(mockInbox).not.toHaveBeenCalled();
  });

  it('starts a sync job for tokens with sync write scope', async () => {
    mockDbToken(createTokenRecord(['sync:write']));
    mockInitiateSyncJob.mockResolvedValue({
      jobId: 'job_1',
      total: 2,
      existing: false,
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/sync-jobs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(202);
    expect(mockInitiateSyncJob).toHaveBeenCalledWith(
      'user_123',
      expect.anything(),
      expect.objectContaining({ ENVIRONMENT: 'test' }),
      expect.objectContaining({
        requestId: 'test-request-id',
        traceId: 'test-trace-id',
        source: 'api.v1.syncJobs.create',
      })
    );
    expect((await res.json()) as JsonBody).toMatchObject({
      jobId: 'job_1',
      total: 2,
      existing: false,
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
  });

  it('returns 403 when starting a sync job without sync write scope', async () => {
    mockDbToken(createTokenRecord(['sync:read']));
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/sync-jobs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(403);
    expect((await res.json()) as JsonBody).toMatchObject({ code: 'FORBIDDEN' });
    expect(mockInitiateSyncJob).not.toHaveBeenCalled();
  });

  it('rejects request bodies for sync job creation until source filtering is supported', async () => {
    mockDbToken(createTokenRecord(['sync:write']));
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/sync-jobs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sources: ['YOUTUBE'] }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(400);
    expect((await res.json()) as JsonBody).toMatchObject({ code: 'INVALID_REQUEST_BODY' });
    expect(mockInitiateSyncJob).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON when starting a sync job', async () => {
    mockDbToken(createTokenRecord(['sync:write']));
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/sync-jobs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: '{',
      }),
      createMockEnv()
    );

    expect(res.status).toBe(400);
    expect((await res.json()) as JsonBody).toMatchObject({ code: 'INVALID_REQUEST_BODY' });
    expect(mockInitiateSyncJob).not.toHaveBeenCalled();
  });

  it('maps sync job rate limits to 429', async () => {
    mockDbToken(createTokenRecord(['sync:write']));
    mockInitiateSyncJob.mockRejectedValue(new RateLimitError('Please wait 90 seconds'));
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/sync-jobs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('90');
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'RATE_LIMITED',
      error: 'Please wait 90 seconds',
      retryAfterSeconds: 90,
    });
  });

  it('returns the active sync job for tokens with sync read scope', async () => {
    mockDbToken(createTokenRecord(['sync:read']));
    mockGetActiveSyncJob.mockResolvedValue({
      inProgress: true,
      jobId: 'job_1',
      progress: { total: 2, completed: 1, status: 'processing' },
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/sync-jobs/active', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockGetActiveSyncJob).toHaveBeenCalledWith('user_123', expect.anything());
    expect((await res.json()) as JsonBody).toMatchObject({
      inProgress: true,
      jobId: 'job_1',
      progress: { total: 2, completed: 1, status: 'processing' },
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
  });

  it('returns sync job status for tokens with sync read scope', async () => {
    mockDbToken(createTokenRecord(['sync:read']));
    mockGetJobStatus.mockResolvedValue({
      jobId: 'job_1',
      userId: 'user_123',
      status: 'completed',
      total: 2,
      completed: 2,
      succeeded: 2,
      failed: 0,
      itemsFound: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      errors: [],
    });
    mockGetSyncStatus.mockResolvedValue({
      jobId: 'job_1',
      status: 'completed',
      total: 2,
      completed: 2,
      succeeded: 2,
      failed: 0,
      itemsFound: 3,
      progress: 100,
      errors: [],
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/sync-jobs/job_1', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockGetJobStatus).toHaveBeenCalledWith('job_1', expect.anything());
    expect(mockGetSyncStatus).toHaveBeenCalledWith('job_1', expect.anything());
    expect((await res.json()) as JsonBody).toMatchObject({
      jobId: 'job_1',
      status: 'completed',
      total: 2,
      completed: 2,
      succeeded: 2,
      failed: 0,
      itemsFound: 3,
      progress: 100,
      errors: [],
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
  });

  it('returns 404 for missing or foreign sync jobs', async () => {
    mockDbToken(createTokenRecord(['sync:read']));
    mockGetJobStatus.mockResolvedValue({
      jobId: 'job_1',
      userId: 'someone_else',
      status: 'processing',
      total: 2,
      completed: 1,
      succeeded: 1,
      failed: 0,
      itemsFound: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      errors: [],
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/sync-jobs/job_1', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(404);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'SYNC_JOB_NOT_FOUND',
    });
    expect(mockGetSyncStatus).not.toHaveBeenCalled();
  });

  it('lists inbox items for the token owner', async () => {
    mockInbox.mockResolvedValue({
      items: [{ id: 'ui_inbox_1', title: 'Inbox item' }],
      nextCursor: 'next-cursor',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request(
        'http://localhost/api/v1/inbox?limit=20&cursor=abc&provider=YOUTUBE&contentType=VIDEO',
        {
          headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
        }
      ),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockCreateCaller).toHaveBeenCalledWith({ userId: 'user_123' });
    expect(mockInbox).toHaveBeenCalledWith({
      limit: 20,
      cursor: 'abc',
      filter: {
        provider: Provider.YOUTUBE,
        contentType: ContentType.VIDEO,
      },
    });
    expect((await res.json()) as JsonBody).toMatchObject({
      items: [{ title: 'Inbox item' }],
      nextCursor: 'next-cursor',
    });
  });

  it('rejects invalid inbox filters', async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/inbox?provider=NOT_A_PROVIDER', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(400);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'INVALID_QUERY_PARAMETERS',
    });
    expect(mockInbox).not.toHaveBeenCalled();
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
        provider: undefined,
        contentType: undefined,
        isFinished: undefined,
      },
    });
    expect((await res.json()) as JsonBody).toMatchObject({
      items: [{ title: 'Recent bookmark' }],
      nextCursor: 'next-cursor',
    });
  });

  it('passes bookmark provider and content type filters to the library caller', async () => {
    mockLibrary.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request(
        'http://localhost/api/v1/bookmarks?provider=WEB&contentType=ARTICLE&isFinished=true',
        {
          headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
        }
      ),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockLibrary).toHaveBeenCalledWith({
      limit: 10,
      cursor: undefined,
      search: undefined,
      filter: {
        provider: Provider.WEB,
        contentType: ContentType.ARTICLE,
        isFinished: true,
      },
    });
  });

  it('rejects invalid bookmark filters', async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks?contentType=BOOK', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(400);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'INVALID_QUERY_PARAMETERS',
    });
    expect(mockLibrary).not.toHaveBeenCalled();
  });

  it('moves an inbox item to bookmarks', async () => {
    mockBookmarkInboxItem.mockResolvedValue({ success: true });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/inbox/ui_inbox_1/bookmark', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockBookmarkInboxItem).toHaveBeenCalledWith({ id: 'ui_inbox_1' });
    expect((await res.json()) as JsonBody).toMatchObject({
      success: true,
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
  });

  it('archives an inbox item', async () => {
    mockArchiveInboxItem.mockResolvedValue({ success: true });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/inbox/ui_inbox_1/archive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockArchiveInboxItem).toHaveBeenCalledWith({ id: 'ui_inbox_1' });
    expect((await res.json()) as JsonBody).toMatchObject({ success: true });
  });

  it('maps tRPC not found errors to REST 404 responses', async () => {
    mockGetItem.mockRejectedValue(
      new TRPCError({ code: 'NOT_FOUND', message: 'Item missing not found' })
    );
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/missing', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(404);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'NOT_FOUND',
      error: 'Item missing not found',
    });
  });

  it('previews a bookmark URL without saving it', async () => {
    mockPreview.mockResolvedValue({
      provider: Provider.WEB,
      contentType: ContentType.ARTICLE,
      providerId: 'https://example.com/article',
      title: 'Preview title',
      creator: 'Example',
      creatorImageUrl: null,
      thumbnailUrl: null,
      duration: null,
      canonicalUrl: 'https://example.com/article',
      description: 'Preview summary',
      siteName: 'Example',
      wordCount: 500,
      readingTimeMinutes: 3,
      publishedAt: null,
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/preview', {
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
    expect(mockSave).not.toHaveBeenCalled();
    expect((await res.json()) as JsonBody).toMatchObject({
      item: {
        title: 'Preview title',
        wordCount: 500,
      },
    });
  });

  it('returns 422 when bookmark preview cannot resolve the URL', async () => {
    mockPreview.mockResolvedValue(null);
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: 'https://example.com/unsupported' }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(422);
    expect((await res.json()) as JsonBody).toMatchObject({ code: 'UNSUPPORTED_URL' });
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
        body: JSON.stringify({ url: 'https://example.com/article', tags: ['Design', ' api '] }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockPreview).toHaveBeenCalledWith({ url: 'https://example.com/article' });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/article',
        title: 'Article title',
        tags: ['Design', ' api '],
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

  it('maps bookmark save bad request errors to REST 400 responses', async () => {
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
    mockSave.mockRejectedValue(new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid tag' }));
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: 'https://example.com/article', tags: ['Invalid tag'] }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(400);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'BAD_REQUEST',
      error: 'Invalid tag',
    });
  });

  it('gets a bookmark by ID', async () => {
    mockGetItem.mockResolvedValue({
      id: 'ui_1',
      itemId: 'item_1',
      title: 'Detailed bookmark',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockGetItem).toHaveBeenCalledWith({ id: 'ui_1' });
    expect((await res.json()) as JsonBody).toMatchObject({
      item: {
        id: 'ui_1',
        itemId: 'item_1',
        title: 'Detailed bookmark',
      },
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
  });

  it('marks a bookmark as finished for tokens with write scope', async () => {
    mockFindUserItem.mockResolvedValue(createBookmarkRecord());
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isFinished: true }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockFindUserItem).toHaveBeenCalled();
    expect(mockUserItemUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinished: true,
        finishedAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    );
    expect(mockConsumptionInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        userItemId: 'ui_1',
        itemId: 'item_1',
        eventType: 'FINISHED',
        source: 'MANUAL_FINISH_TOGGLE',
        metadata: JSON.stringify({ source: 'api_v1' }),
      })
    );
    expect((await res.json()) as JsonBody).toMatchObject({
      bookmark: {
        id: 'ui_1',
        itemId: 'item_1',
        isFinished: true,
      },
    });
  });

  it('removes a bookmark', async () => {
    mockUnbookmark.mockResolvedValue({ success: true });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockUnbookmark).toHaveBeenCalledWith({ id: 'ui_1' });
    expect((await res.json()) as JsonBody).toMatchObject({ success: true });
  });

  it('maps unbookmark bad request errors to REST 400 responses', async () => {
    mockUnbookmark.mockRejectedValue(
      new TRPCError({ code: 'BAD_REQUEST', message: 'Item is not bookmarked' })
    );
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_inbox', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(400);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'BAD_REQUEST',
      error: 'Item is not bookmarked',
    });
  });

  it('replaces bookmark tags', async () => {
    mockSetTags.mockResolvedValue({
      success: true,
      tags: [
        { id: 'tag_1', name: 'design' },
        { id: 'tag_2', name: 'api' },
      ],
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/tags', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tags: ['design', 'api'] }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockSetTags).toHaveBeenCalledWith({ id: 'ui_1', tags: ['design', 'api'] });
    expect((await res.json()) as JsonBody).toMatchObject({
      success: true,
      tags: [{ name: 'design' }, { name: 'api' }],
    });
  });

  it('rejects invalid bookmark tags bodies', async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/tags', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`) }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(400);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'INVALID_REQUEST_BODY',
    });
    expect(mockSetTags).not.toHaveBeenCalled();
  });

  it('records bookmark open events', async () => {
    mockMarkOpened.mockResolvedValue({
      success: true,
      updated: true,
      lastOpenedAt: '2026-01-02T00:00:00.000Z',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/opened', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockMarkOpened).toHaveBeenCalledWith({ id: 'ui_1' });
    expect((await res.json()) as JsonBody).toMatchObject({
      success: true,
      updated: true,
      lastOpenedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('returns null lastOpenedAt when mark opened does not update the item', async () => {
    mockMarkOpened.mockResolvedValue({ success: true, updated: false });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/opened', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as JsonBody).toMatchObject({
      success: true,
      updated: false,
      lastOpenedAt: null,
    });
  });

  it('updates bookmark progress', async () => {
    mockUpdateProgress.mockResolvedValue({ success: true });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/progress', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ position: 125.4, duration: 600 }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockUpdateProgress).toHaveBeenCalledWith({
      id: 'ui_1',
      position: 125.4,
      duration: 600,
    });
    expect((await res.json()) as JsonBody).toMatchObject({ success: true });
  });

  it('rejects invalid progress bodies', async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/progress', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ position: -1, duration: 600 }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(400);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'INVALID_REQUEST_BODY',
    });
    expect(mockUpdateProgress).not.toHaveBeenCalled();
  });

  it('gets bookmark article content by resolving the user item first', async () => {
    mockGetItem.mockResolvedValue({
      id: 'ui_1',
      itemId: 'item_1',
      title: 'Article',
    });
    mockGetArticleContent.mockResolvedValue({ content: '<article>Body</article>' });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/article-content', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockGetItem).toHaveBeenCalledWith({ id: 'ui_1' });
    expect(mockGetArticleContent).toHaveBeenCalledWith({ itemId: 'item_1' });
    expect((await res.json()) as JsonBody).toMatchObject({
      content: '<article>Body</article>',
    });
  });

  it('lists tags', async () => {
    mockListTags.mockResolvedValue({
      tags: [
        { id: 'tag_1', name: 'design' },
        { id: 'tag_2', name: 'api' },
      ],
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/tags', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockListTags).toHaveBeenCalledWith();
    expect((await res.json()) as JsonBody).toMatchObject({
      tags: [{ name: 'design' }, { name: 'api' }],
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
  });

  it('accepts completed/read/finished aliases but only one at a time', async () => {
    mockFindUserItem.mockResolvedValue(createBookmarkRecord());
    const app = createTestApp();

    const completed = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: true }),
      }),
      createMockEnv()
    );

    const ambiguous = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: true, read: true }),
      }),
      createMockEnv()
    );

    expect(completed.status).toBe(200);
    expect(ambiguous.status).toBe(400);
    expect((await ambiguous.json()) as JsonBody).toMatchObject({
      code: 'INVALID_REQUEST_BODY',
    });
  });

  it('returns 404 when marking a missing bookmark as finished', async () => {
    mockFindUserItem.mockResolvedValue(null);
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/missing', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ read: true }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(404);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'BOOKMARK_NOT_FOUND',
    });
    expect(mockUserItemUpdateSet).not.toHaveBeenCalled();
    expect(mockConsumptionInsertValues).not.toHaveBeenCalled();
  });

  it('does not rewrite or emit an event when the requested finished state is unchanged', async () => {
    mockFindUserItem.mockResolvedValue(
      createBookmarkRecord({
        isFinished: true,
        finishedAt: '2026-01-02T00:00:00.000Z',
      })
    );
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ finished: true }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockUserItemUpdateSet).not.toHaveBeenCalled();
    expect(mockConsumptionInsertValues).not.toHaveBeenCalled();
    expect((await res.json()) as JsonBody).toMatchObject({
      bookmark: {
        isFinished: true,
        finishedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });
});
