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
  mockHome,
  mockLibrary,
  mockRecentlyOpened,
  mockQuickWins,
  mockCollectionItems,
  mockGetItem,
  mockBookmarkInboxItem,
  mockArchiveInboxItem,
  mockGetCreator,
  mockCreatorBookmarks,
  mockCreatorLatestContent,
  mockUnbookmark,
  mockSetTags,
  mockMarkOpened,
  mockUpdateProgress,
  mockGetArticleContent,
  mockGetArticleBodyStatus,
  mockGetArticleBodyArtifact,
  mockEnqueueArticleBody,
  mockListTags,
  mockPreview,
  mockSave,
  mockConnectionsList,
  mockConnectionsRegisterState,
  mockConnectionsCallback,
  mockConnectionsDisconnect,
  mockSubscriptionsList,
  mockSubscriptionsDiscover,
  mockSubscriptionsAdd,
  mockSubscriptionsRemove,
  mockSubscriptionsPause,
  mockSubscriptionsResume,
  mockSubscriptionsSyncNow,
  mockNewslettersList,
  mockNewslettersStats,
  mockNewslettersUpdateStatus,
  mockNewslettersUnsubscribe,
  mockNewslettersSyncNow,
  mockRssList,
  mockRssStats,
  mockRssAdd,
  mockRssRemove,
  mockRssPause,
  mockRssResume,
  mockRssSyncNow,
  mockXBookmarksStatus,
  mockXBookmarksUpdateSettings,
  mockXBookmarksSyncNow,
  mockInitiateSyncJob,
  mockGetActiveSyncJob,
  mockGetJobStatus,
  mockGetSyncStatus,
  mockFindUserItem,
  mockUserItemUpdateSet,
  mockConsumptionInsertValues,
  mockVerifyClerkRequestToken,
  mockStartEditorialRun,
  mockFailEditorialRun,
  mockGetEditorialFeedbackProfile,
  mockRecordEditorialFeedback,
  mockCreateEditorialExperiment,
  mockGetEditorialExperiment,
  mockListEditorialExperiments,
  mockUpdateEditorialExperiment,
  mockLockEditorialExperiment,
  mockFailEditorialExperiment,
  mockAbandonEditorialExperiment,
  mockPublishEditorialExperimentVariant,
  mockGetEditorialExperimentVariantPreview,
  mockReviewEditorialExperiment,
  mockPromoteEditorialExperiment,
} = vi.hoisted(() => ({
  mockCreateDb: vi.fn(),
  mockCreateContext: vi.fn(async (c: { get: (key: string) => unknown }) => ({
    userId: c.get('userId'),
  })),
  mockCreateCaller: vi.fn(),
  mockInbox: vi.fn(),
  mockHome: vi.fn(),
  mockLibrary: vi.fn(),
  mockRecentlyOpened: vi.fn(),
  mockQuickWins: vi.fn(),
  mockCollectionItems: vi.fn(),
  mockGetItem: vi.fn(),
  mockBookmarkInboxItem: vi.fn(),
  mockArchiveInboxItem: vi.fn(),
  mockGetCreator: vi.fn(),
  mockCreatorBookmarks: vi.fn(),
  mockCreatorLatestContent: vi.fn(),
  mockUnbookmark: vi.fn(),
  mockSetTags: vi.fn(),
  mockMarkOpened: vi.fn(),
  mockUpdateProgress: vi.fn(),
  mockGetArticleContent: vi.fn(),
  mockGetArticleBodyStatus: vi.fn(),
  mockGetArticleBodyArtifact: vi.fn(),
  mockEnqueueArticleBody: vi.fn(),
  mockListTags: vi.fn(),
  mockPreview: vi.fn(),
  mockSave: vi.fn(),
  mockConnectionsList: vi.fn(),
  mockConnectionsRegisterState: vi.fn(),
  mockConnectionsCallback: vi.fn(),
  mockConnectionsDisconnect: vi.fn(),
  mockSubscriptionsList: vi.fn(),
  mockSubscriptionsDiscover: vi.fn(),
  mockSubscriptionsAdd: vi.fn(),
  mockSubscriptionsRemove: vi.fn(),
  mockSubscriptionsPause: vi.fn(),
  mockSubscriptionsResume: vi.fn(),
  mockSubscriptionsSyncNow: vi.fn(),
  mockNewslettersList: vi.fn(),
  mockNewslettersStats: vi.fn(),
  mockNewslettersUpdateStatus: vi.fn(),
  mockNewslettersUnsubscribe: vi.fn(),
  mockNewslettersSyncNow: vi.fn(),
  mockRssList: vi.fn(),
  mockRssStats: vi.fn(),
  mockRssAdd: vi.fn(),
  mockRssRemove: vi.fn(),
  mockRssPause: vi.fn(),
  mockRssResume: vi.fn(),
  mockRssSyncNow: vi.fn(),
  mockXBookmarksStatus: vi.fn(),
  mockXBookmarksUpdateSettings: vi.fn(),
  mockXBookmarksSyncNow: vi.fn(),
  mockInitiateSyncJob: vi.fn(),
  mockGetActiveSyncJob: vi.fn(),
  mockGetJobStatus: vi.fn(),
  mockGetSyncStatus: vi.fn(),
  mockFindUserItem: vi.fn(),
  mockUserItemUpdateSet: vi.fn(),
  mockConsumptionInsertValues: vi.fn(),
  mockVerifyClerkRequestToken: vi.fn(),
  mockStartEditorialRun: vi.fn(),
  mockFailEditorialRun: vi.fn(),
  mockGetEditorialFeedbackProfile: vi.fn(),
  mockRecordEditorialFeedback: vi.fn(),
  mockCreateEditorialExperiment: vi.fn(),
  mockGetEditorialExperiment: vi.fn(),
  mockListEditorialExperiments: vi.fn(),
  mockUpdateEditorialExperiment: vi.fn(),
  mockLockEditorialExperiment: vi.fn(),
  mockFailEditorialExperiment: vi.fn(),
  mockAbandonEditorialExperiment: vi.fn(),
  mockPublishEditorialExperimentVariant: vi.fn(),
  mockGetEditorialExperimentVariantPreview: vi.fn(),
  mockReviewEditorialExperiment: vi.fn(),
  mockPromoteEditorialExperiment: vi.fn(),
}));

vi.mock('../db', () => ({
  createDb: mockCreateDb,
}));

vi.mock('../article-body/service', async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    getArticleBodyStatus: mockGetArticleBodyStatus,
    enqueueArticleBody: mockEnqueueArticleBody,
  };
});

vi.mock('../article-body/storage', () => ({
  getArticleBodyArtifact: mockGetArticleBodyArtifact,
}));

