import { expect, it, vi } from 'vitest';
import { Provider } from '@zine/shared';
import { triggerInitialFetch, type InitialFetchEnv } from './initial-fetch';
import { getYouTubeClientForConnection, fetchVideoDetails } from '../providers/youtube';
import { ingestItem } from '../ingestion/processor';
import type { Database } from '../db';
import type { ProviderConnection } from '../lib/token-refresh';

vi.mock('../providers/youtube', () => ({
  getYouTubeClientForConnection: vi.fn(),
  getUploadsPlaylistId: () => 'UUchannel',
  fetchVideoDetails: vi.fn(),
}));
vi.mock('../providers/spotify', () => ({
  getSpotifyClientForConnection: vi.fn(),
  getLatestEpisode: vi.fn(),
  getShow: vi.fn(),
  getLargestImage: vi.fn(),
}));
vi.mock('../ingestion/processor', () => ({ ingestItem: vi.fn() }));

it('uses publication time for the welcome item and skips a scheduled upload added earlier', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const published = new Date(Date.now() - 86400000).toISOString();
  const inserted = new Date(Date.now() - 7 * 86400000).toISOString();
  const makeVideo = (id: string, publication: string) => ({
    status: { privacyStatus: 'public' },
    snippet: { title: id, channelTitle: 'Channel', channelId: 'UCchannel', publishedAt: inserted },
    contentDetails: { videoId: id, videoPublishedAt: publication },
  });
  vi.mocked(getYouTubeClientForConnection).mockResolvedValue({
    api: {
      playlistItems: {
        list: vi.fn().mockResolvedValue({
          data: { items: [makeVideo('scheduled', future), makeVideo('released', published)] },
        }),
      },
    },
  } as unknown as Awaited<ReturnType<typeof getYouTubeClientForConnection>>);
  vi.mocked(fetchVideoDetails).mockResolvedValue(
    new Map([['released', { durationSeconds: 7200, description: 'Full episode' }]])
  );
  vi.mocked(ingestItem).mockResolvedValue({ created: true, itemId: 'item', userItemId: 'ui' });
  const db = {
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  } as unknown as Database;
  const result = await triggerInitialFetch(
    'user',
    'sub',
    {} as ProviderConnection,
    Provider.YOUTUBE,
    'UCchannel',
    db,
    {} as InitialFetchEnv
  );
  expect(result.itemIngested).toBe(true);
  const call = vi.mocked(ingestItem).mock.calls[0];
  expect(call[2]).toMatchObject({
    contentDetails: { videoId: 'released', videoPublishedAt: published },
  });
  expect(call[5](call[2])).toMatchObject({ publishedAt: Date.parse(published) });
});
