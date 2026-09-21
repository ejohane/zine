import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../../db';
import { items, userItems, rssFeeds, rssFeedItems } from '../../db/schema';
import { resolvePlayerDestination } from '../../rss/player-destinations';
import type { Env } from '../../types';
import { apiAuth } from './auth';

const routes = new Hono<Env>();
const playerSchema = z.enum(['OVERCAST', 'APPLE_PODCASTS', 'POCKET_CASTS']);
const metadataSchema = z.object({
  audioUrl: z.string().optional().nullable(),
  rawGuid: z.string().optional().nullable(),
});
routes.get('/bookmarks/:id/podcast-destination', apiAuth('bookmarks:read'), async (c) => {
  const player = playerSchema.safeParse(c.req.query('player'));
  if (!player.success)
    return c.json({ error: 'Choose a supported podcast app', code: 'INVALID_PLAYER' }, 400);
  const db = createDb(c.env.DB);
  const [bookmark] = await db
    .select({
      itemId: items.id,
      contentType: items.contentType,
      originalUrl: userItems.handoffUrl,
      publisherUrl: items.canonicalUrl,
      metadata: items.rawMetadata,
    })
    .from(userItems)
    .innerJoin(items, eq(items.id, userItems.itemId))
    .where(and(eq(userItems.id, c.req.param('id')), eq(userItems.userId, c.get('userId')!)))
    .limit(1);
  if (!bookmark) return c.json({ error: 'Bookmark not found', code: 'NOT_FOUND' }, 404);
  if (bookmark.contentType !== 'PODCAST')
    return c.json({ error: 'Not a podcast', code: 'INVALID_CONTENT_TYPE' }, 422);
  const [feed] = await db
    .select({ feedUrl: rssFeeds.feedUrl, showName: rssFeeds.title, sourceUrl: rssFeeds.sourceUrl })
    .from(rssFeedItems)
    .innerJoin(rssFeeds, eq(rssFeeds.id, rssFeedItems.rssFeedId))
    .where(
      and(
        eq(rssFeedItems.itemId, bookmark.itemId),
        eq(rssFeeds.userId, c.get('userId')!),
        eq(rssFeeds.feedType, 'PODCAST')
      )
    )
    .limit(1);
  let metadata: z.infer<typeof metadataSchema> = {};
  try {
    metadata = metadataSchema.parse(JSON.parse(bookmark.metadata ?? '{}'));
  } catch {
    /* Older items may not carry RSS metadata. */
  }
  const result = feed
    ? await resolvePlayerDestination(
        player.data,
        {
          feedUrl: feed.feedUrl,
          showName: feed.showName ?? '',
          sourceUrl: feed.sourceUrl,
          audioUrl: metadata.audioUrl ?? null,
          rawGuid: metadata.rawGuid ?? null,
        },
        c.env.CREATOR_CONTENT_CACHE
      )
    : { destination: null, temporarilyUnavailable: false };
  return c.json({
    ...result,
    originalUrl: bookmark.originalUrl,
    publisherUrl: bookmark.publisherUrl,
  });
});
export default routes;