vi.mock('../trpc/context', () => ({
  createContext: mockCreateContext,
}));

vi.mock('../trpc/router', () => ({
  appRouter: {
    createCaller: mockCreateCaller,
  },
}));

vi.mock('../middleware/auth', () => ({
  verifyClerkRequestToken: mockVerifyClerkRequestToken,
}));

vi.mock('../lib/editorial-runs', () => {
  class EditorialRunConflictError extends Error {}
  class EditorialRunNotFoundError extends Error {}
  return {
    EditorialRunConflictError,
    EditorialRunNotFoundError,
    startEditorialRun: mockStartEditorialRun,
    failEditorialRun: mockFailEditorialRun,
    assertEditorialRunCanPublish: vi.fn(),
    completeEditorialRun: vi.fn(),
  };
});

vi.mock('../lib/editorial-feedback', () => {
  class EditorialFeedbackConflictError extends Error {}
  class EditorialFeedbackTargetError extends Error {}
  return {
    EditorialFeedbackConflictError,
    EditorialFeedbackTargetError,
    getEditorialFeedbackProfile: mockGetEditorialFeedbackProfile,
    recordEditorialFeedback: mockRecordEditorialFeedback,
  };
});

vi.mock('../lib/editorial-experiments', () => {
  class EditorialExperimentConflictError extends Error {}
  class EditorialExperimentNotFoundError extends Error {}
  class EditorialExperimentTransitionError extends Error {}
  class EditorialExperimentValidationError extends Error {}
  return {
    EditorialExperimentConflictError,
    EditorialExperimentNotFoundError,
    EditorialExperimentTransitionError,
    EditorialExperimentValidationError,
    createEditorialExperiment: mockCreateEditorialExperiment,
    getEditorialExperiment: mockGetEditorialExperiment,
    listEditorialExperiments: mockListEditorialExperiments,
    updateEditorialExperiment: mockUpdateEditorialExperiment,
    lockEditorialExperiment: mockLockEditorialExperiment,
    failEditorialExperiment: mockFailEditorialExperiment,
    abandonEditorialExperiment: mockAbandonEditorialExperiment,
    publishEditorialExperimentVariant: mockPublishEditorialExperimentVariant,
    getEditorialExperimentVariantPreview: mockGetEditorialExperimentVariantPreview,
    reviewEditorialExperiment: mockReviewEditorialExperiment,
    promoteEditorialExperiment: mockPromoteEditorialExperiment,
  };
});

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
import { EditorialRunConflictError, EditorialRunNotFoundError } from '../lib/editorial-runs';

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

function editorialExperimentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'experiment-1',
    title: 'Breadth versus engagement',
    editionDate: '2026-07-19',
    status: 'DRAFT',
    hypothesis: 'A broader portfolio will make Today more useful.',
    changeSummary: 'Reduce the influence of raw engagement.',
    desiredOutcomes: ['A non-technology story can lead.'],
    guardrails: ['Do not weaken source verification.'],
    variants: [],
    latestReview: null,
    winningVariantId: null,
    promotedEditionId: null,
    failureMessage: null,
    abandonmentReason: null,
    lockedAt: null,
    decidedAt: null,
    promotedAt: null,
    createdAt: '2026-07-19T10:00:00.000Z',
    updatedAt: '2026-07-19T10:00:00.000Z',
    nextAction: 'Review the experiment brief, then lock it.',
    ...overrides,
  };
}

