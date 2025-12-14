/**
 * Mock Data for tRPC Development
 *
 * Provides hardcoded ItemView data for API development before D1 integration.
 * This allows building out the complete tRPC router structure and testing
 * UI flows end-to-end without a database connection.
 */

import { ContentType, Provider, UserItemState } from '@zine/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * ItemView represents the denormalized view of a user's item,
 * combining Item and UserItem data for efficient client rendering.
 */
export type ItemView = {
  /** UserItem ID */
  id: string;
  /** Canonical Item ID */
  itemId: string;
  title: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;
  contentType: ContentType;
  provider: Provider;
  creator: string;
  publisher: string | null;
  summary: string | null;
  duration: number | null;
  publishedAt: string | null;
  state: UserItemState;
  ingestedAt: string;
  bookmarkedAt: string | null;
  progress: { position: number; duration: number; percent: number } | null;
};

// ============================================================================
// Mock Data
// ============================================================================

export const MOCK_ITEMS: ItemView[] = [
  // =========================================================================
  // INBOX Items (awaiting triage)
  // =========================================================================
  {
    id: 'ui-001',
    itemId: 'item-001',
    title: 'How to Build a Second Brain',
    thumbnailUrl: 'https://picsum.photos/seed/brain/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=abc123',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Tiago Forte',
    publisher: null,
    summary:
      'A comprehensive guide to building a personal knowledge management system using the PARA method and progressive summarization.',
    duration: 3720, // 1h 2m
    publishedAt: '2024-01-15T10:00:00Z',
    state: UserItemState.INBOX,
    ingestedAt: '2024-12-10T08:30:00Z',
    bookmarkedAt: null,
    progress: null,
  },
  {
    id: 'ui-002',
    itemId: 'item-002',
    title: 'The Future of AI in Software Development',
    thumbnailUrl: 'https://picsum.photos/seed/aidev/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=def456',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Fireship',
    publisher: null,
    summary:
      'An exploration of how AI tools like GitHub Copilot and Claude are changing the way developers write code.',
    duration: 720, // 12m
    publishedAt: '2024-12-01T15:00:00Z',
    state: UserItemState.INBOX,
    ingestedAt: '2024-12-12T09:00:00Z',
    bookmarkedAt: null,
    progress: null,
  },
  {
    id: 'ui-003',
    itemId: 'item-003',
    title: 'Building Local-First Apps with Replicache',
    thumbnailUrl: 'https://picsum.photos/seed/localfirst/400/225',
    canonicalUrl: 'https://substack.com/article/local-first-replicache',
    contentType: ContentType.ARTICLE,
    provider: Provider.SUBSTACK,
    creator: 'James Long',
    publisher: 'Local First Dev',
    summary:
      'A deep dive into building offline-capable applications using Replicache for real-time sync.',
    duration: null,
    publishedAt: '2024-11-20T08:00:00Z',
    state: UserItemState.INBOX,
    ingestedAt: '2024-12-11T14:00:00Z',
    bookmarkedAt: null,
    progress: null,
  },
  {
    id: 'ui-004',
    itemId: 'item-004',
    title: 'Lex Fridman Podcast: Andrej Karpathy on Neural Networks',
    thumbnailUrl: 'https://picsum.photos/seed/karpathy/400/225',
    canonicalUrl: 'https://open.spotify.com/episode/karpathy123',
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    creator: 'Lex Fridman',
    publisher: 'Lex Fridman Podcast',
    summary:
      'Andrej Karpathy discusses the fundamentals of neural networks, GPT, and the future of AI.',
    duration: 10800, // 3h
    publishedAt: '2024-12-05T06:00:00Z',
    state: UserItemState.INBOX,
    ingestedAt: '2024-12-12T18:00:00Z',
    bookmarkedAt: null,
    progress: null,
  },

  // =========================================================================
  // BOOKMARKED Items (saved for later)
  // =========================================================================
  {
    id: 'ui-005',
    itemId: 'item-005',
    title: 'The Tim Ferriss Show: Naval Ravikant',
    thumbnailUrl: 'https://picsum.photos/seed/naval/400/225',
    canonicalUrl: 'https://open.spotify.com/episode/naval789',
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    creator: 'Tim Ferriss',
    publisher: 'The Tim Ferriss Show',
    summary:
      'Naval shares his mental models for wealth and happiness, discussing leverage, specific knowledge, and accountability.',
    duration: 7200, // 2h
    publishedAt: '2024-01-10T06:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-12-08T14:00:00Z',
    bookmarkedAt: '2024-12-09T09:15:00Z',
    progress: {
      position: 2400,
      duration: 7200,
      percent: 33,
    },
  },
  {
    id: 'ui-006',
    itemId: 'item-006',
    title: "React Server Components: A Deep Dive into Next.js 14's Architecture",
    thumbnailUrl: 'https://picsum.photos/seed/rsc/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=rsc456',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Theo Browne',
    publisher: null,
    summary:
      'Understanding how React Server Components work under the hood and best practices for Next.js 14 applications.',
    duration: 2700, // 45m
    publishedAt: '2024-11-15T14:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-11-16T10:00:00Z',
    bookmarkedAt: '2024-11-17T08:30:00Z',
    progress: {
      position: 1200,
      duration: 2700,
      percent: 44,
    },
  },
  {
    id: 'ui-007',
    itemId: 'item-007',
    title: 'The Art of Postgres: Advanced Query Optimization',
    thumbnailUrl: 'https://picsum.photos/seed/postgres/400/225',
    canonicalUrl: 'https://substack.com/article/postgres-optimization',
    contentType: ContentType.ARTICLE,
    provider: Provider.SUBSTACK,
    creator: 'Craig Kerstiens',
    publisher: 'Postgres Weekly',
    summary:
      'Learn advanced PostgreSQL query optimization techniques including EXPLAIN ANALYZE, indexing strategies, and query planning.',
    duration: null,
    publishedAt: '2024-10-20T09:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-10-21T12:00:00Z',
    bookmarkedAt: '2024-10-22T15:00:00Z',
    progress: null,
  },
  {
    id: 'ui-008',
    itemId: 'item-008',
    title: 'Huberman Lab: The Science of Sleep',
    thumbnailUrl: 'https://picsum.photos/seed/sleep/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=sleep789',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Andrew Huberman',
    publisher: 'Huberman Lab',
    summary:
      'Dr. Huberman explains the neuroscience of sleep, circadian rhythms, and science-based tools for improving sleep quality.',
    duration: 5400, // 1h 30m
    publishedAt: '2024-09-10T06:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-09-11T08:00:00Z',
    bookmarkedAt: '2024-09-12T19:00:00Z',
    progress: {
      position: 4500,
      duration: 5400,
      percent: 83,
    },
  },
  {
    id: 'ui-009',
    itemId: 'item-009',
    title: 'System Design Interview: Distributed Systems Fundamentals',
    thumbnailUrl: 'https://picsum.photos/seed/systemdesign/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=dist123',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Alex Xu',
    publisher: 'ByteByteGo',
    summary:
      'Essential concepts for system design interviews: CAP theorem, consistency models, partitioning, and replication strategies.',
    duration: 1800, // 30m
    publishedAt: '2024-11-01T10:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-11-02T07:00:00Z',
    bookmarkedAt: '2024-11-03T11:00:00Z',
    progress: null,
  },
  {
    id: 'ui-010',
    itemId: 'item-010',
    title: 'Acquired: The Complete History of NVIDIA',
    thumbnailUrl: 'https://picsum.photos/seed/nvidia/400/225',
    canonicalUrl: 'https://open.spotify.com/episode/nvidia456',
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    creator: 'Ben Gilbert & David Rosenthal',
    publisher: 'Acquired',
    summary:
      'The epic story of NVIDIA from gaming graphics cards to becoming the most valuable semiconductor company powering the AI revolution.',
    duration: 14400, // 4h
    publishedAt: '2024-08-15T05:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-08-16T09:00:00Z',
    bookmarkedAt: '2024-08-17T20:00:00Z',
    progress: {
      position: 7200,
      duration: 14400,
      percent: 50,
    },
  },
  {
    id: 'ui-011',
    itemId: 'item-011',
    title: 'Why SQLite is Perfect for Edge Computing',
    thumbnailUrl: 'https://picsum.photos/seed/sqlite/400/225',
    canonicalUrl: 'https://blog.example.com/sqlite-edge',
    contentType: ContentType.ARTICLE,
    provider: Provider.RSS,
    creator: 'Simon Willison',
    publisher: "Simon Willison's Weblog",
    summary:
      'Exploring why SQLite is becoming the database of choice for edge computing platforms like Cloudflare D1 and Turso.',
    duration: null,
    publishedAt: '2024-12-01T12:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-12-02T08:00:00Z',
    bookmarkedAt: '2024-12-03T10:00:00Z',
    progress: null,
  },
  {
    id: 'ui-012',
    itemId: 'item-012',
    title: 'Hot Takes on TypeScript 5.3',
    thumbnailUrl: 'https://picsum.photos/seed/typescript/400/225',
    canonicalUrl: 'https://twitter.com/user/status/ts53',
    contentType: ContentType.POST,
    provider: Provider.RSS,
    creator: 'Matt Pocock',
    publisher: null,
    summary:
      'Quick thoughts on the new features in TypeScript 5.3 and what they mean for developers.',
    duration: null,
    publishedAt: '2024-11-25T16:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-11-26T09:00:00Z',
    bookmarkedAt: '2024-11-27T14:00:00Z',
    progress: null,
  },

  // =========================================================================
  // ARCHIVED Items (consumed/dismissed)
  // =========================================================================
  {
    id: 'ui-013',
    itemId: 'item-013',
    title: 'Introduction to Cloudflare Workers',
    thumbnailUrl: 'https://picsum.photos/seed/cfworkers/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=cfwork123',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Cloudflare',
    publisher: 'Cloudflare TV',
    summary:
      'Getting started with Cloudflare Workers: serverless computing at the edge with JavaScript and TypeScript.',
    duration: 1200, // 20m
    publishedAt: '2024-06-01T10:00:00Z',
    state: UserItemState.ARCHIVED,
    ingestedAt: '2024-06-02T08:00:00Z',
    bookmarkedAt: '2024-06-03T09:00:00Z',
    progress: {
      position: 1200,
      duration: 1200,
      percent: 100,
    },
  },
  {
    id: 'ui-014',
    itemId: 'item-014',
    title: 'My First Million: How to Find Business Ideas',
    thumbnailUrl: 'https://picsum.photos/seed/mfm/400/225',
    canonicalUrl: 'https://open.spotify.com/episode/mfm789',
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    creator: 'Sam Parr & Shaan Puri',
    publisher: 'My First Million',
    summary:
      'Brainstorming session on finding million-dollar business ideas using trend analysis and market gaps.',
    duration: 3600, // 1h
    publishedAt: '2024-07-20T05:00:00Z',
    state: UserItemState.ARCHIVED,
    ingestedAt: '2024-07-21T10:00:00Z',
    bookmarkedAt: '2024-07-22T08:00:00Z',
    progress: {
      position: 3600,
      duration: 3600,
      percent: 100,
    },
  },
  {
    id: 'ui-015',
    itemId: 'item-015',
    title: 'Understanding the Bun Runtime',
    thumbnailUrl: 'https://picsum.photos/seed/bun/400/225',
    canonicalUrl: 'https://substack.com/article/bun-runtime',
    contentType: ContentType.ARTICLE,
    provider: Provider.SUBSTACK,
    creator: 'Jarred Sumner',
    publisher: 'Bun Blog',
    summary:
      'A technical overview of the Bun runtime: how it achieves performance and Node.js compatibility.',
    duration: null,
    publishedAt: '2024-05-15T08:00:00Z',
    state: UserItemState.ARCHIVED,
    ingestedAt: '2024-05-16T12:00:00Z',
    bookmarkedAt: '2024-05-17T10:00:00Z',
    progress: null,
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get items in INBOX state, sorted by ingest date (newest first)
 */
export function getMockInboxItems(): ItemView[] {
  return MOCK_ITEMS.filter((item) => item.state === UserItemState.INBOX).sort((a, b) =>
    b.ingestedAt.localeCompare(a.ingestedAt)
  );
}

/**
 * Get items in BOOKMARKED state, sorted by bookmark date (newest first)
 */
export function getMockLibraryItems(): ItemView[] {
  return MOCK_ITEMS.filter((item) => item.state === UserItemState.BOOKMARKED).sort((a, b) =>
    (b.bookmarkedAt ?? '').localeCompare(a.bookmarkedAt ?? '')
  );
}

/**
 * Get home screen data with curated sections
 */
export function getMockHomeData() {
  const bookmarked = getMockLibraryItems();

  return {
    /** Most recently bookmarked items */
    recentBookmarks: bookmarked.slice(0, 5),

    /** Items with progress (for "Jump Back In" feature) */
    jumpBackIn: bookmarked.filter((item) => item.progress !== null).slice(0, 5),

    /** Items grouped by content type */
    byContentType: {
      videos: bookmarked.filter((item) => item.contentType === ContentType.VIDEO).slice(0, 5),
      podcasts: bookmarked.filter((item) => item.contentType === ContentType.PODCAST).slice(0, 5),
      articles: bookmarked.filter((item) => item.contentType === ContentType.ARTICLE).slice(0, 5),
    },
  };
}

/**
 * Get archived items, sorted by bookmark date (newest first)
 */
export function getMockArchivedItems(): ItemView[] {
  return MOCK_ITEMS.filter((item) => item.state === UserItemState.ARCHIVED).sort((a, b) =>
    (b.bookmarkedAt ?? '').localeCompare(a.bookmarkedAt ?? '')
  );
}

/**
 * Find a specific item by ID
 */
export function getMockItemById(id: string): ItemView | undefined {
  return MOCK_ITEMS.find((item) => item.id === id);
}
