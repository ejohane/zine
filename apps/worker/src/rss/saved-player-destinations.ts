import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { readState } from './player-destination-data';
import { createDb, type Database } from '../db';
import { items, rssFeedItems, rssFeeds } from '../db/schema';
import { logger } from '../lib/logger';
import type { Bindings } from '../types';
import { resolvePlayerDestination } from './player-destinations';

const players = ['OVERCAST', 'APPLE_PODCASTS', 'POCKET_CASTS'] as const;
// This runs in background enrichment only. Bookmark reads never contact directories.
export async function enrichPodcastDestinations(
  db: Database,
  env: Bindings,
  itemId: string,
  now = Date.now()
) {
  const item = await db.query.items.findFirst({ where: eq(items.id, itemId) });
  if (!item || item.provider !== 'RSS' || item.contentType !== 'PODCAST') return;
  const previous = readState(item.podcastDestinations);
  if (previous && (previous.nextAttemptAt === null || previous.nextAttemptAt > now)) return;
  const [feed] = await db
    .select({ feedUrl: rssFeeds.feedUrl, showName: rssFeeds.title, sourceUrl: rssFeeds.sourceUrl })
    .from(rssFeedItems)
    .innerJoin(rssFeeds, eq(rssFeeds.id, rssFeedItems.rssFeedId))
    .where(and(eq(rssFeedItems.itemId, itemId), eq(rssFeeds.feedType, 'PODCAST')))
    .limit(1);
  // A missing mapping can be transient during ingestion; the next scheduled pass retries it.
  if (!feed) return;
  let metadata: { audioUrl?: string | null; rawGuid?: string | null } = {};
  try {
    metadata = z
      .object({ audioUrl: z.string().nullish(), rawGuid: z.string().nullish() })
      .parse(JSON.parse(item.rawMetadata ?? '{}'));
  } catch {
    /* legacy metadata */
  }
  const destinations = previous?.destinations ?? {};
  const pending = players.filter(
    (player) =>
      !destinations[player] || (player !== 'OVERCAST' && destinations[player]?.kind !== 'episode')
  );
  await Promise.all(
    pending.map(async (player) => {
      try {
        const resolved = await resolvePlayerDestination(
          player,
          {
            feedUrl: feed.feedUrl,
            showName: feed.showName ?? '',
            sourceUrl: feed.sourceUrl,
            audioUrl: metadata.audioUrl ?? null,
            rawGuid: metadata.rawGuid ?? null,
          },
          env.CREATOR_CONTENT_CACHE,
          now
        );
        if (resolved.destination && resolved.destination.kind !== 'subscribe')
          destinations[player] = { kind: resolved.destination.kind, url: resolved.destination.url };
      } catch {
        /* A provider outage must not discard other players' saved links. */
      }
    })
  );
  const complete = players.every(
    (player) =>
      destinations[player] && (player === 'OVERCAST' || destinations[player]?.kind === 'episode')
  );
  const attempts = (previous?.attempts ?? 0) + 1;
  // Missing/late directory entries retry hourly, then daily. Completed links are retained.
  const nextAttemptAt = complete ? null : now + (attempts <= 6 ? 3600000 : 86400000);
  await db
    .update(items)
    .set({ podcastDestinations: JSON.stringify({ destinations, nextAttemptAt, attempts }) })
    .where(eq(items.id, itemId));
}

// Uses the existing five-minute enrichment maintenance tick for Inbox items and backfill.
export async function backfillPodcastDestinations(env: Bindings) {
  const db = createDb(env.DB);
  const now = Date.now();
  const due = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.provider, 'RSS'),
        eq(items.contentType, 'PODCAST'),
        sql`(${items.podcastDestinations} IS NULL OR json_extract(${items.podcastDestinations}, '$.nextAttemptAt') <= ${now})`,
        sql`EXISTS (SELECT 1 FROM rss_feed_items JOIN rss_feeds ON rss_feeds.id = rss_feed_items.rss_feed_id WHERE rss_feed_items.item_id = ${items.id} AND rss_feeds.feed_type = 'PODCAST')`
      )
    )
    .orderBy(
      asc(sql`coalesce(json_extract(${items.podcastDestinations}, '$.nextAttemptAt'), 0)`),
      desc(items.createdAt)
    )
    .limit(10);
  for (const item of due) {
    try {
      await enrichPodcastDestinations(db, env, item.id, now);
    } catch (error) {
      logger.warn('Podcast destination enrichment deferred', { itemId: item.id, error });
    }
  }
}
