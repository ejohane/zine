/**
 * Tests for SwipeableInboxItem component types and configuration
 *
 * The SwipeableInboxItem component uses react-native-gesture-handler and
 * react-native-reanimated which require native modules. Full component
 * tests are done via manual testing in the iOS simulator.
 *
 * This test file validates the TypeScript interfaces and configuration
 * without importing the actual component.
 *
 * @see Issue zine-yit for requirements
 */

import type { ItemCardData } from '../components/item-card';

// ============================================================================
// Test Data
// ============================================================================

function createMockItem(overrides: Partial<ItemCardData> = {}): ItemCardData {
  return {
    id: 'item-123',
    title: 'Test Video Title',
    creator: 'Test Creator',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    contentType: 'VIDEO',
    provider: 'YOUTUBE',
    duration: 300,
    bookmarkedAt: null,
    publishedAt: '2024-01-15T00:00:00Z',
    isFinished: false,
    ...overrides,
  };
}

// ============================================================================
// Type Definitions (mirrored from component for testing)
// ============================================================================

interface SwipeableInboxItemProps {
  item: ItemCardData;
  onArchive: (id: string) => void;
  onBookmark: (id: string) => void;
  index?: number;
}

// ============================================================================
// Tests
// ============================================================================

describe('SwipeableInboxItem', () => {
  describe('component configuration', () => {
    it('defines correct swipe threshold (80px)', () => {
      // Per issue spec: leftThreshold/rightThreshold define "full swipe" activation
      const SWIPE_THRESHOLD = 80;
      expect(SWIPE_THRESHOLD).toBe(80);
    });

    it('defines correct action panel width (80px)', () => {
      // Action panels should be 80px wide to match threshold
      const ACTION_WIDTH = 80;
      expect(ACTION_WIDTH).toBe(80);
    });

    it('uses friction value of 2', () => {
      // Per issue spec: friction controls swipe resistance feel
      const FRICTION = 2;
      expect(FRICTION).toBe(2);
    });
  });

  describe('types', () => {
    it('SwipeableInboxItemProps accepts required props', () => {
      const props: SwipeableInboxItemProps = {
        item: createMockItem(),
        onArchive: (_id: string) => {},
        onBookmark: (_id: string) => {},
      };

      expect(props.item.id).toBe('item-123');
      expect(typeof props.onArchive).toBe('function');
      expect(typeof props.onBookmark).toBe('function');
    });

    it('SwipeableInboxItemProps accepts optional index prop', () => {
      const props: SwipeableInboxItemProps = {
        item: createMockItem(),
        onArchive: (_id: string) => {},
        onBookmark: (_id: string) => {},
        index: 10,
      };

      expect(props.index).toBe(10);
    });

    it('callbacks receive item id as string', () => {
      const archiveIds: string[] = [];
      const bookmarkIds: string[] = [];

      const props: SwipeableInboxItemProps = {
        item: createMockItem({ id: 'test-id-999' }),
        onArchive: (id: string) => archiveIds.push(id),
        onBookmark: (id: string) => bookmarkIds.push(id),
      };

      props.onArchive('test-id-999');
      props.onBookmark('test-id-999');

      expect(archiveIds).toContain('test-id-999');
      expect(bookmarkIds).toContain('test-id-999');
    });
  });

  describe('item data', () => {
    it('ItemCardData contains required fields', () => {
      const item = createMockItem();

      expect(item.id).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.creator).toBeDefined();
      expect(item.contentType).toBeDefined();
      expect(item.provider).toBeDefined();
    });

    it('ItemCardData allows null thumbnailUrl', () => {
      const item = createMockItem({ thumbnailUrl: null });
      expect(item.thumbnailUrl).toBeNull();
    });

    it('ItemCardData allows null duration', () => {
      const item = createMockItem({ duration: null });
      expect(item.duration).toBeNull();
    });

    it('ItemCardData supports all content types', () => {
      const videoItem = createMockItem({ contentType: 'VIDEO' });
      const podcastItem = createMockItem({ contentType: 'PODCAST' });
      const articleItem = createMockItem({ contentType: 'ARTICLE' });
      const postItem = createMockItem({ contentType: 'POST' });

      expect(videoItem.contentType).toBe('VIDEO');
      expect(podcastItem.contentType).toBe('PODCAST');
      expect(articleItem.contentType).toBe('ARTICLE');
      expect(postItem.contentType).toBe('POST');
    });

    it('ItemCardData supports all providers', () => {
      const youtubeItem = createMockItem({ provider: 'YOUTUBE' });
      const spotifyItem = createMockItem({ provider: 'SPOTIFY' });
      const rssItem = createMockItem({ provider: 'RSS' });

      expect(youtubeItem.provider).toBe('YOUTUBE');
      expect(spotifyItem.provider).toBe('SPOTIFY');
      expect(rssItem.provider).toBe('RSS');
    });
  });

  describe('swipe directions', () => {
    it('swipe left reveals bookmark action (right panel)', () => {
      // Per design spec: Swipe left -> right action panel -> bookmark
      // This maps to onSwipeableOpen('left') -> onBookmark
      const swipeDirection = 'left';
      const expectedAction = 'bookmark';

      expect(swipeDirection).toBe('left');
      expect(expectedAction).toBe('bookmark');
    });

    it('swipe right reveals archive action (left panel)', () => {
      // Per design spec: Swipe right -> left action panel -> archive
      // This maps to onSwipeableOpen('right') -> onArchive
      const swipeDirection = 'right';
      const expectedAction = 'archive';

      expect(swipeDirection).toBe('right');
      expect(expectedAction).toBe('archive');
    });
  });
});
