import { describe, expect, it } from 'vitest';

import { buildPodcastFollowWrite } from './podcast-follow';
import type { PodcastShowResolution } from './podcast-resolver';

function resolution(baselineEntryIds: string[]): PodcastShowResolution {
  return {
    feedUrl: 'https://publisher.example/feed.xml',
    title: 'Example Show',
    description: null,
    artworkUrl: null,
    siteUrl: 'https://publisher.example/show',
    sourceUrl: 'https://podcasts.apple.com/show/id123?i=456',
    sourcePlayer: 'APPLE_PODCASTS',
    externalShowUrl: null,
    externalShowLabel: null,
    matchedEntryId: null,
    matchedEntry: null,
    recentEpisodes: [],
    baselineEntryIds,
  };
}

describe('buildPodcastFollowWrite', () => {
  it('keeps an active follow retry idempotent when the feed gained a new episode', () => {
    const existing = {
      id: 'feed_1',
      title: 'Example Show',
      status: 'ACTIVE',
      feedType: 'PODCAST',
      baselineEntryIdsJson: JSON.stringify(['original-guid']),
      lastPolledAt: 100,
      lastSuccessAt: 90,
      etag: 'old-etag',
      lastModified: 'old-date',
    };

    const write = buildPodcastFollowWrite(existing, resolution(['new-guid', 'original-guid']), 200);

    expect(write.values).toBeNull();
    expect(write.baselineCount).toBe(1);
    expect(existing).toMatchObject({
      baselineEntryIdsJson: JSON.stringify(['original-guid']),
      lastPolledAt: 100,
      lastSuccessAt: 90,
      etag: 'old-etag',
      lastModified: 'old-date',
    });
  });

  it('preserves the existing reactivation behavior for a paused feed', () => {
    const write = buildPodcastFollowWrite(
      {
        id: 'feed_1',
        title: 'Example Show',
        status: 'PAUSED',
        feedType: 'PODCAST',
        baselineEntryIdsJson: JSON.stringify(['old-guid']),
        lastPolledAt: 100,
        lastSuccessAt: 90,
        etag: 'old-etag',
        lastModified: 'old-date',
      },
      resolution(['current-guid', 'old-guid']),
      200
    );

    expect(write.values).toMatchObject({
      status: 'ACTIVE',
      baselineEntryIdsJson: JSON.stringify(['current-guid', 'old-guid']),
      lastPolledAt: 200,
    });
  });

  it('upgrades an active legacy article row instead of treating it as an established follow', () => {
    const write = buildPodcastFollowWrite(
      {
        id: 'feed_1',
        title: 'Example Show',
        status: 'ACTIVE',
        feedType: 'ARTICLE',
        baselineEntryIdsJson: null,
        lastPolledAt: 100,
        lastSuccessAt: 90,
        etag: 'old-etag',
        lastModified: 'old-date',
      },
      resolution(['current-guid']),
      200
    );

    expect(write.values).toMatchObject({
      feedType: 'PODCAST',
      baselineEntryIdsJson: JSON.stringify(['current-guid']),
      status: 'ACTIVE',
    });
  });
});
