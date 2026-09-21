import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePlayerDestination, type PlayerContext } from './player-destinations';
vi.mock('../lib/opengraph', () => ({
  scrapeOpenGraph: vi.fn(async () => ({
    podcastFeedUrl: 'https://publisher.example/rss',
    podcastAppleId: '123',
  })),
}));
const context: PlayerContext = {
  feedUrl: 'https://publisher.example/rss',
  showName: 'Show',
  sourceUrl: 'https://overcast.fm/+saved',
  audioUrl: 'https://publisher.example/one.mp3',
  rawGuid: 'one',
};
function cache() {
  const values = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => JSON.parse(values.get(key) ?? 'null')),
    put: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  } as unknown as KVNamespace;
}
function apple(episodes: unknown[] = []) {
  return Response.json({
    results: [{ kind: 'podcast', collectionId: 123, feedUrl: context.feedUrl }, ...episodes],
  });
}
const episode = {
  kind: 'podcast-episode',
  collectionId: 123,
  episodeGuid: 'one',
  episodeUrl: context.audioUrl,
  trackViewUrl: 'https://podcasts.apple.com/podcast/id123?i=456',
};
describe('podcast player destinations', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('opens the verified Overcast show using its native universal-link route', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const result = await resolvePlayerDestination('OVERCAST', context, cache());
    expect(result.destination).toEqual({
      kind: 'show',
      url: 'https://overcast.fm/+itunes123',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('verifies an Overcast +itunes source against the RSS feed before linking', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apple());
    const result = await resolvePlayerDestination(
      'OVERCAST',
      {
        ...context,
        sourceUrl: 'https://overcast.fm/+itunes123',
      },
      cache()
    );
    expect(result.destination).toEqual({ kind: 'show', url: 'https://overcast.fm/+itunes123' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not send a mismatched feed to an Overcast show or subscribe prompt', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        results: [{ kind: 'podcast', collectionId: 123, feedUrl: 'https://wrong.example/rss' }],
      })
    );
    const result = await resolvePlayerDestination(
      'OVERCAST',
      {
        ...context,
        sourceUrl: 'https://overcast.fm/+itunes123',
      },
      cache()
    );
    expect(result.destination).toBeNull();
  });
  it('preserves the verified Overcast show during directory outages', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apple())
      .mockResolvedValue(new Response(null, { status: 429 }));
    const kv = cache();
    const input = { ...context, sourceUrl: 'https://overcast.fm/+itunes123' };
    await resolvePlayerDestination('OVERCAST', input, kv, 1000);
    const stale = await resolvePlayerDestination('OVERCAST', input, kv, 3602000);
    expect(stale.destination).toEqual({ kind: 'show', url: 'https://overcast.fm/+itunes123' });
    expect(stale.temporarilyUnavailable).toBe(true);
    await resolvePlayerDestination('OVERCAST', input, kv, 3603000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('matches Apple by GUID/audio and caches public catalogs across episode requests', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(apple([episode]));
    const kv = cache();
    expect((await resolvePlayerDestination('APPLE_PODCASTS', context, kv)).destination?.kind).toBe(
      'episode'
    );
    expect(
      (
        await resolvePlayerDestination(
          'APPLE_PODCASTS',
          { ...context, rawGuid: 'two', audioUrl: 'https://publisher.example/two.mp3' },
          kv
        )
      ).destination?.kind
    ).toBe('show');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects Apple catalogs for another feed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        results: [{ kind: 'podcast', feedUrl: 'https://wrong.example/rss' }, episode],
      })
    );
    expect(
      (await resolvePlayerDestination('APPLE_PODCASTS', context, cache())).destination
    ).toBeNull();
  });
  it('never emits external or insecure episode destinations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      apple([{ ...episode, trackViewUrl: 'https://attacker.example/episode' }])
    );
    expect(
      (await resolvePlayerDestination('APPLE_PODCASTS', context, cache())).destination?.kind
    ).toBe('show');
  });
  it('preserves a verified stale link on 429 and backs off subsequent lookups', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apple([episode]))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    const kv = cache();
    await resolvePlayerDestination('APPLE_PODCASTS', context, kv, 1000);
    const stale = await resolvePlayerDestination('APPLE_PODCASTS', context, kv, 3602000);
    expect(stale.destination?.kind).toBe('episode');
    expect(stale.temporarilyUnavailable).toBe(true);
    await resolvePlayerDestination('APPLE_PODCASTS', context, kv, 3603000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('backs off a cold Apple directory failure', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 429 }));
    const kv = cache();
    const input = { ...context, sourceUrl: null };
    const result = await resolvePlayerDestination('APPLE_PODCASTS', input, kv, 1000);
    expect(result.destination).toBeNull();
    await resolvePlayerDestination('APPLE_PODCASTS', input, kv, 2000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('matches Pocket Casts audio inside a candidate show, not by episode title', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          result: {
            structuredContent: {
              podcasts: [
                {
                  title: 'Show',
                  uuid: 'show',
                  pocketcasts_url: { web: 'https://pocketcasts.com/podcast/show' },
                },
              ],
            },
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          result: {
            structuredContent: {
              episodes: [
                {
                  title: 'Different presentation',
                  url: context.audioUrl,
                  pocketcasts_url: {
                    episode: { share: 'https://pocketcasts.com/podcasts/show/episode' },
                  },
                },
              ],
            },
          },
        })
      );
    expect((await resolvePlayerDestination('POCKET_CASTS', context, cache())).destination).toEqual({
      kind: 'episode',
      url: 'https://pocketcasts.com/podcasts/show/episode',
    });
  });
  it.each([false, true])(
    'handles duplicate Pocket Casts shows without guessing (one unavailable: %s)',
    async (unavailable) => {
      const response = (structuredContent: unknown) =>
        Response.json({ result: { structuredContent } });
      const episodeResult = (id: string) =>
        response({
          episodes: [
            {
              url: context.audioUrl,
              pocketcasts_url: {
                episode: { share: `https://pocketcasts.com/podcasts/${id}/episode` },
              },
            },
          ],
        });
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          response({
            podcasts: [
              { title: 'Show', uuid: 'one' },
              { title: 'Show', uuid: 'two' },
            ],
          })
        )
        .mockResolvedValueOnce(episodeResult('one'))
        .mockResolvedValueOnce(
          unavailable ? new Response(null, { status: 503 }) : episodeResult('two')
        );
      const result = await resolvePlayerDestination('POCKET_CASTS', context, cache());
      expect(result.destination?.kind ?? null).toBe(unavailable ? 'episode' : null);
      expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
        'User-Agent': 'ZinePodcastResolver/1.0 (+https://myzine.app)',
        Accept: 'application/json, text/event-stream',
      });
    }
  );

  it('rejects Pocket Casts results sharing a title but not the audio', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          result: { structuredContent: { podcasts: [{ title: 'Show', uuid: 'show' }] } },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          result: {
            structuredContent: {
              episodes: [
                {
                  title: 'Same title',
                  url: 'https://other.example/audio',
                  pocketcasts_url: {
                    episode: { share: 'https://pocketcasts.com/podcasts/show/episode' },
                  },
                },
              ],
            },
          },
        })
      );
    expect(
      (await resolvePlayerDestination('POCKET_CASTS', context, cache())).destination
    ).toBeNull();
  });
});
