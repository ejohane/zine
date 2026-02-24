import { ContentType, Provider } from '@zine/shared';

import type { LinkPreview } from '@/hooks/use-bookmarks';

export const linkPreviewFixtures = {
  video: {
    provider: Provider.YOUTUBE,
    contentType: ContentType.VIDEO,
    providerId: 'yt-123',
    title: 'System design for mobile apps: practical patterns',
    creator: 'Zine Engineering',
    creatorImageUrl: 'https://picsum.photos/seed/zine-creator/48/48',
    thumbnailUrl: 'https://picsum.photos/seed/zine-link-video/640/360',
    duration: 980,
    canonicalUrl: 'https://youtube.com/watch?v=yt-123',
    source: 'provider_api',
    description: 'A concise overview of scalable mobile architecture patterns.',
  },
  article: {
    provider: Provider.SUBSTACK,
    contentType: ContentType.ARTICLE,
    providerId: 'substack-42',
    title: 'Design tokens that survive product growth',
    creator: 'System Thinking',
    thumbnailUrl: 'https://picsum.photos/seed/zine-link-article/640/360',
    duration: null,
    canonicalUrl: 'https://example.com/design-tokens',
    source: 'article_extractor',
    siteName: 'Example Journal',
    readingTimeMinutes: 9,
    hasArticleContent: true,
    description: 'A practical guide to token governance and adoption.',
  },
  stress: {
    provider: Provider.X,
    contentType: ContentType.POST,
    providerId: 'x-777',
    title:
      'Follow @zine for updates and read https://zine.dev/blog for roadmap details plus docs at docs.zine.dev for implementation notes.',
    creator: 'Zine',
    thumbnailUrl: null,
    duration: null,
    canonicalUrl: 'https://x.com/zine/status/777',
    source: 'fxtwitter',
    description: 'Stress test for mention and URL parsing in preview titles.',
  },
} satisfies Record<string, LinkPreview>;
