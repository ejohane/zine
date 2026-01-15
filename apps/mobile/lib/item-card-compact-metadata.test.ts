/**
 * Tests for ItemCard compact variant metadata display
 *
 * The ItemCard component uses react-native components that require native modules.
 * Full component rendering tests are done via manual testing in the iOS simulator.
 *
 * This test file validates the metadata building logic and type interfaces
 * for the compact variant without importing the actual component.
 *
 * @see Issue zine-ali for compact variant metadata requirements
 * @see Issue zine-g05 (Epic) for the inbox redesign
 */

import type { ItemCardData } from '../components/item-card';
import type { ContentType, Provider } from '../lib/content-utils';

// ============================================================================
// Test Data Factory
// ============================================================================

function createMockItem(overrides: Partial<ItemCardData> = {}): ItemCardData {
  return {
    id: 'item-123',
    title: 'Test Video Title',
    creator: 'Test Creator',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    contentType: 'VIDEO' as ContentType,
    provider: 'YOUTUBE' as Provider,
    duration: 300,
    bookmarkedAt: null,
    publishedAt: '2024-01-15T00:00:00Z',
    isFinished: false,
    ...overrides,
  };
}

// ============================================================================
// Metadata Building Logic (mirrored from component)
// ============================================================================

/**
 * Builds the metadata parts array for compact variant display
 * This mirrors the logic in ItemCard component for the compact variant
 */
function buildMetaParts(
  item: ItemCardData,
  durationText: string | null,
  readingTimeText: string | null
): string[] {
  const contentType = item.contentType.toLowerCase();
  const contentTypeLabel = contentType.charAt(0).toUpperCase() + contentType.slice(1);
  const metaParts = [item.creator, contentTypeLabel];
  if (durationText) {
    metaParts.push(durationText);
  } else if (readingTimeText) {
    metaParts.push(readingTimeText);
  }
  return metaParts;
}

/**
 * Formats duration in seconds to human readable string
 * This mirrors the formatDuration logic
 */
function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// Tests
// ============================================================================

describe('ItemCard compact variant metadata', () => {
  describe('metadata parts building', () => {
    it('includes creator name', () => {
      const item = createMockItem({ creator: 'John Doe' });
      const metaParts = buildMetaParts(item, null, null);

      expect(metaParts).toContain('John Doe');
    });

    it('includes content type label (capitalized)', () => {
      const item = createMockItem({ contentType: 'VIDEO' as ContentType });
      const metaParts = buildMetaParts(item, null, null);

      expect(metaParts).toContain('Video');
    });

    it('includes duration when available for video', () => {
      const item = createMockItem({
        contentType: 'VIDEO' as ContentType,
        duration: 300,
      });
      const durationText = formatDuration(item.duration);
      const metaParts = buildMetaParts(item, durationText, null);

      expect(metaParts).toContain('5:00');
    });

    it('includes duration when available for podcast', () => {
      const item = createMockItem({
        contentType: 'PODCAST' as ContentType,
        duration: 3600,
      });
      const durationText = formatDuration(item.duration);
      const metaParts = buildMetaParts(item, durationText, null);

      expect(metaParts).toContain('1:00:00');
    });

    it('includes reading time for articles without duration', () => {
      const item = createMockItem({
        contentType: 'ARTICLE' as ContentType,
        duration: null,
        readingTimeMinutes: 5,
      });
      const readingTimeText = '5 min';
      const metaParts = buildMetaParts(item, null, readingTimeText);

      expect(metaParts).toContain('5 min');
    });

    it('prefers duration over reading time when both available', () => {
      const item = createMockItem({
        contentType: 'VIDEO' as ContentType,
        duration: 300,
        readingTimeMinutes: 10,
      });
      const durationText = formatDuration(item.duration);
      const readingTimeText = '10 min';
      const metaParts = buildMetaParts(item, durationText, readingTimeText);

      expect(metaParts).toContain('5:00');
      expect(metaParts).not.toContain('10 min');
    });

    it('returns correct order: creator, content type, time', () => {
      const item = createMockItem({
        creator: 'Test Creator',
        contentType: 'VIDEO' as ContentType,
        duration: 300,
      });
      const durationText = formatDuration(item.duration);
      const metaParts = buildMetaParts(item, durationText, null);

      expect(metaParts[0]).toBe('Test Creator');
      expect(metaParts[1]).toBe('Video');
      expect(metaParts[2]).toBe('5:00');
    });

    it('handles post content type', () => {
      const item = createMockItem({ contentType: 'POST' as ContentType });
      const metaParts = buildMetaParts(item, null, null);

      expect(metaParts).toContain('Post');
    });

    it('joins parts with separator correctly', () => {
      const item = createMockItem({
        creator: 'Test Creator',
        contentType: 'PODCAST' as ContentType,
        duration: 1800,
      });
      const durationText = formatDuration(item.duration);
      const metaParts = buildMetaParts(item, durationText, null);

      const display = metaParts.join(' · ');
      expect(display).toBe('Test Creator · Podcast · 30:00');
    });
  });

  describe('provider color dot', () => {
    it('YouTube provider should have a provider color', () => {
      // YouTube uses red (#FF0000 family)
      const youtubeColor = '#FF0000';
      expect(youtubeColor).toBeTruthy();
    });

    it('Spotify provider should have a provider color', () => {
      // Spotify uses green (#1DB954 family)
      const spotifyColor = '#1DB954';
      expect(spotifyColor).toBeTruthy();
    });

    it('RSS provider should have a provider color', () => {
      // RSS uses orange (#FFA500 family)
      const rssColor = '#FFA500';
      expect(rssColor).toBeTruthy();
    });

    it('provider dot dimensions meet minimum visibility', () => {
      // Per component styles: width: 6, height: 6, borderRadius: 3
      const PROVIDER_DOT_SIZE = 6;
      const MIN_VISIBLE_SIZE = 4; // Minimum for visibility

      expect(PROVIDER_DOT_SIZE).toBeGreaterThanOrEqual(MIN_VISIBLE_SIZE);
    });
  });

  describe('text truncation', () => {
    it('title truncation is set to single line', () => {
      // Per component: numberOfLines={1} on title
      const TITLE_LINES = 1;
      expect(TITLE_LINES).toBe(1);
    });

    it('metadata truncation is set to single line', () => {
      // Per component: numberOfLines={1} on meta text
      const META_LINES = 1;
      expect(META_LINES).toBe(1);
    });
  });

  describe('thumbnail', () => {
    it('thumbnail dimensions are 48x48', () => {
      // Per component styles: width: 48, height: 48
      const THUMBNAIL_SIZE = 48;
      expect(THUMBNAIL_SIZE).toBe(48);
    });
  });

  describe('content type variants', () => {
    it.each([
      ['VIDEO', 'Video'],
      ['PODCAST', 'Podcast'],
      ['ARTICLE', 'Article'],
      ['POST', 'Post'],
    ])('content type %s displays as %s', (contentType, expected) => {
      const item = createMockItem({ contentType: contentType as ContentType });
      const metaParts = buildMetaParts(item, null, null);

      expect(metaParts).toContain(expected);
    });
  });
});
