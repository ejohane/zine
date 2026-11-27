import { describe, expect, test } from 'bun:test';
import type { CardItem } from '@zine/next-ui';
import { inboxCards, sectionCount, spotlightItems, toSpreads } from './spotlight';
import type { Home, HomeCard, RemoteItem } from './live-api';

const content = (thumbnail?: string) => ({
  url: 'https://example.test/a',
  platform: 'web',
  type: 'article',
  title: 'A title',
  ...(thumbnail ? { thumbnail } : {}),
});
const picture = 'https://example.test/p.jpg';

const saved = (id: string, more: Partial<RemoteItem> = {}, thumbnail?: string) =>
  ({
    id,
    status: 'saved',
    archived: false,
    savedAt: '2026-11-20T10:00:00Z',
    progress: { position: null, unit: null, completedAt: null },
    content: content(thumbnail),
    ...more,
  }) as unknown as RemoteItem;

const started = (id: string, thumbnail?: string): HomeCard => ({
  id,
  savedAt: '2026-11-20T10:00:00Z',
  progress: { position: 0.4, unit: 'fraction', completedAt: null },
  content: content(thumbnail),
});

const home = (cards: HomeCard[]): Home => ({
  editionId: null,
  generatedAt: null,
  sections: [
    { id: 'resume', kind: 'resume', title: 'Jump back in', cards },
    { id: 'recent', kind: 'recent', title: 'Just saved', cards: [started('z')] },
  ],
});

const ids = (items: CardItem[]) => items.map((item) => item.id);

describe('what Home shows', () => {
  test('started things lead, pictures first, then the open library without repeats', () => {
    const items = spotlightItems(
      home([started('a'), started('b', picture)]),
      [
        saved('c'),
        saved('a'),
        saved('d', { archived: true }),
        saved('e', { progress: { position: 1, unit: 'fraction', completedAt: '2026-11-21' } }),
        saved('f', { status: 'received' }),
      ],
      'Home'
    );
    expect(ids(items)).toEqual(['b', 'a', 'c']);
  });

  test('a format filter shows only the library; without Home the library stands alone', () => {
    const library = [saved('c'), saved('d')];
    expect(ids(spotlightItems(home([started('a')]), library, 'Articles'))).toEqual(['c', 'd']);
    expect(ids(spotlightItems(undefined, library, 'Home'))).toEqual(['c', 'd']);
  });

  test('the inbox rail takes only what is still waiting', () => {
    const waiting = inboxCards([
      saved('a', { status: 'received' }),
      saved('b'),
      saved('c', { status: 'received', archived: true }),
    ]);
    expect(ids(waiting)).toEqual(['a']);
  });
});

describe('spreads', () => {
  const item = (id: string, pictured = false) =>
    ({ id, picture: pictured ? { url: picture, width: 16, height: 9 } : undefined }) as CardItem;

  test('each group of four leads with its first picture', () => {
    const spreads = toSpreads([
      item('a'),
      item('b', true),
      item('c', true),
      item('d'),
      item('e'),
      item('f'),
    ]);
    expect(spreads.map((s) => [s.hero.id, s.rows.map((row) => row.id)])).toEqual([
      ['b', ['a', 'c', 'd']],
      ['e', ['f']],
    ]);
  });

  test('nothing in, nothing out', () => {
    expect(toSpreads([])).toEqual([]);
  });
});

describe('filter counts', () => {
  const counts = {
    saved: 20,
    inbox: 7,
    savedByType: { article: 5, video: 6, podcast_episode: 4, post: 3, thread: 1, playlist: 1 },
  };

  test('each filter reads its own types; posts include threads', () => {
    expect(sectionCount(counts, 'Home')).toBe(20);
    expect(sectionCount(counts, 'Articles')).toBe(5);
    expect(sectionCount(counts, 'Videos')).toBe(6);
    expect(sectionCount(counts, 'Podcasts')).toBe(4);
    expect(sectionCount(counts, 'Posts')).toBe(4);
  });

  test('no counts yet means no numbers', () => {
    expect(sectionCount(undefined, 'Home')).toBeUndefined();
  });
});
