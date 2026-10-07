import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from '../db';
import { users, subscriptions, userItems, providerItemsSeen } from '../db/schema';
import { pollSingleYouTubeSubscription } from './youtube-poller';
import type { YouTubeClient } from '../providers/youtube';
import type { Bindings } from '../types';

vi.mock('googleapis', () => ({ google: {} }));
const bindings = env as unknown as Bindings & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};
const db = createDb(bindings.DB);
const now = Date.parse('2026-10-07T23:00:00Z');
const iso = new Date(now).toISOString();
beforeEach(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  await db.insert(users).values({ id: 'recovery-user', createdAt: iso, updatedAt: iso });
  await db.insert(subscriptions).values({
    id: 'recovery-sub',
    userId: 'recovery-user',
    provider: 'YOUTUBE',
    providerChannelId: 'UCchannel',
    createdAt: now - 30 * 86400000,
    updatedAt: now,
    lastPolledAt: now - 3600000,
  });
});
describe('overlap ingestion with real D1', () => {
  it.each(['INBOX', 'BOOKMARKED', 'ARCHIVED'])(
    'preserves %s state, timestamps and progress across repeated polls',
    async (state) => {
      const originalNow = Date.now;
      Date.now = () => now;
      try {
        const client = {
          api: {
            playlistItems: {
              list: async () => ({
                data: {
                  items: [
                    {
                      contentDetails: {
                        videoId: 'late-video',
                        videoPublishedAt: '2026-10-06T17:00:31Z',
                      },
                      snippet: {
                        title: 'Late episode',
                        channelId: 'UCchannel',
                        channelTitle: 'Channel',
                        publishedAt: '2026-10-01T10:00:00Z',
                      },
                    },
                  ],
                },
              }),
            },
            videos: {
              list: async () => ({
                data: {
                  items: [
                    {
                      id: 'late-video',
                      contentDetails: { duration: 'PT2H' },
                      snippet: { publishedAt: '2026-10-06T17:00:31Z' },
                    },
                  ],
                },
              }),
            },
          },
        } as unknown as YouTubeClient;
        const sub = (await db.query.subscriptions.findFirst({
          where: eq(subscriptions.id, 'recovery-sub'),
        }))!;
        expect(
          (await pollSingleYouTubeSubscription(sub, client, sub.userId, bindings, db)).newItems
        ).toBe(1);
        await db
          .update(userItems)
          .set({
            state,
            bookmarkedAt: state === 'BOOKMARKED' ? iso : null,
            archivedAt: state === 'ARCHIVED' ? iso : null,
            progressPosition: 123,
            isFinished: true,
          })
          .where(eq(userItems.userId, sub.userId));
        const before = await db.select().from(userItems);
        expect(
          (await pollSingleYouTubeSubscription(sub, client, sub.userId, bindings, db)).newItems
        ).toBe(0);
        expect(await db.select().from(userItems)).toEqual(before);
        expect(await db.select().from(providerItemsSeen)).toHaveLength(1);
      } finally {
        Date.now = originalNow;
      }
    }
  );
});
