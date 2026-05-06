/**
 * Tests for unified search response ranking and shaping.
 *
 * @vitest-environment miniflare
 */

import { describe, expect, it } from 'vitest';
import { ContentType, Provider, UserItemState } from '@zine/shared';

import {
  buildSearchResponse,
  type CreatorSearchRow,
  type PersonSearchRow,
  type SearchItemView,
} from './search';

const baseCreator: CreatorSearchRow = {
  id: 'creator_joe',
  name: 'Joe Rogan',
  normalizedName: 'joe rogan',
  handle: '@joerogan',
  imageUrl: 'https://example.com/joe.jpg',
  provider: Provider.SPOTIFY,
  description: 'Podcast host',
  externalUrl: 'https://open.spotify.com/show/joe',
  isSubscribed: true,
  subscriptionId: 'sub_joe',
  libraryItemCount: 12,
  latestPublishedAt: '2026-04-01T00:00:00Z',
};

const baseItem: SearchItemView = {
  id: 'user_item_1',
  itemId: 'item_1',
  title: 'Joe Rogan Experience #123',
  thumbnailUrl: null,
  canonicalUrl: 'https://example.com/episode',
  contentType: ContentType.PODCAST,
  provider: Provider.SPOTIFY,
  creator: 'Joe Rogan',
  creatorImageUrl: 'https://example.com/joe.jpg',
  creatorId: 'creator_joe',
  publisher: null,
  summary: null,
  duration: 3600,
  publishedAt: '2026-03-01T00:00:00Z',
  wordCount: null,
  readingTimeMinutes: null,
  state: UserItemState.BOOKMARKED,
  ingestedAt: '2026-03-02T00:00:00Z',
  bookmarkedAt: '2026-03-03T00:00:00Z',
  lastOpenedAt: null,
  progress: null,
  isFinished: false,
  finishedAt: null,
  tags: [],
};

const basePerson: PersonSearchRow = {
  id: 'person_joe',
  displayName: 'Joe Rogan',
  profileImageUrl: 'https://pbs.twimg.com/profile_images/joe.jpg',
  profileImageSource: 'X',
  xHandle: 'joerogan',
  itemCount: 7,
  latestSeenAt: 1777593600000,
  latestItemTitle: null,
};

describe('buildSearchResponse', () => {
  it('returns exact creator matches before matching library items', () => {
    const response = buildSearchResponse({
      query: 'Joe Rogan',
      creatorRows: [baseCreator],
      items: [baseItem],
      nextCursor: null,
    });

    expect(response.results.map((result) => result.type)).toEqual(['creator', 'item']);
    expect(response.results[0]).toMatchObject({
      type: 'creator',
      creatorId: 'creator_joe',
      name: 'Joe Rogan',
      isSubscribed: true,
      libraryItemCount: 12,
    });
    expect(response.sections.creators).toHaveLength(1);
    expect(response.sections.items).toHaveLength(1);
  });

  it('deduplicates creator rows while preserving subscription and library metadata', () => {
    const response = buildSearchResponse({
      query: 'joe',
      creatorRows: [
        {
          ...baseCreator,
          isSubscribed: false,
          subscriptionId: null,
          libraryItemCount: 3,
          latestPublishedAt: '2026-01-01T00:00:00Z',
        },
        {
          ...baseCreator,
          isSubscribed: true,
          subscriptionId: 'sub_joe',
          libraryItemCount: 0,
          latestPublishedAt: '2026-04-01T00:00:00Z',
        },
      ],
      items: [],
      nextCursor: null,
    });

    expect(response.sections.creators).toHaveLength(1);
    expect(response.sections.creators[0]).toMatchObject({
      creatorId: 'creator_joe',
      isSubscribed: true,
      subscriptionId: 'sub_joe',
      libraryItemCount: 3,
      latestPublishedAt: '2026-04-01T00:00:00Z',
    });
  });

  it('places person results after creators and before items', () => {
    const response = buildSearchResponse({
      query: 'Joe',
      creatorRows: [baseCreator],
      personRows: [basePerson],
      items: [baseItem],
      nextCursor: null,
    });

    expect(response.results.map((result) => result.type)).toEqual(['creator', 'person', 'item']);
    expect(response.sections.people[0]).toMatchObject({
      type: 'person',
      personId: 'person_joe',
      displayName: 'Joe Rogan',
      profileImageUrl: 'https://pbs.twimg.com/profile_images/joe.jpg',
      profileImageSource: 'X',
      xHandle: 'joerogan',
      itemCount: 7,
    });
  });
});
