import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENRICHMENT_SCHEMA_VERSION } from '../enrichment/types';
import { computeItemContentHash } from '../enrichment/service';
import { backfillBookmarkEnrichment } from './enrichment-backfill';

const rows = [
  {
    user_item_id: 'ui_001',
    user_id: 'user_001',
    item_id: 'item_001',
    title: 'First bookmark',
    canonical_url: 'https://example.com/first',
    content_type: 'ARTICLE',
    provider: 'WEB',
    publisher: 'Example',
    summary: 'A useful article',
    article_content_key: 'articles/item_001.html',
    creator_name: 'Example Author',
  },
  {
    user_item_id: 'ui_002',
    user_id: 'user_001',
    item_id: 'item_002',
    title: 'Second bookmark',
    canonical_url: 'https://example.com/second',
    content_type: 'VIDEO',
    provider: 'YOUTUBE',
    publisher: null,
    summary: null,
    article_content_key: null,
    creator_name: 'Video Creator',
  },
];

function createEnv(resultRows = rows) {
  const all = vi.fn().mockResolvedValue({ results: resultRows });
  const bind = vi.fn().mockReturnValue({ all });
  const prepare = vi.fn().mockReturnValue({ bind });
  const send = vi.fn().mockResolvedValue(undefined);

  return {
    env: {
      DB: { prepare },
      ENRICHMENT_QUEUE: { send },
    },
    prepare,
    bind,
    all,
    send,
  };
}

describe('backfillBookmarkEnrichment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns candidates without enqueueing in dry-run mode', async () => {
    const { env, send } = createEnv();

    const result = await backfillBookmarkEnrichment(env as never, { dryRun: true, limit: 2 });

    expect(result).toMatchObject({
      dryRun: true,
      schemaVersion: ENRICHMENT_SCHEMA_VERSION,
      limit: 2,
      cursor: null,
      nextCursor: 'ui_002',
      scanned: 2,
      enqueued: 0,
    });
    expect(result.candidates).toHaveLength(2);
    expect(send).not.toHaveBeenCalled();
  });

  it('enqueues backfill messages with stable content hashes', async () => {
    const { env, send } = createEnv([rows[0]]);

    const result = await backfillBookmarkEnrichment(env as never, {
      dryRun: false,
      limit: 25,
    });

    expect(result.enqueued).toBe(1);
    expect(send).toHaveBeenCalledWith({
      itemId: 'item_001',
      userItemId: 'ui_001',
      userId: 'user_001',
      trigger: 'backfill',
      schemaVersion: ENRICHMENT_SCHEMA_VERSION,
      contentHash: computeItemContentHash({
        title: 'First bookmark',
        canonicalUrl: 'https://example.com/first',
        contentType: 'ARTICLE',
        provider: 'WEB',
        publisher: 'Example',
        summary: 'A useful article',
        creatorName: 'Example Author',
        articleContentKey: 'articles/item_001.html',
      }),
      enqueuedAt: Date.now(),
    });
  });

  it('passes the cursor into the paged query', async () => {
    const { env, bind } = createEnv([]);

    await backfillBookmarkEnrichment(env as never, {
      dryRun: true,
      limit: 10,
      cursor: 'ui_099',
    });

    expect(bind).toHaveBeenCalledWith(ENRICHMENT_SCHEMA_VERSION, 'ui_099', 10);
  });

  it('only excludes complete enrichment rows so failed rows can be retried', async () => {
    const { env, prepare } = createEnv([]);

    await backfillBookmarkEnrichment(env as never, { dryRun: true });

    expect(prepare.mock.calls[0][0]).toContain("AND uie.status = 'COMPLETE'");
  });
});
