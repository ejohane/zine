import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeClient } from '../providers/youtube';
import { fetchVideosForReconciliation, YOUTUBE_POLL_OVERLAP_MS } from '../providers/youtube';
import { pollSingleYouTubeSubscription, pollYouTubeSubscriptionsBatched } from './youtube-poller';
import type { Subscription, DrizzleDB } from './types';
import type { Bindings } from '../types';
import { ingestItem } from '../ingestion/processor';
import { expectLoggerErrorCalls } from '../test/mock-logger';

vi.mock('googleapis', () => ({ google: { auth: { OAuth2: vi.fn() }, youtube: vi.fn() } }));
vi.mock('../ingestion/processor', () => ({ ingestItem: vi.fn() }));
const now = Date.parse('2026-10-07T23:00:00Z');
const sub = {
  id: 'sub',
  userId: 'user',
  providerChannelId: 'UCchannel',
  creatorId: null,
  createdAt: now - 30 * 86400000,
  lastPolledAt: now - 3600000,
} as Subscription;
const video = (id: string, publishedAt: string, insertedAt = publishedAt) => ({
  contentDetails: { videoId: id, videoPublishedAt: publishedAt },
  snippet: { publishedAt: insertedAt, title: id, channelId: 'UCchannel', channelTitle: 'Channel' },
});
function setup(entries = [video('late', '2026-10-06T17:00:31Z', '2026-10-01T00:00:00Z')]) {
  const playlist = vi.fn().mockResolvedValue({ data: { items: entries } });
  const details = vi.fn().mockResolvedValue({
    data: {
      items: entries.map((v) => ({
        id: v.contentDetails.videoId,
        snippet: { publishedAt: v.contentDetails.videoPublishedAt },
        contentDetails: { duration: 'PT2H' },
      })),
    },
  });
  const client = {
    api: { playlistItems: { list: playlist }, videos: { list: details } },
  } as unknown as YouTubeClient;
  const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const db = { update: vi.fn().mockReturnValue({ set }) } as unknown as DrizzleDB;
  return { playlist, details, client, db, set };
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.mocked(ingestItem)
    .mockReset()
    .mockResolvedValue({ created: true, itemId: 'item', userItemId: 'ui' });
});
afterEach(() => vi.restoreAllMocks());
describe('YouTube reconciliation', () => {
  it('imports a late-visible full episode older than the last poll using the video publication date', async () => {
    const { client, db, set } = setup();
    await expect(
      pollSingleYouTubeSubscription(sub, client, 'user', {} as Bindings, db)
    ).resolves.toMatchObject({ newItems: 1 });
    const call = vi.mocked(ingestItem).mock.calls[0];
    expect(call[2]).toMatchObject({
      snippet: { publishedAt: '2026-10-06T17:00:31Z' },
      durationSeconds: 7200,
    });
    expect(call[5](call[2])).toMatchObject({ publishedAt: Date.parse('2026-10-06T17:00:31Z') });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ lastPolledAt: now }));
  });
  it('reads later pages past ten uploads, including a long episode behind Shorts', async () => {
    const { client, playlist } = setup();
    playlist.mockResolvedValueOnce({
      data: {
        items: Array.from({ length: 50 }, (_, i) => video('short' + i, '2026-10-07T18:00:00Z')),
        nextPageToken: 'page2',
      },
    });
    playlist.mockResolvedValueOnce({ data: { items: [video('episode', '2026-10-06T17:00:00Z')] } });
    const result = await fetchVideosForReconciliation(
      client,
      'UUchannel',
      now - YOUTUBE_POLL_OVERLAP_MS
    );
    expect(result).toHaveLength(51);
    expect(result[50].contentDetails?.videoId).toBe('episode');
    expect(playlist.mock.calls[1][0]).toMatchObject({ maxResults: 50, pageToken: 'page2' });
  });
  it('does not accept a truncated scan as a successful poll', async () => {
    const { client, playlist, db, set } = setup();
    playlist.mockResolvedValue({
      data: { items: [video('new', '2026-10-07T18:00:00Z')], nextPageToken: 'more' },
    });
    await expect(
      pollSingleYouTubeSubscription(sub, client, 'user', {} as Bindings, db)
    ).rejects.toThrow('page limit');
    expect(set).not.toHaveBeenCalled();
  });
  it('retains the cutoff after a provider detail failure so the next poll retries', async () => {
    const { client, details, db, set } = setup();
    details.mockRejectedValueOnce(new Error('temporary provider failure'));
    await expect(
      pollSingleYouTubeSubscription(sub, client, 'user', {} as Bindings, db)
    ).rejects.toThrow('temporary');
    expect(set).not.toHaveBeenCalled();
    await pollSingleYouTubeSubscription(sub, client, 'user', {} as Bindings, db);
    expect(ingestItem).toHaveBeenCalledTimes(1);
  });
  it('retains the cutoff after an ingestion failure, including batched polling', async () => {
    const { client, db, set } = setup();
    vi.mocked(ingestItem).mockRejectedValue(new Error('database temporarily unavailable'));
    const result = await pollYouTubeSubscriptionsBatched([sub], client, 'user', {} as Bindings, db);
    expectLoggerErrorCalls([['Failed to ingest video'], ['Failed to process subscription videos']]);
    expect(result.errors).toHaveLength(1);
    expect(set).not.toHaveBeenCalled();
  });
  it('retains the cutoff when a later playlist page fails', async () => {
    const { client, playlist, db, set } = setup();
    playlist.mockResolvedValueOnce({
      data: { items: [video('new', '2026-10-07T18:00:00Z')], nextPageToken: 'page2' },
    });
    playlist.mockRejectedValueOnce(new Error('page unavailable'));
    await expect(
      pollSingleYouTubeSubscription(sub, client, 'user', {} as Bindings, db)
    ).rejects.toThrow('page unavailable');
    expect(set).not.toHaveBeenCalled();
    expect(ingestItem).not.toHaveBeenCalled();
  });
  it('keeps first-poll welcome semantics and excludes scheduled releases', async () => {
    const { client, db } = setup([
      video('scheduled', '2026-10-08T12:00:00Z'),
      video('latest', '2026-10-07T17:00:00Z'),
      video('older', '2026-10-06T17:00:00Z'),
    ]);
    await pollSingleYouTubeSubscription(
      { ...sub, lastPolledAt: null },
      client,
      'user',
      {} as Bindings,
      db
    );
    expect(ingestItem).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ingestItem).mock.calls[0][2]).toMatchObject({
      contentDetails: { videoId: 'latest' },
    });
  });
  it('recovers an episode after a long outage without advancing a failed cutoff', async () => {
    const { client, db } = setup([video('missed', '2026-09-23T17:00:19Z')]);
    await pollSingleYouTubeSubscription(
      { ...sub, lastPolledAt: Date.parse('2026-09-30T00:00:00Z') },
      client,
      'user',
      {} as Bindings,
      db
    );
    expect(ingestItem).toHaveBeenCalledTimes(1);
  });
  it('leaves existing item membership to the idempotent ingestion boundary on overlap polls', async () => {
    const { client, db } = setup();
    vi.mocked(ingestItem).mockResolvedValue({ created: false, skipped: 'already_seen' });
    await expect(
      pollSingleYouTubeSubscription(sub, client, 'user', {} as Bindings, db)
    ).resolves.toMatchObject({ newItems: 0 });
  });
  it('excludes Shorts, future releases, and unavailable videos', async () => {
    const { client, db, details } = setup([
      video('short', '2026-10-07T12:00:00Z'),
      video('future', '2026-10-08T12:00:00Z'),
      video('private', '2026-10-07T12:00:00Z'),
    ]);
    details.mockResolvedValue({
      data: {
        items: [
          {
            id: 'short',
            contentDetails: { duration: 'PT1M' },
            snippet: { publishedAt: '2026-10-07T12:00:00Z' },
          },
          {
            id: 'future',
            contentDetails: { duration: 'PT2H' },
            snippet: { publishedAt: '2026-10-08T12:00:00Z' },
          },
        ],
      },
    });
    await pollSingleYouTubeSubscription(sub, client, 'user', {} as Bindings, db);
    expect(ingestItem).not.toHaveBeenCalled();
  });
});
