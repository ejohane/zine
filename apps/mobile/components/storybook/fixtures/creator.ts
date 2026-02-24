import type { LatestContentItem } from '@/components/creator/LatestContentCard';
import type { Creator, CreatorContentItem } from '@/hooks/use-creator';

export const creatorFixtures = {
  latestContentInternal: {
    providerId: 'yt-episode-201',
    title: 'Shipping product decisions faster with a stable design system',
    thumbnailUrl: 'https://picsum.photos/seed/zine-creator-internal/320/180',
    duration: 1460,
    publishedAt: '2026-02-20T12:30:00.000Z',
    url: 'https://youtube.com/watch?v=yt-episode-201',
    itemId: 'item-201',
    isBookmarked: false,
  },
  latestContentExternal: {
    providerId: 'yt-episode-202',
    title: 'Tradeoffs of strict component APIs in fast-moving teams',
    thumbnailUrl: 'https://picsum.photos/seed/zine-creator-external/320/180',
    duration: 980,
    publishedAt: '2026-02-18T09:15:00.000Z',
    url: 'https://youtube.com/watch?v=yt-episode-202',
    itemId: null,
    isBookmarked: false,
  },
  latestContentSaved: {
    providerId: 'sp-episode-88',
    title: 'Episode 88: Leading cross-platform mobile teams',
    thumbnailUrl: null,
    duration: 3210,
    publishedAt: '2026-02-16T16:45:00.000Z',
    url: 'https://open.spotify.com/episode/88',
    itemId: 'item-88',
    isBookmarked: true,
  },
} satisfies Record<string, LatestContentItem>;

export const creatorProfileFixture = {
  id: 'creator-design-weekly',
  name: 'Design Systems Weekly',
  imageUrl: 'https://picsum.photos/seed/zine-creator-profile/600/600',
  provider: 'YOUTUBE',
  providerCreatorId: 'UCzineDesignWeekly',
  description: 'Weekly breakdowns of design systems, product tradeoffs, and mobile team execution.',
  handle: 'designsystemsweekly',
  externalUrl: 'https://youtube.com/@designsystemsweekly',
  createdAt: 1_736_400_000_000,
  updatedAt: 1_737_100_000_000,
} satisfies Creator;

export const creatorLatestContentFixtures = {
  loaded: [
    {
      id: 'latest-1',
      title: 'Building resilient mobile architectures for scaling teams',
      thumbnailUrl: 'https://picsum.photos/seed/zine-latest-1/320/180',
      duration: 1200,
      publishedAt: 1_739_772_000_000,
      externalUrl: 'https://youtube.com/watch?v=latest-1',
      itemId: 'item-latest-1',
      isBookmarked: false,
    },
    {
      id: 'latest-2',
      title: 'How design tokens evolve without breaking products',
      thumbnailUrl: 'https://picsum.photos/seed/zine-latest-2/320/180',
      duration: 920,
      publishedAt: 1_739_685_600_000,
      externalUrl: 'https://youtube.com/watch?v=latest-2',
      itemId: null,
      isBookmarked: false,
    },
    {
      id: 'latest-3',
      title: 'Episode 63: Component API ergonomics in large orgs',
      thumbnailUrl: null,
      duration: 2600,
      publishedAt: 1_739_599_200_000,
      externalUrl: 'https://youtube.com/watch?v=latest-3',
      itemId: 'item-latest-3',
      isBookmarked: true,
    },
  ] satisfies CreatorContentItem[],
} as const;

type CreatorCollectionItemFixture = {
  id: string;
  title: string;
  creator: string;
  thumbnailUrl: string | null;
  contentType: string;
  provider: string;
  duration: number | null;
  readingTimeMinutes: number | null;
  bookmarkedAt: string | null;
  publishedAt: string | null;
  isFinished: boolean;
};

export const creatorCollectionFixtures = {
  publications: [
    {
      id: 'pub-1',
      title: 'Shipping faster with stable component APIs',
      creator: 'Design Systems Weekly',
      thumbnailUrl: 'https://picsum.photos/seed/zine-pub-1/320/180',
      contentType: 'VIDEO',
      provider: 'YOUTUBE',
      duration: 1320,
      readingTimeMinutes: null,
      bookmarkedAt: null,
      publishedAt: '2026-02-15T14:20:00.000Z',
      isFinished: false,
    },
    {
      id: 'pub-2',
      title: 'A practical guide to cross-platform product quality',
      creator: 'Design Systems Weekly',
      thumbnailUrl: null,
      contentType: 'ARTICLE',
      provider: 'WEB',
      duration: null,
      readingTimeMinutes: 12,
      bookmarkedAt: '2026-02-14T09:00:00.000Z',
      publishedAt: '2026-02-10T08:30:00.000Z',
      isFinished: true,
    },
  ] satisfies CreatorCollectionItemFixture[],
  bookmarks: [
    {
      id: 'bm-1',
      title: 'Leadership patterns for mobile platform teams',
      creator: 'Design Systems Weekly',
      thumbnailUrl: 'https://picsum.photos/seed/zine-bookmark-1/320/180',
      contentType: 'PODCAST',
      provider: 'SPOTIFY',
      duration: 3120,
      readingTimeMinutes: null,
      bookmarkedAt: '2026-02-21T10:05:00.000Z',
      publishedAt: '2026-02-18T11:30:00.000Z',
      isFinished: false,
    },
  ] satisfies CreatorCollectionItemFixture[],
} as const;
