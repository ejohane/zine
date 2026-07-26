import { describe, expect, it, vi } from 'vitest';
import { Provider } from '@zine/shared';
import { getItemSubscriptionSettings } from './items';

function queryReturning(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

function contextWithResults(...results: unknown[][]) {
  const queries = results.map(queryReturning);
  return {
    context: {
      userId: 'user_1',
      db: {
        select: vi.fn().mockImplementation(() => queries.shift()),
      },
    },
  };
}

describe('getItemSubscriptionSettings', () => {
  it('resolves provider subscriptions from their item mapping', async () => {
    const { context } = contextWithResults(
      [{ itemId: 'item_1', provider: Provider.YOUTUBE }],
      [{ sourceId: 'sub_1', provider: Provider.YOUTUBE, autoBookmark: true }]
    );

    await expect(getItemSubscriptionSettings(context as never, 'bookmark_1')).resolves.toEqual({
      sourceId: 'sub_1',
      provider: Provider.YOUTUBE,
      autoBookmark: true,
    });
  });

  it('resolves newsletter and RSS feed settings', async () => {
    const newsletter = contextWithResults(
      [{ itemId: 'item_2', provider: Provider.GMAIL }],
      [{ sourceId: 'newsletter_1', autoBookmark: false }]
    );
    const rss = contextWithResults(
      [{ itemId: 'item_3', provider: Provider.RSS }],
      [{ sourceId: 'rss_1', autoBookmark: true }]
    );

    await expect(
      getItemSubscriptionSettings(newsletter.context as never, 'bookmark_2')
    ).resolves.toEqual({
      sourceId: 'newsletter_1',
      provider: Provider.GMAIL,
      autoBookmark: false,
    });
    await expect(getItemSubscriptionSettings(rss.context as never, 'bookmark_3')).resolves.toEqual({
      sourceId: 'rss_1',
      provider: Provider.RSS,
      autoBookmark: true,
    });
  });

  it('returns no setting for an item without a managed subscription source', async () => {
    const { context } = contextWithResults([{ itemId: 'item_4', provider: Provider.X }]);

    await expect(getItemSubscriptionSettings(context as never, 'bookmark_4')).resolves.toBeNull();
  });
});
