import { describe, expect, it } from 'vitest';
import { embeddedObject, parseTimedTranscript } from '../src/providers/youtube';

describe('YouTube source data parsing', () => {
  it('extracts balanced JSON with escaped quotes and literal braces', () => {
    const value = {
      videoDetails: {
        title: 'A } and "quoted" title',
        shortDescription: 'Escapes \\ and { braces',
      },
    };
    expect(
      embeddedObject(
        `before;var ytInitialPlayerResponse = ${JSON.stringify(value)}; after;`,
        'ytInitialPlayerResponse'
      )
    ).toEqual(value);
    expect(embeddedObject('no player here', 'ytInitialPlayerResponse')).toBeNull();
  });
  it('retains caption timing and ignores empty events', () => {
    expect(
      parseTimedTranscript({
        events: [
          { tStartMs: 1200, dDurationMs: 2400, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
          { tStartMs: 4000, segs: [{ utf8: '\n' }] },
        ],
      })
    ).toEqual({
      segments: [{ text: 'Hello world', startSeconds: 1.2, endSeconds: 3.5999999999999996 }],
    });
  });
});

import { descriptionChapters, isoDuration } from '../src/providers/youtube-api';
it('parses official API durations and explicit description chapter timestamps', () => {
  expect(isoDuration('PT1H2M3S')).toBe(3723);
  expect(isoDuration('P1DT2H')).toBe(93600);
  expect(isoDuration('garbage')).toBeUndefined();
  expect(
    descriptionChapters(
      'Intro\n00:00 Opening\n12:34 Architecture\n1:02:03 Wrap-up\n1:99:00 Invalid'
    )
  ).toEqual([
    { startSeconds: 0, title: 'Opening' },
    { startSeconds: 754, title: 'Architecture' },
    { startSeconds: 3723, title: 'Wrap-up' },
  ]);
});

import { afterEach, vi } from 'vitest';
import { markYouTubeShorts, youtubeFeedEntryKind } from '../src/providers/youtube-api';
import { parseFeed } from '../src/providers/feed';
import type { Env } from '../src/types';
import type { FeedEntry } from '../src/providers/feed';

describe('YouTube Shorts classification', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { YOUTUBE_API_KEY: 'synthetic-key' } as Env;
  const uploads = 'https://www.youtube.com/playlist?list=UUabcdefghijklmnopqrstuv';
  const video = (id: string, publishedAt: string): FeedEntry => ({
    id: `youtube:video:${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: id,
    publishedAt,
    kind: 'video',
    enclosures: [],
    transcripts: [],
  });
  const shortsPage = (ids: [string, string][], nextPageToken?: string) =>
    Response.json({
      items: ids.map(([videoId, videoPublishedAt]) => ({
        contentDetails: { videoId, videoPublishedAt },
      })),
      nextPageToken,
    });

  it('reads the format from a channel feed entry link', () => {
    const feed = parseFeed(
      `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
        <title>Channel</title>
        <entry><id>yt:video:aaaaaaaaaaa</id><yt:videoId>aaaaaaaaaaa</yt:videoId><title>Short</title>
          <link rel="alternate" href="https://www.youtube.com/shorts/aaaaaaaaaaa"/></entry>
        <entry><id>yt:video:bbbbbbbbbbb</id><yt:videoId>bbbbbbbbbbb</yt:videoId><title>Long</title>
          <link rel="alternate" href="https://www.youtube.com/watch?v=bbbbbbbbbbb"/></entry>
      </feed>`,
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv'
    );
    expect(feed.entries.map((entry) => youtubeFeedEntryKind(entry.url))).toEqual([
      'short_video',
      'video',
    ]);
    expect(youtubeFeedEntryKind('not a url')).toBe('video');
  });

  it('marks uploads that are members of the channel Shorts playlist', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (input: URL) => {
      requested.push(input.searchParams.get('playlistId')!);
      return shortsPage([
        ['short000001', '2026-11-20T00:00:00Z'],
        ['short000000', '2026-11-01T00:00:00Z'],
      ]);
    });
    const entries = [
      video('short000001', '2026-11-20T00:00:00Z'),
      video('long0000001', '2026-11-10T00:00:00Z'),
    ];
    await markYouTubeShorts(env, undefined, uploads, entries);
    expect(entries.map((entry) => entry.kind)).toEqual(['short_video', 'video']);
    expect(requested).toEqual(['UUSHabcdefghijklmnopqrstuv']);
  });

  it('pages the Shorts playlist until it reaches back past the uploads page', async () => {
    const tokens: (string | null)[] = [];
    vi.stubGlobal('fetch', async (input: URL) => {
      const token = input.searchParams.get('pageToken');
      tokens.push(token);
      return token === 'third'
        ? shortsPage([['short000003', '2026-09-01T00:00:00Z']], 'unused')
        : token === 'second'
          ? shortsPage([['short000002', '2026-10-01T00:00:00Z']], 'third')
          : shortsPage([['short000001', '2026-11-20T00:00:00Z']], 'second');
    });
    const entries = [video('short000002', '2026-10-01T00:00:00Z')];
    const older = [video('long0000002', '2026-10-15T00:00:00Z'), ...entries];
    await markYouTubeShorts(env, undefined, uploads, older);
    expect(older.map((entry) => entry.kind)).toEqual(['video', 'short_video']);
    // The second page only ties the oldest upload; the third is the first strictly older one.
    expect(tokens).toEqual([null, 'second', 'third']);
  });

  it('treats a channel without a Shorts playlist as having none', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    const entries = [video('long0000001', '2026-11-10T00:00:00Z')];
    await markYouTubeShorts(env, undefined, uploads, entries);
    expect(entries[0].kind).toBe('video');
  });

  it('does not spend a lookup on explicit playlists or history that cannot arrive', async () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    const entries = [video('long0000001', '2020-01-01T00:00:00Z')];
    await markYouTubeShorts(
      env,
      undefined,
      'https://www.youtube.com/playlist?list=PLabcdefghijklmnopqrstuvwxyz012345',
      entries
    );
    await markYouTubeShorts(env, undefined, uploads, entries, '2026-01-01T00:00:00.000Z');
    expect(fetched).not.toHaveBeenCalled();
  });

  it('fails the page rather than letting Shorts through when the lookup is unavailable', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }));
    await expect(
      markYouTubeShorts(env, undefined, uploads, [video('long0000001', '2026-11-10T00:00:00Z')])
    ).rejects.toMatchObject({ code: 'provider_http_503', retryable: true });
  });
});
