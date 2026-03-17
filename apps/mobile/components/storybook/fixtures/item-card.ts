import type { ItemCardData } from '@/components/item-card';

export const itemCardFixtures = {
  video: {
    id: 'video-1',
    title: 'Design systems at scale for fast mobile teams',
    creator: 'Design Systems Weekly',
    creatorImageUrl: 'https://picsum.photos/seed/zine-creator-video/48/48',
    thumbnailUrl: 'https://picsum.photos/seed/zine-video/640/360',
    contentType: 'VIDEO',
    provider: 'YOUTUBE',
    duration: 1280,
  },
  podcast: {
    id: 'podcast-1',
    title: 'Episode 142: Product taste and decision quality',
    creator: 'The Product Craft Podcast',
    creatorImageUrl: 'https://picsum.photos/seed/zine-creator-podcast/48/48',
    thumbnailUrl: 'https://picsum.photos/seed/zine-podcast/640/640',
    contentType: 'PODCAST',
    provider: 'SPOTIFY',
    duration: 3240,
  },
  article: {
    id: 'article-1',
    title: 'How to keep component APIs stable while evolving implementation details',
    creator: 'Zine Editorial',
    creatorImageUrl: 'https://picsum.photos/seed/zine-creator-article/48/48',
    thumbnailUrl: 'https://picsum.photos/seed/zine-article/640/360',
    contentType: 'ARTICLE',
    provider: 'SUBSTACK',
    readingTimeMinutes: 11,
  },
  creatorFallback: {
    id: 'creator-fallback-1',
    title: 'Missing cover art should fall back to the creator image',
    creator: 'Fallback Media Weekly',
    creatorImageUrl: 'https://picsum.photos/seed/zine-creator-fallback/640/640',
    thumbnailUrl: null,
    contentType: 'PODCAST',
    provider: 'SPOTIFY',
    duration: 1560,
  },
  stress: {
    id: 'stress-1',
    title:
      'Very long stress title for validation across all breakpoints and edge cases where content overflows expected space in dense list contexts',
    creator:
      'Long Creator Name That Should Truncate In Compact And Horizontal Layouts Without Breaking Alignment',
    thumbnailUrl: null,
    contentType: 'POST',
    provider: 'WEB',
    readingTimeMinutes: 18,
  },
} satisfies Record<string, ItemCardData>;
