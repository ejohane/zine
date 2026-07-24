import { describe, expect, it, vi } from 'vitest';

import { getArticleBodyHealth } from './diagnostics';

describe('article-body diagnostics', () => {
  it('returns aggregate lifecycle and DLQ counts without item identifiers', async () => {
    const all = vi.fn().mockResolvedValue({
      results: [
        { status: 'AVAILABLE', count: 12 },
        { status: 'UNAVAILABLE', count: 2 },
        { status: 'UNKNOWN', count: 99 },
      ],
    });
    const first = vi.fn().mockResolvedValue({ count: 1 });
    const prepare = vi.fn().mockReturnValueOnce({ all }).mockReturnValueOnce({ first });

    const result = await getArticleBodyHealth({
      DB: { prepare },
      ARTICLE_BODY_QUEUE: {},
      ARTICLE_BODY_PIPELINE_ENABLED: 'false',
    } as never);

    expect(result).toEqual({
      status: 'ok',
      enabled: false,
      configured: true,
      states: {
        PENDING: 0,
        PROCESSING: 0,
        AVAILABLE: 12,
        DEGRADED: 0,
        UNAVAILABLE: 2,
      },
      dlqCount: 1,
    });
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
