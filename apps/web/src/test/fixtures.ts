import { ContentType, Provider } from '@zine/shared';

export function createLibraryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bookmark-1',
    title: 'Design systems at scale',
    creator: 'Zine Editorial',
    creatorId: 'creator-1',
    creatorImageUrl: 'https://images.zine.example/creator-1.png',
    thumbnailUrl: 'https://images.zine.example/bookmark-1.png',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    duration: 605,
    readingTimeMinutes: null,
    publisher: null,
    summary: '<p>A detailed walkthrough of stable design systems.</p>',
    canonicalUrl: 'https://zine.example/watch/design-systems-at-scale',
    publishedAt: '2025-02-18T09:45:00.000Z',
    bookmarkedAt: '2025-02-18T10:00:00.000Z',
    ingestedAt: '2025-02-18T10:00:00.000Z',
    isFinished: false,
    ...overrides,
  };
}

export function createCreator(overrides: Record<string, unknown> = {}) {
  return {
    id: 'creator-1',
    handle: 'zine-editorial',
    description: 'Hosted by Alice Example',
    ...overrides,
  };
}
