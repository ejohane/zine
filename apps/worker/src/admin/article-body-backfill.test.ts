import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createDb, enqueueArticleBody } = vi.hoisted(() => ({
  createDb: vi.fn(),
  enqueueArticleBody: vi.fn(),
}));

vi.mock('../db', () => ({ createDb }));
vi.mock('../article-body/service', () => ({ enqueueArticleBody }));

import { backfillArticleBodies } from './article-body-backfill';

const rows = [
  {
    item_id: 'item_001',
    provider: 'RSS',
    pipeline_status: null,
    extractor_version: null,
  },
  {
    item_id: 'item_002',
    provider: 'WEB',
    pipeline_status: 'UNAVAILABLE',
    extractor_version: null,
  },
];

function createEnv(resultRows = rows) {
  const all = vi.fn().mockResolvedValue({ results: resultRows });
  const bind = vi.fn().mockReturnValue({ all });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    env: { DB: { prepare }, ARTICLE_BODY_PIPELINE_ENABLED: 'false' },
    prepare,
    bind,
  };
}

describe('article-body backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createDb.mockReturnValue({});
  });

  it('is dry-run-first and returns a bounded canonical-item cohort', async () => {
    const { env } = createEnv();
    const result = await backfillArticleBodies(env as never, { limit: 2 });

    expect(result).toMatchObject({
      dryRun: true,
      extractorVersion: 1,
      limit: 2,
      nextCursor: 'item_002',
      scanned: 2,
      enqueued: 0,
      skipped: 0,
    });
    expect(enqueueArticleBody).not.toHaveBeenCalled();
  });

  it('routes execution through the guarded idempotent enqueue service', async () => {
    const { env } = createEnv([rows[0]]);
    enqueueArticleBody.mockResolvedValue({ queued: false, reason: 'disabled' });

    const result = await backfillArticleBodies(env as never, {
      dryRun: false,
      traceId: 'trace_1',
    });

    expect(enqueueArticleBody).toHaveBeenCalledWith(
      expect.anything(),
      env,
      expect.objectContaining({ itemId: 'item_001', trigger: 'backfill', traceId: 'trace_1' })
    );
    expect(result).toMatchObject({
      enqueued: 0,
      skipped: 1,
      skipReasons: { disabled: 1 },
    });
  });

  it('paginates by canonical item id and selects only eligible non-current items', async () => {
    const { env, bind, prepare } = createEnv([]);
    await backfillArticleBodies(env as never, { cursor: 'item_099', limit: 7 });

    expect(bind).toHaveBeenCalledWith(1, 'item_099', 7);
    const query = prepare.mock.calls[0][0] as string;
    expect(query).toContain("i.content_type = 'ARTICLE'");
    expect(query).toContain("abs.status NOT IN ('PENDING', 'PROCESSING')");
    expect(query).toContain('EXISTS (SELECT 1 FROM user_items');
  });
});