describe('apiV1Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbToken(createTokenRecord(['bookmarks:read', 'bookmarks:write']));
    mockVerifyClerkRequestToken.mockResolvedValue({
      success: true,
      userId: 'clerk_user_123',
      payload: { sub: 'clerk_user_123' },
    });
    mockGetArticleBodyStatus.mockResolvedValue(null);
    mockGetArticleBodyArtifact.mockResolvedValue(null);
    mockEnqueueArticleBody.mockResolvedValue({ queued: false, reason: 'current' });
    mockConnectionsList.mockResolvedValue({
      YOUTUBE: null,
      SPOTIFY: null,
      GMAIL: null,
      X: null,
    });
    mockSubscriptionsList.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mockSubscriptionsDiscover.mockResolvedValue({ items: [], connectionRequired: true });
    mockNewslettersList.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mockNewslettersStats.mockResolvedValue({
      total: 0,
      active: 0,
      hidden: 0,
      unsubscribed: 0,
      lastSyncAt: null,
      lastSyncStatus: 'IDLE',
      lastSyncError: null,
    });
    mockRssList.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mockRssStats.mockResolvedValue({
      total: 0,
      active: 0,
      paused: 0,
      unsubscribed: 0,
      error: 0,
      lastSuccessAt: null,
    });
    mockXBookmarksStatus.mockResolvedValue({
      connected: false,
      connectionStatus: null,
      importedCount: 0,
      sync: null,
    });
    mockStartEditorialRun.mockResolvedValue({
      created: true,
      run: {
        id: 'run-1',
        editionDate: '2026-07-19',
        status: 'PREPARING',
        editionId: null,
      },
    });
    mockFailEditorialRun.mockResolvedValue({
      duplicate: false,
      run: {
        id: 'run-1',
        editionDate: '2026-07-19',
        status: 'FAILED',
        editionId: null,
      },
    });
    mockGetEditorialFeedbackProfile.mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-07-19T12:00:00.000Z',
      lookbackDays: 180,
      halfLifeDays: 60,
      maxEvents: 500,
      eventCount: 0,
      truncated: false,
      topics: [],
      creators: [],
      canonicalUrls: [],
      sourceIds: [],
    });
    mockListEditorialExperiments.mockResolvedValue([]);
    mockCreateEditorialExperiment.mockResolvedValue({
      experiment: editorialExperimentFixture(),
      created: true,
    });
    mockGetEditorialExperiment.mockResolvedValue(editorialExperimentFixture());
    mockUpdateEditorialExperiment.mockResolvedValue(editorialExperimentFixture());
    mockLockEditorialExperiment.mockResolvedValue(
      editorialExperimentFixture({ status: 'LOCKED', lockedAt: '2026-07-19T10:05:00.000Z' })
    );
    mockCreateCaller.mockReturnValue({
      items: {
        inbox: mockInbox,
        home: mockHome,
        library: mockLibrary,
        recentlyOpened: mockRecentlyOpened,
        quickWins: mockQuickWins,
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
      collections: {
        items: mockCollectionItems,
      },
      bookmarks: {
        preview: mockPreview,
        save: mockSave,
      },
      creators: {
        get: mockGetCreator,
        listBookmarks: mockCreatorBookmarks,
        fetchLatestContent: mockCreatorLatestContent,
      },
      subscriptions: {
        connections: {
          list: mockConnectionsList,
          registerState: mockConnectionsRegisterState,
          callback: mockConnectionsCallback,
          disconnect: mockConnectionsDisconnect,
        },
        list: mockSubscriptionsList,
        discover: { available: mockSubscriptionsDiscover },
        add: mockSubscriptionsAdd,
        remove: mockSubscriptionsRemove,
        pause: mockSubscriptionsPause,
        resume: mockSubscriptionsResume,
        syncNow: mockSubscriptionsSyncNow,
        newsletters: {
          list: mockNewslettersList,
          stats: mockNewslettersStats,
          updateStatus: mockNewslettersUpdateStatus,
          unsubscribe: mockNewslettersUnsubscribe,
          syncNow: mockNewslettersSyncNow,
        },
        rss: {
          list: mockRssList,
          stats: mockRssStats,
          add: mockRssAdd,
          remove: mockRssRemove,
          pause: mockRssPause,
          resume: mockRssResume,
          syncNow: mockRssSyncNow,
        },
        xBookmarks: {
          status: mockXBookmarksStatus,
          updateSettings: mockXBookmarksUpdateSettings,
          syncNow: mockXBookmarksSyncNow,
        },
      },
    });
  });

  it('serves an OpenAPI document without PAT auth', async () => {
    const app = createTestApp();

    const res = await app.fetch(new Request('http://localhost/api/v1/openapi.json'), {});

    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonBody;
    expect(body.openapi).toBe('3.1.0');
    expect(body.paths).toHaveProperty('/api/v1/home');
    expect(body.paths).toHaveProperty('/api/v1/inbox');
    expect(body.paths).toHaveProperty('/api/v1/inbox/{id}/bookmark');
    expect(body.paths).toHaveProperty('/api/v1/inbox/{id}/archive');
    expect(body.paths).toHaveProperty('/api/v1/creators/{creatorId}');
    expect(body.paths).toHaveProperty('/api/v1/creators/{creatorId}/bookmarks');
    expect(body.paths).toHaveProperty('/api/v1/creators/{creatorId}/latest-content');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/preview');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}/tags');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}/opened');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}/progress');
    expect(body.paths).toHaveProperty('/api/v1/bookmarks/{id}/article-content');
    expect(body.paths).toHaveProperty('/api/v1/tags');
    expect(body.paths).toHaveProperty('/api/v1/editorial/today');
    expect(body.paths).toHaveProperty('/api/v1/editorial/experiments');
    expect(body.paths).toHaveProperty('/api/v1/editorial/experiments/{id}');
    expect(body.paths).toHaveProperty('/api/v1/editorial/experiments/{id}/lock');
    expect(body.paths).toHaveProperty('/api/v1/editorial/experiments/{id}/failure');
    expect(body.paths).toHaveProperty('/api/v1/editorial/experiments/{id}/abandon');
    expect(body.paths).toHaveProperty('/api/v1/editorial/experiments/{id}/variants');
    expect(body.paths).toHaveProperty('/api/v1/editorial/experiments/{id}/variants/{variantId}');
    expect(body.paths).toHaveProperty('/api/v1/editorial/experiments/{id}/decision');
    expect(body.paths).toHaveProperty('/api/v1/editorial/experiments/{id}/promote');
    expect(body.paths).toHaveProperty('/api/v1/editorial/runs');
    expect(body.paths).toHaveProperty('/api/v1/editorial/runs/{id}/failure');
    expect(body.paths).toHaveProperty('/api/v1/editorial/feedback');
    expect(body.paths).toHaveProperty('/api/v1/editorial/feedback/profile');
    expect(body.paths).toHaveProperty('/api/v1/editorial/editions');
    expect(body.paths).toHaveProperty('/api/v1/editorial/editions/latest');
    expect(body.paths).toHaveProperty('/api/v1/editorial/editions/{id}');
    expect(body.paths).toHaveProperty('/api/v1/editorial/editions/{id}/artifacts/{artifact}');
    expect(body.paths).toHaveProperty('/api/v1/sync-jobs');
    expect(body.paths).toHaveProperty('/api/v1/sync-jobs/{jobId}');
    expect(body.paths).toHaveProperty('/api/v1/sync-jobs/active');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/youtube');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/youtube/connection');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/spotify');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/spotify/connection/callback');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/gmail');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/gmail/connection/callback');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/x');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/x/connection/callback');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/rss');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/youtube/connection/state');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/youtube/connection/callback');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/youtube/{subscriptionId}');
    expect(body.paths).toHaveProperty('/api/v1/subscriptions/youtube/{subscriptionId}/sync');
  });

  it('reads the bounded editorial tuning profile with read authentication', async () => {
    const app = createTestApp();
    mockDbToken(createTokenRecord(['bookmarks:read']));
    const res = await app.fetch(
      new Request('http://localhost/api/v1/editorial/feedback/profile', {
        headers: { Authorization: `Bearer ${READ_ONLY_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      profile: { eventCount: 0, lookbackDays: 180, maxEvents: 500 },
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
    expect(mockGetEditorialFeedbackProfile).toHaveBeenCalledWith(expect.anything(), 'user_123');
  });

  it('creates and resumes durable editorial experiments through REST', async () => {
    const app = createTestApp();
    const createBody = {
      id: 'experiment-1',
      title: 'Breadth versus engagement',
      editionDate: '2026-07-19',
      hypothesis: 'A broader portfolio will make Today more useful.',
      changeSummary: 'Reduce the influence of raw engagement.',
      desiredOutcomes: ['A non-technology story can lead.'],
      guardrails: ['Do not weaken source verification.'],
    };
    const created = await app.fetch(
      new Request('http://localhost/api/v1/editorial/experiments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createBody),
      }),
      createMockEnv()
    );

    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      created: true,
      experiment: { id: 'experiment-1', status: 'DRAFT' },
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
    expect(mockCreateEditorialExperiment).toHaveBeenCalledWith(
      expect.anything(),
      'user_123',
      createBody
    );

    mockListEditorialExperiments.mockResolvedValueOnce([editorialExperimentFixture()]);
    const resumed = await app.fetch(
      new Request('http://localhost/api/v1/editorial/experiments?limit=10', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({
      experiments: [{ id: 'experiment-1', nextAction: expect.any(String) }],
    });
    expect(mockListEditorialExperiments).toHaveBeenCalledWith(expect.anything(), 'user_123', 10);
  });

  it('requires write scope and validates experiment briefs', async () => {
    const app = createTestApp();
    mockDbToken(createTokenRecord(['bookmarks:read']));
    const forbidden = await app.fetch(
      new Request('http://localhost/api/v1/editorial/experiments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_ONLY_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
      createMockEnv()
    );
    expect(forbidden.status).toBe(403);

    mockDbToken(createTokenRecord(['bookmarks:write']));
    const invalid = await app.fetch(
      new Request('http://localhost/api/v1/editorial/experiments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Missing its durable identity and brief.' }),
      }),
      createMockEnv()
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: 'INVALID_REQUEST_BODY' });
  });

  it('starts an idempotent editorial run with write authentication', async () => {
    const app = createTestApp();
    const res = await app.fetch(
      new Request('http://localhost/api/v1/editorial/runs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'run-1',
          editionDate: '2026-07-19',
          workflowVersion: 'x-led-v1',
          promptVersion: 'daily-v1',
          model: 'gpt-5.6',
        }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      created: true,
      run: { id: 'run-1', status: 'PREPARING' },
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
    expect(mockStartEditorialRun).toHaveBeenCalledWith(
      expect.anything(),
      'user_123',
      expect.objectContaining({ id: 'run-1' })
    );
  });

  it('requires write scope and validates editorial run start bodies', async () => {
    const app = createTestApp();
    mockDbToken(createTokenRecord(['bookmarks:read']));
    const forbidden = await app.fetch(
      new Request('http://localhost/api/v1/editorial/runs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_ONLY_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
      createMockEnv()
    );
    expect(forbidden.status).toBe(403);

    mockDbToken(createTokenRecord(['bookmarks:write']));
    const invalid = await app.fetch(
      new Request('http://localhost/api/v1/editorial/runs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ editionDate: '2026-02-30' }),
      }),
      createMockEnv()
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      code: 'INVALID_REQUEST_BODY',
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
  });

  it('maps editorial run lifecycle conflicts and missing runs to stable errors', async () => {
    const app = createTestApp();
    mockStartEditorialRun.mockRejectedValueOnce(
      new EditorialRunConflictError('Run metadata differs')
    );
    const startConflict = await app.fetch(
      new Request('http://localhost/api/v1/editorial/runs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'run-1',
          editionDate: '2026-07-19',
          workflowVersion: 'x-led-v1',
          promptVersion: 'daily-v1',
          model: 'gpt-5.6',
        }),
      }),
      createMockEnv()
    );
    expect(startConflict.status).toBe(409);
    expect(await startConflict.json()).toMatchObject({
      code: 'EDITORIAL_RUN_CONFLICT',
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });

    mockFailEditorialRun.mockRejectedValueOnce(new EditorialRunNotFoundError('Run not found'));
    const missing = await app.fetch(
      new Request('http://localhost/api/v1/editorial/runs/missing/failure', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage: 'VALIDATE', message: 'Grounding failed.' }),
      }),
      createMockEnv()
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      code: 'NOT_FOUND',
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
    });
  });

  it('returns creator profile, bookmarks, and latest content for a Clerk session', async () => {
    const app = createTestApp();
    mockVerifyClerkRequestToken.mockResolvedValue({
      success: true,
      userId: 'user_123',
    });
    mockGetCreator.mockResolvedValue({
      id: 'creator_1',
      name: 'Creator One',
      imageUrl: null,
      provider: Provider.YOUTUBE,
      providerCreatorId: 'channel_1',
      description: 'Makes thoughtful videos.',
      handle: '@creatorone',
      externalUrl: 'https://youtube.com/@creatorone',
      createdAt: 1,
      updatedAt: 2,
    });
    mockCreatorBookmarks.mockResolvedValue({
      items: [{ id: 'ui_1', title: 'Saved video' }],
      nextCursor: 'next-page',
      hasMore: true,
    });
    mockCreatorLatestContent.mockResolvedValue({
      provider: Provider.YOUTUBE,
      items: [
        {
          id: 'video_1',
          title: 'A new video',
          description: null,
          thumbnailUrl: null,
          publishedAt: 1_752_797_600_000,
          externalUrl: 'https://youtube.com/watch?v=video_1',
          duration: 600,
          itemId: null,
          isBookmarked: false,
        },
      ],
      cacheStatus: 'MISS',
    });

    const headers = { Authorization: 'Bearer clerk-session-token' };
    const creator = await app.fetch(
      new Request('http://localhost/api/v1/creators/creator_1', { headers }),
      createMockEnv()
    );
    const bookmarks = await app.fetch(
      new Request(
        'http://localhost/api/v1/creators/creator_1/bookmarks?limit=20&cursor=page-1&isFinished=false',
        { headers }
      ),
      createMockEnv()
    );
    const latest = await app.fetch(
      new Request('http://localhost/api/v1/creators/creator_1/latest-content', { headers }),
      createMockEnv()
    );

    expect(creator.status).toBe(200);
    expect(bookmarks.status).toBe(200);
    expect(latest.status).toBe(200);
    expect(mockGetCreator).toHaveBeenCalledWith({ creatorId: 'creator_1' });
    expect(mockCreatorBookmarks).toHaveBeenCalledWith({
      creatorId: 'creator_1',
      limit: 20,
      cursor: 'page-1',
      isFinished: false,
    });
    expect(mockCreatorLatestContent).toHaveBeenCalledWith({ creatorId: 'creator_1' });
    expect(await bookmarks.json()).toMatchObject({ nextCursor: 'next-page' });
    expect(await latest.json()).toMatchObject({ provider: Provider.YOUTUBE });
  });

  it('lists current and available YouTube subscriptions for a Clerk session', async () => {
    mockConnectionsList.mockResolvedValue({
      YOUTUBE: {
        status: 'ACTIVE',
        providerUserId: 'youtube_user',
        connectedAt: 100,
        lastRefreshedAt: 200,
      },
    });
    mockSubscriptionsList.mockResolvedValue({
      items: [
        {
          id: 'sub_1',
          providerChannelId: 'channel_1',
          name: 'Subscribed Channel',
          imageUrl: 'https://example.com/subscribed.jpg',
          status: 'ACTIVE',
          lastPolledAt: 300,
        },
        {
          id: 'sub_old',
          providerChannelId: 'channel_old',
          name: 'Old Channel',
          imageUrl: null,
          status: 'UNSUBSCRIBED',
          lastPolledAt: null,
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    mockSubscriptionsDiscover.mockResolvedValue({
      items: [
        {
          id: 'channel_2',
          name: 'Available Channel',
          imageUrl: 'https://example.com/available.jpg',
          isSubscribed: false,
        },
      ],
      connectionRequired: false,
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/youtube', {
        headers: { Authorization: 'Bearer clerk-session-jwt' },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      connection: { status: 'ACTIVE', providerUserId: 'youtube_user' },
      connectionRequired: false,
      items: [
        { channelId: 'channel_2', isSubscribed: false },
        { subscriptionId: 'sub_1', channelId: 'channel_1', isSubscribed: true },
      ],
    });
    expect(mockSubscriptionsList).toHaveBeenCalledWith({
      provider: Provider.YOUTUBE,
      limit: 100,
      cursor: undefined,
    });
    expect(mockSubscriptionsDiscover).toHaveBeenCalledWith({ provider: Provider.YOUTUBE });
  });

  it('registers and completes a YouTube OAuth connection', async () => {
    mockConnectionsRegisterState.mockResolvedValue({ success: true });
    mockConnectionsCallback.mockResolvedValue({ success: true });
    const app = createTestApp();
    const state = `YOUTUBE:${'a'.repeat(36)}`;
    const headers = {
      Authorization: 'Bearer clerk-session-jwt',
      'Content-Type': 'application/json',
    };

    const stateResponse = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/youtube/connection/state', {
        method: 'POST',
        headers,
        body: JSON.stringify({ state }),
      }),
      createMockEnv()
    );
    const callbackResponse = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/youtube/connection/callback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code: 'authorization-code',
          state,
          codeVerifier: 'v'.repeat(43),
          redirectUri: 'com.googleusercontent.apps.test:/oauth2redirect',
        }),
      }),
      createMockEnv()
    );

    expect(stateResponse.status).toBe(200);
    expect(callbackResponse.status).toBe(200);
    expect(mockConnectionsRegisterState).toHaveBeenCalledWith({
      provider: Provider.YOUTUBE,
      state,
    });
    expect(mockConnectionsCallback).toHaveBeenCalledWith({
      provider: Provider.YOUTUBE,
      code: 'authorization-code',
      state,
      codeVerifier: 'v'.repeat(43),
      redirectUri: 'com.googleusercontent.apps.test:/oauth2redirect',
    });
  });

  it('disconnects YouTube without accepting a provider from the client', async () => {
    mockConnectionsDisconnect.mockResolvedValue({ success: true });
    const app = createTestApp();

    const response = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/youtube/connection', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer clerk-session-jwt' },
      }),
      createMockEnv()
    );

    expect(response.status).toBe(200);
    expect(mockConnectionsDisconnect).toHaveBeenCalledWith({ provider: Provider.YOUTUBE });
  });

  it('returns one subscription hub summary across all supported sources', async () => {
    mockConnectionsList.mockResolvedValue({
      YOUTUBE: { status: 'ACTIVE' },
      SPOTIFY: null,
      GMAIL: { status: 'EXPIRED' },
      X: { status: 'ACTIVE' },
    });
    mockSubscriptionsList.mockImplementation(async (input: { provider: Provider }) => ({
      items: input.provider === Provider.YOUTUBE ? [{ id: 'youtube-1' }] : [],
      nextCursor: null,
      hasMore: false,
    }));
    mockNewslettersStats.mockResolvedValue({ active: 3 });
    mockRssStats.mockResolvedValue({ active: 2 });
    mockXBookmarksStatus.mockResolvedValue({ importedCount: 7 });
    const app = createTestApp();

    const response = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions', {
        headers: { Authorization: 'Bearer clerk-session-jwt' },
      }),
      createMockEnv()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sources: [
        { provider: 'YOUTUBE', connectionStatus: 'ACTIVE', activeCount: 1 },
        { provider: 'SPOTIFY', connectionStatus: null, activeCount: 0 },
        { provider: 'GMAIL', connectionStatus: 'EXPIRED', activeCount: 3 },
        { provider: 'X', connectionStatus: 'ACTIVE', activeCount: 7 },
        { provider: 'RSS', connectionStatus: null, activeCount: 2 },
      ],
    });
  });

  it('registers, completes, and disconnects Spotify OAuth using a server-owned provider', async () => {
    mockConnectionsRegisterState.mockResolvedValue({ success: true });
    mockConnectionsCallback.mockResolvedValue({ success: true });
    mockConnectionsDisconnect.mockResolvedValue({ success: true });
    const app = createTestApp();
    const state = `SPOTIFY:${'a'.repeat(36)}`;
    const headers = {
      Authorization: 'Bearer clerk-session-jwt',
      'Content-Type': 'application/json',
    };

    const stateResponse = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/spotify/connection/state', {
        method: 'POST',
        headers,
        body: JSON.stringify({ state }),
      }),
      createMockEnv()
    );
    const callbackResponse = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/spotify/connection/callback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code: 'spotify-code',
          state,
          codeVerifier: 'v'.repeat(43),
          redirectUri: 'zine://oauth/callback',
        }),
      }),
      createMockEnv()
    );
    const disconnectResponse = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/spotify/connection', {
        method: 'DELETE',
        headers,
      }),
      createMockEnv()
    );

    expect(stateResponse.status).toBe(200);
    expect(callbackResponse.status).toBe(200);
    expect(disconnectResponse.status).toBe(200);
    expect(mockConnectionsRegisterState).toHaveBeenCalledWith({
      provider: Provider.SPOTIFY,
      state,
    });
    expect(mockConnectionsCallback).toHaveBeenCalledWith({
      provider: Provider.SPOTIFY,
      code: 'spotify-code',
      state,
      codeVerifier: 'v'.repeat(43),
      redirectUri: 'zine://oauth/callback',
    });
    expect(mockConnectionsDisconnect).toHaveBeenCalledWith({ provider: Provider.SPOTIFY });
  });

  it('manages Spotify shows through the shared subscription procedures', async () => {
    mockConnectionsList.mockResolvedValue({
      YOUTUBE: null,
      SPOTIFY: { status: 'ACTIVE', providerUserId: 'spotify-user' },
      GMAIL: null,
      X: null,
    });
    mockSubscriptionsDiscover.mockResolvedValue({
      items: [{ id: 'show-1', name: 'A Show', imageUrl: null }],
      connectionRequired: false,
    });
    mockSubscriptionsAdd.mockResolvedValue({ subscriptionId: 'sub-1' });
    const app = createTestApp();
    const auth = { Authorization: 'Bearer clerk-session-jwt' };

    const listResponse = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/spotify', { headers: auth }),
      createMockEnv()
    );
    const addResponse = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/spotify', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: 'show-1', name: 'A Show' }),
      }),
      createMockEnv()
    );

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      connection: { status: 'ACTIVE' },
      items: [{ channelId: 'show-1', isSubscribed: false }],
    });
    expect(addResponse.status).toBe(201);
    expect(mockSubscriptionsAdd).toHaveBeenCalledWith({
      provider: Provider.SPOTIFY,
      providerChannelId: 'show-1',
      name: 'A Show',
      imageUrl: undefined,
    });
  });

  it('manages Gmail newsletters through REST', async () => {
    mockNewslettersList.mockResolvedValue({
      items: [{ id: 'feed-1', displayName: 'Daily Letter', status: 'ACTIVE' }],
      nextCursor: null,
      hasMore: false,
    });
    mockNewslettersUpdateStatus.mockResolvedValue({ success: true });
    mockNewslettersUnsubscribe.mockResolvedValue({ success: true });
    mockNewslettersSyncNow.mockResolvedValue({ success: true });
    const app = createTestApp();
    const auth = { Authorization: 'Bearer clerk-session-jwt' };

    const list = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/gmail', { headers: auth }),
      createMockEnv()
    );
    const hide = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/gmail/feed-1', {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hide' }),
      }),
      createMockEnv()
    );
    const unsubscribe = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/gmail/feed-1', {
        method: 'DELETE',
        headers: auth,
      }),
      createMockEnv()
    );
    const sync = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/gmail/sync', {
        method: 'POST',
        headers: auth,
      }),
      createMockEnv()
    );

    expect([list.status, hide.status, unsubscribe.status, sync.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(mockNewslettersUpdateStatus).toHaveBeenCalledWith({
      feedId: 'feed-1',
      status: 'HIDDEN',
    });
    expect(mockNewslettersUnsubscribe).toHaveBeenCalledWith({ feedId: 'feed-1' });
    expect(mockNewslettersSyncNow).toHaveBeenCalled();
  });

  it('manages RSS feeds through REST', async () => {
    mockRssAdd.mockResolvedValue({ id: 'rss-1', created: true });
    mockRssPause.mockResolvedValue({ success: true });
    mockRssRemove.mockResolvedValue({ success: true });
    mockRssSyncNow.mockResolvedValue({ success: true, itemsFound: 2 });
    const app = createTestApp();
    const auth = { Authorization: 'Bearer clerk-session-jwt' };

    const add = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/rss', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl: 'https://example.com/feed.xml', seedMode: 'latest' }),
      }),
      createMockEnv()
    );
    const pause = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/rss/rss-1', {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      }),
      createMockEnv()
    );
    const sync = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/rss/rss-1/sync', {
        method: 'POST',
        headers: auth,
      }),
      createMockEnv()
    );
    const remove = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/rss/rss-1', {
        method: 'DELETE',
        headers: auth,
      }),
      createMockEnv()
    );

    expect([add.status, pause.status, sync.status, remove.status]).toEqual([201, 200, 200, 200]);
    expect(mockRssAdd).toHaveBeenCalledWith({
      feedUrl: 'https://example.com/feed.xml',
      seedMode: 'latest',
    });
    expect(mockRssPause).toHaveBeenCalledWith({ feedId: 'rss-1' });
    expect(mockRssSyncNow).toHaveBeenCalledWith({ feedId: 'rss-1' });
    expect(mockRssRemove).toHaveBeenCalledWith({ feedId: 'rss-1' });
  });

  it('manages X bookmark sync through REST', async () => {
    mockXBookmarksStatus.mockResolvedValue({
      connected: true,
      connectionStatus: 'ACTIVE',
      importedCount: 4,
      sync: { dailySyncEnabled: false },
    });
    mockXBookmarksUpdateSettings.mockResolvedValue({ success: true, dailySyncEnabled: true });
    mockXBookmarksSyncNow.mockResolvedValue({ success: true });
    const app = createTestApp();
    const auth = { Authorization: 'Bearer clerk-session-jwt' };

    const status = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/x', { headers: auth }),
      createMockEnv()
    );
    const update = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/x/settings', {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailySyncEnabled: true }),
      }),
      createMockEnv()
    );
    const sync = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/x/sync', {
        method: 'POST',
        headers: auth,
      }),
      createMockEnv()
    );

    expect([status.status, update.status, sync.status]).toEqual([200, 200, 200]);
    expect(mockXBookmarksUpdateSettings).toHaveBeenCalledWith({ dailySyncEnabled: true });
    expect(mockXBookmarksSyncNow).toHaveBeenCalled();
  });

  it('adds a YouTube subscription', async () => {
    mockSubscriptionsAdd.mockResolvedValue({ id: 'sub_1', status: 'ACTIVE' });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/youtube', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer clerk-session-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: 'channel_1',
          name: 'Channel One',
          imageUrl: 'https://example.com/channel.jpg',
        }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(201);
    expect(mockSubscriptionsAdd).toHaveBeenCalledWith({
      provider: Provider.YOUTUBE,
      providerChannelId: 'channel_1',
      name: 'Channel One',
      imageUrl: 'https://example.com/channel.jpg',
    });
  });

  it('explains when YouTube must be connected before adding a subscription', async () => {
    mockSubscriptionsAdd.mockRejectedValue(
      new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Not connected to YOUTUBE. Please connect your YOUTUBE account first.',
      })
    );
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/youtube', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer clerk-session-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId: 'channel_1' }),
      }),
      createMockEnv()
    );

    expect(res.status).toBe(412);
    expect(await res.json()).toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('pauses, resumes, removes, and syncs a YouTube subscription', async () => {
    mockSubscriptionsPause.mockResolvedValue({ success: true });
    mockSubscriptionsResume.mockResolvedValue({ success: true });
    mockSubscriptionsRemove.mockResolvedValue({ success: true });
    mockSubscriptionsSyncNow.mockResolvedValue({ success: true, itemsFound: 2 });
    const app = createTestApp();
    const request = (path: string, method: string, body?: unknown) =>
      app.fetch(
        new Request(`http://localhost${path}`, {
          method,
          headers: {
            Authorization: 'Bearer clerk-session-jwt',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
        createMockEnv()
      );

    expect(
      (await request('/api/v1/subscriptions/youtube/sub_1', 'PATCH', { action: 'pause' })).status
    ).toBe(200);
    expect(
      (await request('/api/v1/subscriptions/youtube/sub_1', 'PATCH', { action: 'resume' })).status
    ).toBe(200);
    expect((await request('/api/v1/subscriptions/youtube/sub_1', 'DELETE')).status).toBe(200);
    const sync = await request('/api/v1/subscriptions/youtube/sub_1/sync', 'POST');
    expect(sync.status).toBe(200);
    expect(await sync.json()).toMatchObject({ itemsFound: 2 });
    expect(mockSubscriptionsPause).toHaveBeenCalledWith({ subscriptionId: 'sub_1' });
    expect(mockSubscriptionsResume).toHaveBeenCalledWith({ subscriptionId: 'sub_1' });
    expect(mockSubscriptionsRemove).toHaveBeenCalledWith({ subscriptionId: 'sub_1' });
    expect(mockSubscriptionsSyncNow).toHaveBeenCalledWith({ subscriptionId: 'sub_1' });
  });

  it('returns a rate-limit response for repeated manual YouTube syncs', async () => {
    mockSubscriptionsSyncNow.mockRejectedValue(
      new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Please wait 5 minutes between manual syncs',
      })
    );
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/youtube/sub_1/sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer clerk-session-jwt' },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'RATE_LIMITED' });
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

  it('accepts a Clerk session token without looking up a personal access token', async () => {
    mockLibrary.mockResolvedValue({ items: [], nextCursor: null });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks', {
        headers: { Authorization: 'Bearer clerk-session-jwt' },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockVerifyClerkRequestToken).toHaveBeenCalledWith(
      'clerk-session-jwt',
      expect.objectContaining({ ENVIRONMENT: 'test' })
    );
    expect(mockCreateContext).toHaveBeenCalled();
    expect(mockCreateDb).not.toHaveBeenCalled();
  });

  it('returns the Clerk authentication error for an invalid session token', async () => {
    mockVerifyClerkRequestToken.mockResolvedValue({
      success: false,
      error: 'Token has expired',
      code: 'EXPIRED_TOKEN',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks', {
        headers: { Authorization: 'Bearer expired-clerk-session-jwt' },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(403);
    expect(res.headers.get('X-Zine-Auth-Error')).toBe('EXPIRED_TOKEN');
    expect((await res.json()) as JsonBody).toMatchObject({ code: 'EXPIRED_TOKEN' });
    expect(mockLibrary).not.toHaveBeenCalled();
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

  it('returns the ordered Home dashboard for the token owner', async () => {
    mockHome.mockResolvedValue({
      recentBookmarks: [{ id: 'ui_recent', title: 'Recent bookmark' }],
      jumpBackIn: [{ id: 'ui_opened', title: 'Opened bookmark' }],
      byContentType: {
        videos: [],
        podcasts: [],
        articles: [{ id: 'ui_recent', title: 'Recent bookmark' }],
      },
      customCollections: [],
      sectionOrder: [{ kind: 'BUILT_IN', builtInSection: 'JUMP_BACK_IN' }],
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/home', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockCreateCaller).toHaveBeenCalledWith({ userId: 'user_123' });
    expect(mockHome).toHaveBeenCalledWith({});
    expect((await res.json()) as JsonBody).toMatchObject({
      recentBookmarks: [{ title: 'Recent bookmark' }],
      jumpBackIn: [{ title: 'Opened bookmark' }],
      requestId: 'test-request-id',
      traceId: 'test-trace-id',
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

  it('lists opened bookmarks newest first through the history caller', async () => {
    mockRecentlyOpened.mockResolvedValue({
      items: [{ id: 'ui_opened', title: 'Opened bookmark' }],
      nextCursor: 'older-opened',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/opened?limit=20&cursor=opened-cursor', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockRecentlyOpened).toHaveBeenCalledWith({
      limit: 20,
      cursor: 'opened-cursor',
    });
    expect((await res.json()) as JsonBody).toMatchObject({
      items: [{ title: 'Opened bookmark' }],
      nextCursor: 'older-opened',
    });
  });

  it('lists quick-win bookmarks through the dedicated caller', async () => {
    mockQuickWins.mockResolvedValue({
      items: [{ id: 'ui_quick', title: 'Quick bookmark' }],
      nextCursor: 'more-quick',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/quick-wins?limit=20&cursor=quick-cursor', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockQuickWins).toHaveBeenCalledWith({
      limit: 20,
      cursor: 'quick-cursor',
    });
    expect((await res.json()) as JsonBody).toMatchObject({
      items: [{ title: 'Quick bookmark' }],
      nextCursor: 'more-quick',
    });
  });

  it('lists all items in a custom collection', async () => {
    mockCollectionItems.mockResolvedValue({
      items: [{ id: 'ui_collection', title: 'Collected bookmark' }],
      nextCursor: 'more-collection',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request(
        'http://localhost/api/v1/collections/collection_1/items?limit=20&cursor=collection-cursor',
        {
          headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
        }
      ),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockCollectionItems).toHaveBeenCalledWith({
      id: 'collection_1',
      limit: 20,
      cursor: 'collection-cursor',
    });
    expect((await res.json()) as JsonBody).toMatchObject({
      items: [{ title: 'Collected bookmark' }],
      nextCursor: 'more-collection',
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
    mockGetItem.mockResolvedValue({
      id: 'ui_inbox_1',
      itemId: 'item_1',
      contentType: 'ARTICLE',
    });
    mockBookmarkInboxItem.mockResolvedValue({ success: true });
    const app = createTestApp();
    const env = {
      ...createMockEnv(),
      ARTICLE_BODY_PIPELINE_ENABLED: 'true',
      ARTICLE_BODY_ENROLLMENT_MODE: 'saved',
    } as Env['Bindings'];

    const res = await app.fetch(
      new Request('http://localhost/api/v1/inbox/ui_inbox_1/bookmark', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      env
    );

    expect(res.status).toBe(200);
    expect(mockBookmarkInboxItem).toHaveBeenCalledWith({ id: 'ui_inbox_1' });
    expect(mockEnqueueArticleBody).toHaveBeenCalledWith(
      expect.anything(),
      env,
      expect.objectContaining({ itemId: 'item_1', trigger: 'bookmark' })
    );
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
    const env = {
      ...createMockEnv(),
      ARTICLE_BODY_PIPELINE_ENABLED: 'true',
      ARTICLE_BODY_ENROLLMENT_MODE: 'saved',
    } as Env['Bindings'];

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${READ_WRITE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: 'https://example.com/article', tags: ['Design', ' api '] }),
      }),
      env
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
    expect(mockEnqueueArticleBody).toHaveBeenCalledWith(
      expect.anything(),
      env,
      expect.objectContaining({ itemId: 'item_1', trigger: 'bookmark' })
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
      articleBody: {
        availability: 'AVAILABLE',
        pipelineStatus: 'LEGACY',
        sourceKind: 'LEGACY',
        qualityWarnings: ['LEGACY_UNNORMALIZED'],
      },
    });
  });

  it('reports unavailable when no article body has been requested or stored', async () => {
    mockGetItem.mockResolvedValue({ id: 'ui_1', itemId: 'item_1', title: 'Article' });
    mockGetArticleContent.mockResolvedValue({ content: null });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/article-content', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as JsonBody).toMatchObject({
      content: null,
      articleBody: {
        availability: 'UNAVAILABLE',
        pipelineStatus: 'NOT_REQUESTED',
      },
    });
  });

  it('idempotently requests article content for an eligible reader open', async () => {
    mockGetItem.mockResolvedValue({
      id: 'ui_1',
      itemId: 'item_1',
      title: 'Article',
      contentType: 'ARTICLE',
    });
    mockGetArticleContent.mockResolvedValue({ content: null });
    mockEnqueueArticleBody.mockResolvedValue({ queued: true });
    const app = createTestApp();
    const env = {
      ...createMockEnv(),
      ARTICLE_BODY_PIPELINE_ENABLED: 'true',
      ARTICLE_BODY_ENROLLMENT_MODE: 'reader',
    } as Env['Bindings'];

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/article-content', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      env
    );

    expect(res.status).toBe(202);
    expect(mockEnqueueArticleBody).toHaveBeenCalledWith(
      expect.anything(),
      env,
      expect.objectContaining({
        itemId: 'item_1',
        trigger: 'reader_open',
        traceId: 'test-trace-id',
      })
    );
    expect((await res.json()) as JsonBody).toMatchObject({
      content: null,
      articleBody: { availability: 'UNAVAILABLE', pipelineStatus: 'NOT_REQUESTED' },
      request: { queued: true },
    });
  });

  it('returns a terminal reader result without requeueing it', async () => {
    mockGetItem.mockResolvedValue({
      id: 'ui_1',
      itemId: 'item_1',
      title: 'Interactive page',
      contentType: 'ARTICLE',
    });
    mockGetArticleContent.mockResolvedValue({ content: null });
    mockEnqueueArticleBody.mockResolvedValue({ queued: false, reason: 'terminal' });
    mockGetArticleBodyStatus.mockResolvedValue({
      status: 'UNAVAILABLE',
      targetExtractorVersion: 1,
      attemptCount: 1,
      lastErrorCode: 'NOT_READERABLE',
      lastHttpStatus: 200,
      lastAttemptAt: 1700000000000,
      nextAttemptAt: null,
      updatedAt: 1700000000000,
      versionId: null,
      schemaVersion: null,
      extractorVersion: null,
      sourceKind: null,
      contentHash: null,
      r2Key: null,
      wordCount: null,
      readingTimeMinutes: null,
      qualityScore: null,
      qualityWarningsJson: null,
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/article-content', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      {
        ...createMockEnv(),
        ARTICLE_BODY_PIPELINE_ENABLED: 'true',
        ARTICLE_BODY_ENROLLMENT_MODE: 'reader',
      } as Env['Bindings']
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as JsonBody).toMatchObject({
      articleBody: {
        availability: 'UNAVAILABLE',
        pipelineStatus: 'UNAVAILABLE',
        lastErrorCode: 'NOT_READERABLE',
      },
      request: { queued: false, reason: 'terminal' },
    });
  });

  it('rejects reader requests for non-article content', async () => {
    mockGetItem.mockResolvedValue({
      id: 'ui_1',
      itemId: 'item_1',
      title: 'Video',
      contentType: 'VIDEO',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/article-content', {
        method: 'POST',
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      {
        ...createMockEnv(),
        ARTICLE_BODY_ENROLLMENT_MODE: 'reader',
      } as Env['Bindings']
    );

    expect(res.status).toBe(422);
    expect((await res.json()) as JsonBody).toMatchObject({
      code: 'ARTICLE_BODY_NOT_ELIGIBLE',
    });
    expect(mockEnqueueArticleBody).not.toHaveBeenCalled();
  });

  it('serves the current versioned artifact with its availability metadata', async () => {
    mockGetItem.mockResolvedValue({ id: 'ui_1', itemId: 'item_1', title: 'Article' });
    mockGetArticleContent.mockResolvedValue({ content: '<article>Legacy</article>' });
    mockGetArticleBodyStatus.mockResolvedValue({
      status: 'AVAILABLE',
      targetExtractorVersion: 1,
      attemptCount: 1,
      lastErrorCode: null,
      lastHttpStatus: 200,
      lastAttemptAt: 1700000000000,
      nextAttemptAt: null,
      updatedAt: 1700000000000,
      versionId: 'version_1',
      schemaVersion: 1,
      extractorVersion: 1,
      sourceKind: 'RSS_FULL',
      contentHash: `sha256:${'a'.repeat(64)}`,
      r2Key: 'articles/v2/item_1/hash.json',
      wordCount: 500,
      readingTimeMinutes: 3,
      qualityScore: 0.98,
      qualityWarningsJson: '[]',
    });
    mockGetArticleBodyArtifact.mockResolvedValue({
      sanitizedHtml: '<article>Versioned</article>',
    });
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/article-content', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(mockGetArticleBodyArtifact).toHaveBeenCalledWith(
      expect.anything(),
      'articles/v2/item_1/hash.json'
    );
    expect((await res.json()) as JsonBody).toMatchObject({
      content: '<article>Versioned</article>',
      articleBody: {
        availability: 'AVAILABLE',
        pipelineStatus: 'AVAILABLE',
        sourceKind: 'RSS_FULL',
        wordCount: 500,
      },
    });
  });

  it('serves legacy content as degraded when the current immutable artifact is missing', async () => {
    mockGetItem.mockResolvedValue({ id: 'ui_1', itemId: 'item_1', title: 'Article' });
    mockGetArticleContent.mockResolvedValue({ content: '<article>Legacy fallback</article>' });
    mockGetArticleBodyStatus.mockResolvedValue({
      status: 'AVAILABLE',
      targetExtractorVersion: 1,
      attemptCount: 1,
      lastErrorCode: null,
      lastHttpStatus: 200,
      lastAttemptAt: 1700000000000,
      nextAttemptAt: null,
      updatedAt: 1700000000000,
      versionId: 'version_1',
      schemaVersion: 1,
      extractorVersion: 1,
      sourceKind: 'PUBLIC_WEB',
      contentHash: `sha256:${'b'.repeat(64)}`,
      r2Key: 'articles/v2/item_1/missing.json',
      wordCount: 100,
      readingTimeMinutes: 1,
      qualityScore: 0.9,
      qualityWarningsJson: '[]',
    });
    mockGetArticleBodyArtifact.mockResolvedValue(null);
    const app = createTestApp();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/bookmarks/ui_1/article-content', {
        headers: { Authorization: `Bearer ${READ_WRITE_TOKEN}` },
      }),
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as JsonBody).toMatchObject({
      content: '<article>Legacy fallback</article>',
      articleBody: {
        availability: 'DEGRADED',
        pipelineStatus: 'AVAILABLE',
        sourceKind: 'LEGACY',
        lastErrorCode: 'ARTIFACT_MISSING',
        qualityWarnings: ['MISSING_CURRENT_VERSION', 'CURRENT_ARTIFACT_MISSING_FALLBACK_LEGACY'],
      },
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
