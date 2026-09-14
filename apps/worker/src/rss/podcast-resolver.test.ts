import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { scrapeOpenGraph } from '../lib/opengraph';

const mockScrapeOpenGraph = vi.fn();
vi.mock('../lib/opengraph', () => ({
  scrapeOpenGraph: (...args: Parameters<typeof scrapeOpenGraph>) => mockScrapeOpenGraph(...args),
}));

import { resolvePodcastShow } from './podcast-resolver';

const podcastFeed = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
  <title>Example Show</title><link>https://publisher.example/show</link>
  <itunes:image href="https://cdn.example/show.jpg" />
  <item><guid>new-guid</guid><title>New episode</title><pubDate>Fri, 11 Sep 2026 12:00:00 GMT</pubDate>
    <link>https://publisher.example/new</link><itunes:duration>30:00</itunes:duration>
    <enclosure url="https://cdn.example/new.mp3" type="audio/mpeg" /></item>
  <item><guid>saved-guid</guid><title>Saved episode</title><pubDate>Fri, 04 Sep 2026 12:00:00 GMT</pubDate>
    <link>https://publisher.example/saved</link><itunes:duration>42:00</itunes:duration>
    <enclosure url="https://cdn.example/saved.mp3" type="audio/mpeg" /></item>
</channel></rss>`;

describe('resolvePodcastShow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockScrapeOpenGraph.mockReset();
  });

  it('uses the documented Apple catalog lookup and matches an episode by enclosure URL', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                kind: 'podcast',
                collectionId: 123,
                collectionName: 'Example Show',
                feedUrl: 'https://publisher.example/feed.xml',
                trackViewUrl: 'https://podcasts.apple.com/us/podcast/example/id123',
              },
              {
                kind: 'podcast-episode',
                collectionId: 123,
                trackId: 456,
                trackName: 'Saved episode',
                episodeUrl: 'https://cdn.example/saved.mp3',
                trackTimeMillis: 2_520_000,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(new Response(podcastFeed, { status: 200 }));

    const result = await resolvePodcastShow({
      sourceUrl: 'https://podcasts.apple.com/us/podcast/example/id123?i=456',
    });

    expect(result.feedUrl).toBe('https://publisher.example/feed.xml');
    expect(result.matchedEntryId).toBe('saved-guid');
    expect(result.externalShowLabel).toBe('Open show in Apple Podcasts');
    expect(result.baselineEntryIds).toEqual(['new-guid', 'saved-guid']);
  });

  it('resolves a Pocket Casts episode only when public metadata matches a feed entry', async () => {
    mockScrapeOpenGraph.mockResolvedValue({
      responseStatus: 200,
      resolvedUrl: 'https://pocketcasts.com/podcast/example/show/saved/episode',
      podcastEpisode: {
        title: 'Saved episode',
        showName: 'Example Show',
        artworkUrl: null,
        duration: 2520,
        audioUrl: 'https://cdn.example/saved.mp3',
      },
    });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                kind: 'podcast',
                collectionId: 123,
                collectionName: 'Example Show',
                feedUrl: 'https://publisher.example/feed.xml',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(new Response(podcastFeed, { status: 200 }));

    const result = await resolvePodcastShow({
      sourceUrl: 'https://pocketcasts.com/podcast/example/show/saved/episode',
    });
    expect(result.sourcePlayer).toBe('POCKET_CASTS');
    expect(result.matchedEntryId).toBe('saved-guid');
  });

  it('does not reconcile a player bookmark to a feed entry by title alone', async () => {
    mockScrapeOpenGraph.mockResolvedValue({
      responseStatus: 200,
      resolvedUrl: 'https://pocketcasts.com/podcast/example/show/saved/episode',
      podcastEpisode: {
        title: 'Saved episode',
        showName: 'Example Show',
        artworkUrl: null,
        duration: null,
        audioUrl: null,
      },
    });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                kind: 'podcast',
                collectionId: 123,
                collectionName: 'Example Show',
                feedUrl: 'https://publisher.example/feed.xml',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(new Response(podcastFeed, { status: 200 }));

    await expect(
      resolvePodcastShow({
        sourceUrl: 'https://pocketcasts.com/podcast/example/show/saved/episode',
      })
    ).rejects.toThrow('could not verify this player episode');
  });

  it('does not reconcile title and duration when the show identity differs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(podcastFeed, { status: 200 }));

    const result = await resolvePodcastShow({
      sourceUrl: 'https://overcast.fm/+episode',
      manualFeedUrl: 'https://publisher.example/feed.xml',
      hints: {
        episodeTitle: 'Saved episode',
        showName: 'Different Show',
        durationSeconds: 2520,
      },
    });

    expect(result.matchedEntryId).toBeNull();
  });

  it('reconciles a manual feed using exact show, episode, and duration evidence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(podcastFeed, { status: 200 }));

    const result = await resolvePodcastShow({
      sourceUrl: 'https://overcast.fm/+episode',
      manualFeedUrl: 'https://publisher.example/feed.xml',
      hints: {
        episodeTitle: 'Saved episode',
        showName: 'Example Show',
        durationSeconds: 2520,
      },
    });

    expect(result.matchedEntryId).toBe('saved-guid');
  });

  it('rejects a manual feed that has no public audio enclosures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        `<?xml version="1.0"?><rss version="2.0"><channel><title>Articles</title><item><guid>1</guid><title>Post</title></item></channel></rss>`,
        { status: 200 }
      )
    );

    await expect(
      resolvePodcastShow({
        sourceUrl: 'https://overcast.fm/+episode',
        manualFeedUrl: 'https://publisher.example/feed.xml',
      })
    ).rejects.toThrow('does not contain public podcast audio');
  });
});
