/**
 * Tests for Gmail newsletters router behavior.
 *
 * @vitest-environment miniflare
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockEnv } from '../test-utils';
import { newslettersRouter } from './newsletters';

const { mockSyncGmailNewslettersForUser, mockSeedLatestNewsletterItemForFeed } = vi.hoisted(() => ({
  mockSyncGmailNewslettersForUser: vi.fn(),
  mockSeedLatestNewsletterItemForFeed: vi.fn(),
}));

vi.mock('../../newsletters/gmail', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    syncGmailNewslettersForUser: (...args: unknown[]) => mockSyncGmailNewslettersForUser(...args),
    seedLatestNewsletterItemForFeed: (...args: unknown[]) =>
      mockSeedLatestNewsletterItemForFeed(...args),
  };
});

function createMockCtx(userId: string | null = 'user_test_123') {
  const mockProviderConnectionsFindFirst = vi.fn();
  const mockGmailMailboxesFindMany = vi.fn();
  const mockNewsletterFeedsFindMany = vi.fn();
  const mockNewsletterFeedMessagesFindMany = vi.fn();
  const mockItemsFindMany = vi.fn();

  return {
    userId,
    env: createMockEnv(),
    db: {
      query: {
        providerConnections: {
          findFirst: mockProviderConnectionsFindFirst,
        },
        gmailMailboxes: {
          findMany: mockGmailMailboxesFindMany,
        },
        newsletterFeeds: {
          findMany: mockNewsletterFeedsFindMany,
        },
        newsletterFeedMessages: {
          findMany: mockNewsletterFeedMessagesFindMany,
        },
        items: {
          findMany: mockItemsFindMany,
        },
      },
    },
    mocks: {
      mockProviderConnectionsFindFirst,
      mockGmailMailboxesFindMany,
      mockNewsletterFeedsFindMany,
      mockNewsletterFeedMessagesFindMany,
      mockItemsFindMany,
    },
  };
}

describe('newslettersRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns branded newsletters with strong list headers', async () => {
    const ctx = createMockCtx();
    const caller = newslettersRouter.createCaller(ctx as never);

    ctx.mocks.mockProviderConnectionsFindFirst.mockResolvedValue({
      id: 'conn_1',
      status: 'ACTIVE',
    });
    ctx.mocks.mockGmailMailboxesFindMany.mockResolvedValue([
      {
        id: 'mailbox_1',
        lastSyncAt: null,
        lastSyncStatus: 'SUCCESS',
        lastSyncError: null,
        updatedAt: Date.now(),
      },
    ]);
    ctx.mocks.mockNewsletterFeedsFindMany.mockResolvedValue([
      {
        id: 'feed_stratechery',
        gmailMailboxId: 'mailbox_1',
        userId: 'user_test_123',
        displayName: 'Stratechery',
        fromAddress: 'email@stratechery.com',
        listId: null,
        unsubscribeMailto: null,
        unsubscribeUrl:
          'https://stratechery.passport.online/api/1.0.0/users/test/channelOptOut?channel=email',
        status: 'HIDDEN',
        detectionScore: 0.83,
        lastSeenAt: Date.now(),
        firstSeenAt: Date.now(),
      },
      {
        id: 'feed_github',
        gmailMailboxId: 'mailbox_1',
        userId: 'user_test_123',
        displayName: 'GitHub Notifications',
        fromAddress: 'notifications@github.com',
        listId: '<repo.github.com>',
        unsubscribeMailto: null,
        unsubscribeUrl: 'https://github.com/notifications/unsubscribe',
        status: 'HIDDEN',
        detectionScore: 0.83,
        lastSeenAt: Date.now(),
        firstSeenAt: Date.now(),
      },
    ]);
    ctx.mocks.mockNewsletterFeedMessagesFindMany.mockResolvedValue([]);

    const result = await caller.list({ limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'feed_stratechery',
      displayName: 'Stratechery',
      fromAddress: 'email@stratechery.com',
    });
    expect(ctx.mocks.mockItemsFindMany).not.toHaveBeenCalled();
  });
});
