import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDependencyHealth, getQueueHealth } from './health';

const { getDLQSummary, getArticleBodyHealth } = vi.hoisted(() => ({
  getDLQSummary: vi.fn(),
  getArticleBodyHealth: vi.fn(),
}));

vi.mock('../sync/dlq-consumer', () => ({
  getDLQSummary,
}));

vi.mock('../article-body/diagnostics', () => ({
  getArticleBodyHealth,
}));

describe('getDependencyHealth', () => {
  it('reports dependency status for DB and KV', async () => {
    const result = await getDependencyHealth({
      DB: {
        prepare: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ ok: 1 }),
        }),
      },
      OAUTH_STATE_KV: {
        get: vi.fn().mockResolvedValue(null),
      },
    } as never);

    expect(result.status).toBe('ok');
    expect(result.dependencies.database.status).toBe('ok');
    expect(result.dependencies.oauthStateKv.status).toBe('ok');
  });
});

describe('getQueueHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getArticleBodyHealth.mockResolvedValue({
      status: 'ok',
      enabled: false,
      configured: true,
      states: {
        PENDING: 0,
        PROCESSING: 0,
        AVAILABLE: 10,
        DEGRADED: 1,
        UNAVAILABLE: 2,
      },
      dlqCount: 0,
    });
  });

  it('returns safe DLQ summaries without correlation identifiers', async () => {
    getDLQSummary.mockResolvedValue({
      count: 1,
      oldestAt: 1705320000000,
      newestAt: 1705320000000,
      recent: [
        {
          id: 'entry_1',
          deadLetteredAt: 1705320000000,
          attempts: 3,
          environment: 'development',
          message: {
            jobId: 'job_1',
            userId: 'user_1',
            subscriptionId: 'sub_1',
            provider: 'YOUTUBE',
            providerChannelId: 'channel_1',
            enqueuedAt: 1705319990000,
            meta: {
              traceId: 'trc_1',
              requestId: 'req_1',
              source: 'subscriptions.syncAllAsync',
              enqueuedAt: 1705319990000,
              release: {
                version: '0.0.1',
                channel: 'development',
              },
            },
          },
        },
      ],
    });

    const result = await getQueueHealth({
      OAUTH_STATE_KV: {},
      SYNC_QUEUE: {},
    } as never);

    expect(result.status).toBe('degraded');
    expect(result.queues.dlq.recent).toEqual([
      {
        deadLetteredAt: 1705320000000,
        attempts: 3,
        provider: 'YOUTUBE',
        release: {
          version: '0.0.1',
          channel: 'development',
        },
      },
    ]);
    expect(result.queues.articleBody).toMatchObject({
      enabled: false,
      configured: true,
      states: { AVAILABLE: 10, DEGRADED: 1, UNAVAILABLE: 2 },
      dlqCount: 0,
    });
  });

  it('degrades when article-body DLQ events exist', async () => {
    getDLQSummary.mockResolvedValue({
      count: 0,
      oldestAt: null,
      newestAt: null,
      recent: [],
    });
    getArticleBodyHealth.mockResolvedValue({
      status: 'ok',
      enabled: false,
      configured: true,
      states: {},
      dlqCount: 1,
    });

    const result = await getQueueHealth({ OAUTH_STATE_KV: {} } as never);

    expect(result.status).toBe('degraded');
  });
});
