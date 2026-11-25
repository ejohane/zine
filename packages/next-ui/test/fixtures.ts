import type { CardItem } from '../src/types';

/** Invented items covering each kind of card. Names and text are made up. */
export const NOW = new Date('2026-11-25T12:00:00Z');
const wide = { url: 'https://example.test/wide.jpg', width: 1600, height: 900 };

export const video: CardItem = {
  id: 'video-1',
  kind: 'video',
  url: 'https://example.test/watch/1',
  title: 'Building a boat from one sheet of plywood',
  creator: { name: 'Workshop Hours' },
  description: 'A weekend build, start to finish, with every mistake left in.',
  picture: wide,
  durationMinutes: 87,
  savedAt: '2026-11-23T12:00:00Z',
};

export const podcast: CardItem = {
  id: 'podcast-1',
  kind: 'podcast',
  url: 'https://example.test/listen/1',
  title: 'How cities learn to listen',
  creator: { name: 'Slow Radio' },
  description: 'What a street sounds like when the traffic stops.',
  picture: { url: 'https://example.test/cover.jpg', width: 1400, height: 1400 },
  durationMinutes: 48,
  savedAt: '2026-11-18T12:00:00Z',
};

export const article: CardItem = {
  id: 'article-1',
  kind: 'article',
  url: 'https://example.test/read/1',
  title: 'The quiet return of the personal website',
  creator: { name: 'Field Notes' },
  description: 'Why small, hand-built corners of the web are filling up again.',
  body: 'For a decade the advice was the same: go where the audience already is.\n\nLately something else is happening.',
  picture: wide,
  durationMinutes: 12,
  savedAt: '2026-11-25T11:00:00Z',
};

export const articleNoPicture: CardItem = { ...article, id: 'article-2', picture: undefined };

export const post: CardItem = {
  id: 'post-1',
  kind: 'post',
  url: 'https://example.test/post/1',
  creator: { name: 'Mara Lind', handle: '@mara' },
  body: 'The best tools disappear into the work. You stop noticing them the moment they start being good, and that is the whole point.',
  savedAt: '2026-10-20T12:00:00Z',
};

export const postTitled: CardItem = { ...post, id: 'post-2', title: 'Notes on tools' };
export const postWideVideo: CardItem = {
  ...post,
  id: 'post-3',
  picture: { ...wide, isVideo: true },
};
export const postTallVideo: CardItem = {
  ...post,
  id: 'post-4',
  picture: { url: 'https://example.test/tall.jpg', width: 900, height: 1125, isVideo: true },
};
export const postQuote: CardItem = {
  ...post,
  id: 'post-5',
  body: 'This.',
  quote: {
    creator: { name: 'Atlas Weekly', handle: '@atlas' },
    text: 'A field guide to getting lost.',
    picture: wide,
  },
};
export const postLink: CardItem = {
  ...post,
  id: 'post-6',
  body: 'It is here: example.test',
  link: 'example.test',
};
