import { describe, expect, test } from 'bun:test';
import { toCardItem } from './bentoSections';
import type { HomeCard } from './live-api';

const card = (content: Partial<HomeCard['content']>, more: Partial<HomeCard> = {}): HomeCard => ({
  id: 'item-1',
  savedAt: '2026-11-20T10:00:00Z',
  progress: { position: null, unit: null, completedAt: null },
  content: { url: 'https://example.test/a', platform: 'web', type: 'article', ...content },
  ...more,
});

describe('Home cards as card items', () => {
  test('an article keeps its title, summary, opening text and read time', () => {
    const item = toCardItem(
      card({
        title: ' A title ',
        creator: { name: 'Field Notes' },
        creatorImageUrl: 'https://example.test/me.jpg',
        thumbnail: 'https://example.test/t.jpg',
        summary: 'Short summary.',
        preview: 'The opening words.',
        readMinutes: 7,
      })
    );
    expect(item).toMatchObject({
      kind: 'article',
      title: 'A title',
      creator: { name: 'Field Notes', avatarUrl: 'https://example.test/me.jpg' },
      description: 'Short summary.',
      body: 'The opening words.',
      picture: { url: 'https://example.test/t.jpg', width: 16, height: 9 },
      durationMinutes: 7,
      savedAt: '2026-11-20T10:00:00Z',
    });
  });

  test('a post shows its words, not a title, and takes its handle from the link', () => {
    const item = toCardItem(
      card({
        url: 'https://x.com/someone/status/123',
        type: 'post',
        title: 'The first words…',
        creator: 'Some One',
        preview: 'The first words and the rest.',
      })
    );
    expect(item?.kind).toBe('post');
    expect(item?.title).toBeUndefined();
    expect(item?.body).toBe('The first words and the rest.');
    expect(item?.creator).toMatchObject({ name: 'Some One', handle: '@someone' });
  });

  test('videos and podcasts get minutes and progress from seconds', () => {
    const video = toCardItem(
      card(
        { type: 'video', durationSeconds: 1200 },
        { progress: { position: 300, unit: 'seconds', completedAt: null } }
      )
    );
    expect(video).toMatchObject({ kind: 'video', durationMinutes: 20, progress: 0.25 });
    const podcast = toCardItem(
      card({ type: 'podcast_episode', thumbnail: 'https://example.test/c.jpg' })
    );
    expect(podcast?.picture).toMatchObject({ width: 16, height: 16 });
  });

  test('finished items carry no progress; insecure pictures are dropped', () => {
    const item = toCardItem(
      card(
        { thumbnail: 'http://example.test/t.jpg' },
        { progress: { position: 0.5, unit: 'fraction', completedAt: '2026-11-21T00:00:00Z' } }
      )
    );
    expect(item?.progress).toBeUndefined();
    expect(item?.picture).toBeUndefined();
  });

  test('a missing creator falls back to the site; unknown types and bad links are left out', () => {
    expect(toCardItem(card({ url: 'https://www.example.test/a' }))?.creator.name).toBe(
      'example.test'
    );
    expect(toCardItem(card({ type: 'playlist' }))).toBeNull();
    expect(toCardItem(card({ url: 'not a link' }))).toBeNull();
  });

  test('reading progress labelled seconds with no length is read as the fraction it is', () => {
    const reading = toCardItem(
      card({ readMinutes: 10 }, { progress: { position: 0.2, unit: 'seconds', completedAt: null } })
    );
    expect(reading?.progress).toBe(0.2);
    const unknown = toCardItem(
      card({}, { progress: { position: 95, unit: 'seconds', completedAt: null } })
    );
    expect(unknown?.progress).toBeUndefined();
  });
});
