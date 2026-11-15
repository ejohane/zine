import { describe, expect, it } from 'bun:test';
import { homeSource, toEntry } from './homeEntries';
import type { Home, RemoteItem } from './live-api';

const progress = { position: null, unit: null, completedAt: null };
const card = (
  content: Partial<RemoteItem['content']> & { type: string; url: string },
  extra = {}
) => ({
  id: 'itm_1',
  savedAt: null,
  progress,
  content: { platform: 'web', ...content },
  ...extra,
});

describe('toEntry', () => {
  it('maps a started video with its avatar and length', () => {
    const entry = toEntry(
      card(
        {
          type: 'video',
          url: 'https://www.youtube.com/watch?v=x',
          title: 'Video',
          creator: 'Channel',
          creatorImageUrl: 'https://yt3.ggpht.com/a',
          thumbnail: 'https://i.ytimg.com/t.jpg',
          durationSeconds: 600,
        },
        { progress: { position: 150, unit: 'seconds', completedAt: null } }
      )
    )!;
    expect(entry.kind).toBe('video');
    expect(entry.avatar).toBe('https://yt3.ggpht.com/a');
    expect(entry.progress).toBe(0.25);
  });

  it('reads the X handle from the post URL and keeps the post text', () => {
    const entry = toEntry(
      card({
        type: 'post',
        url: 'https://x.com/simonlast/status/1',
        title: 'The post text',
        creator: 'Simon Last',
      })
    )!;
    expect(entry.handle).toBe('simonlast');
    expect(entry.preview).toBe('The post text');
  });

  it('drops insecure images and unsupported types', () => {
    const entry = toEntry(
      card({ type: 'article', url: 'https://example.com/a', thumbnail: 'http://example.com/t.jpg' })
    )!;
    expect(entry.thumbnail).toBeUndefined();
    expect(entry.creator).toBe('example.com');
    expect(toEntry(card({ type: 'collection', url: 'https://example.com/c' }))).toBeNull();
  });
});

describe('homeSource', () => {
  const item = (id: string, extra: Partial<RemoteItem> = {}) =>
    ({
      id,
      status: 'saved',
      archived: false,
      progress,
      content: { id: 'c' + id, type: 'article', url: 'https://example.com/' + id, platform: 'web' },
      ...extra,
    }) as RemoteItem;

  it('uses Home sections and fills the rest from open library items', () => {
    const home: Home = {
      editionId: null,
      generatedAt: null,
      sections: [
        {
          id: 'recent',
          kind: 'recent',
          title: 'Just saved',
          cards: [card({ type: 'article', url: 'https://example.com/r' }, { id: 'r' })],
        },
      ],
    };
    const source = homeSource(home, [item('a'), item('b', { archived: true })]);
    expect(source.recent.map((e) => e.id)).toEqual(['r']);
    expect(source.library.map((e) => e.id)).toEqual(['a']);
  });

  it('builds a Home from the library alone while /v1/home is unavailable', () => {
    const source = homeSource(undefined, [
      item('a', { progress: { position: 0.3, unit: 'fraction', completedAt: null } }),
      item('b'),
    ]);
    expect(source.resume.map((e) => e.id)).toEqual(['a']);
    expect(source.recent.length).toBe(2);
  });
});
