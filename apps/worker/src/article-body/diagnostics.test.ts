import { describe, expect, it, vi } from 'vitest';

import { getArticleBodyHealth } from './diagnostics';

describe('article-body diagnostics', () => {
  it('returns aggregate lifecycle and DLQ counts without item identifiers', async () => {
    const statesAll = vi.fn().mockResolvedValue({
      results: [
        { status: 'AVAILABLE', count: 12 },
        { status: 'UNAVAILABLE', count: 2 },
        { status: 'UNKNOWN', count: 99 },
      ],
    });
    const triggerAll = vi.fn().mockResolvedValue({
      results: [{ trigger: 'reader_open', status: 'AVAILABLE', count: 4 }],
    });
    const sourceAll = vi.fn().mockResolvedValue({
      results: [{ sourceKind: 'PUBLIC_WEB', count: 9 }],
    });
    const failureAll = vi.fn().mockResolvedValue({
      results: [{ code: 'NOT_READERABLE', count: 1 }],
    });
    const prepare = vi
      .fn()
      .mockReturnValueOnce({ all: statesAll })
      .mockReturnValueOnce({ first: vi.fn().mockResolvedValue({ count: 1 }) })
      .mockReturnValueOnce({ first: vi.fn().mockResolvedValue({ timestamp: 1_700_000_000_000 }) })
      .mockReturnValueOnce({
        first: vi.fn().mockResolvedValue({ count: 4, average: 1234.4, maximum: 3000 }),
      })
      .mockReturnValueOnce({ all: triggerAll })
      .mockReturnValueOnce({ all: sourceAll })
      .mockReturnValueOnce({ all: failureAll });

    const result = await getArticleBodyHealth({
      DB: { prepare },
      ARTICLE_BODY_QUEUE: {},
      ARTICLE_BODY_PIPELINE_ENABLED: 'false',
      ARTICLE_BODY_ENROLLMENT_MODE: 'reader',
    } as never);

    expect(result).toEqual({
      status: 'ok',
      enabled: false,
      enrollmentMode: 'reader',
      configured: true,
      states: {
        PENDING: 0,
        PROCESSING: 0,
        AVAILABLE: 12,
        DEGRADED: 0,
        UNAVAILABLE: 2,
      },
      oldestPendingAt: '2023-11-14T22:13:20.000Z',
      terminalLatencyMs: { sampleCount: 4, average: 1234, maximum: 3000 },
      outcomesByTrigger: { reader_open: { AVAILABLE: 4 } },
      sourceKinds: { PUBLIC_WEB: 9 },
      failureCodes: [{ code: 'NOT_READERABLE', count: 1 }],
      dlqCount: 1,
    });
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      'SELECT COUNT(*) AS count FROM article_body_dlq_events WHERE resolved_at IS NULL'
    );
    expect(JSON.stringify(result)).not.toContain('item_');
  });

  it('reports migration or query failures without throwing the health route', async () => {
    const prepare = vi.fn().mockReturnValue({
      all: vi.fn().mockRejectedValue(new Error('no such table')),
      first: vi.fn().mockRejectedValue(new Error('no such table')),
    });

    await expect(getArticleBodyHealth({ DB: { prepare } } as never)).resolves.toMatchObject({
      status: 'error',
      enabled: false,
      configured: false,
      error: 'no such table',
    });
  });
});
