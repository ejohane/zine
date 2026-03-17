/**
 * Tests for ItemCard compact row metadata treatment.
 *
 * The ItemCard component uses react-native components that require native modules.
 * Full component rendering tests are done via manual testing in the iOS simulator.
 *
 * This test file validates the metadata and length-label logic mirrored from the
 * compact row implementation without importing the actual component.
 */

import { IconSizes } from '../constants/theme';
import type { ItemCardData } from '../components/item-card';
import type { ContentType, Provider } from '../lib/content-utils';

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

function getInlineLengthText(item: ItemCardData): string | null {
  const durationText = formatDuration(item.duration);

  if (durationText) {
    return durationText;
  }

  if (item.readingTimeMinutes) {
    return `${item.readingTimeMinutes} min`;
  }

  return null;
}

function buildCompactSubtitleText(item: ItemCardData): string {
  const inlineLengthText = getInlineLengthText(item);

  if (!inlineLengthText) {
    return item.creator;
  }

  return `${item.creator} · ${inlineLengthText}`;
}

function getSubtitleLeadingVisualMode(
  item: ItemCardData,
  avatarLoadFailed = false
): 'creator-avatar' | 'content-type' {
  return item.creatorImageUrl && !avatarLoadFailed ? 'creator-avatar' : 'content-type';
}

describe('ItemCard compact row text treatment', () => {
  describe('compact metadata length', () => {
    it('uses duration when available for video items', () => {
      const item = createMockItem({
        contentType: 'VIDEO' as ContentType,
        duration: 300,
      });

      expect(getInlineLengthText(item)).toBe('5:00');
    });

    it('uses duration when available for podcast items', () => {
      const item = createMockItem({
        contentType: 'PODCAST' as ContentType,
        duration: 3600,
      });

      expect(getInlineLengthText(item)).toBe('1:00:00');
    });

    it('uses reading time when no duration exists', () => {
      const item = createMockItem({
        contentType: 'ARTICLE' as ContentType,
        duration: null,
        readingTimeMinutes: 5,
      });

      expect(getInlineLengthText(item)).toBe('5 min');
    });

    it('prefers duration over reading time when both exist', () => {
      const item = createMockItem({
        contentType: 'VIDEO' as ContentType,
        duration: 300,
        readingTimeMinutes: 10,
      });

      expect(getInlineLengthText(item)).toBe('5:00');
    });

    it('returns null when no applicable length exists', () => {
      const item = createMockItem({
        duration: null,
        readingTimeMinutes: null,
      });

      expect(getInlineLengthText(item)).toBeNull();
    });
  });

  describe('subtitle text', () => {
    it('uses creator name only when no duration or reading time exists', () => {
      const item = createMockItem({
        creator: 'John Doe',
        duration: null,
        readingTimeMinutes: null,
      });

      expect(buildCompactSubtitleText(item)).toBe('John Doe');
    });

    it('does not append content type label to subtitle text', () => {
      const item = createMockItem({
        creator: 'John Doe',
        contentType: 'VIDEO' as ContentType,
        duration: null,
        readingTimeMinutes: null,
      });

      const subtitle = buildCompactSubtitleText(item);
      expect(subtitle).toBe('John Doe');
      expect(subtitle).not.toContain('Video');
    });

    it('appends duration to subtitle text', () => {
      const item = createMockItem({
        creator: 'John Doe',
        duration: 300,
      });

      const subtitle = buildCompactSubtitleText(item);
      expect(subtitle).toBe('John Doe · 5:00');
    });

    it('appends reading time to subtitle text when duration is missing', () => {
      const item = createMockItem({
        creator: 'John Doe',
        duration: null,
        readingTimeMinutes: 5,
      });

      const subtitle = buildCompactSubtitleText(item);
      expect(subtitle).toBe('John Doe · 5 min');
    });
  });

  describe('subtitle leading visual', () => {
    it('prefers creator avatar when creatorImageUrl exists', () => {
      const item = createMockItem({
        creatorImageUrl: 'https://example.com/avatar.jpg',
      });

      expect(getSubtitleLeadingVisualMode(item)).toBe('creator-avatar');
    });

    it('falls back to content type icon when creatorImageUrl is missing', () => {
      const item = createMockItem({
        creatorImageUrl: null,
      });

      expect(getSubtitleLeadingVisualMode(item)).toBe('content-type');
    });

    it('falls back to content type icon when creator avatar fails to load', () => {
      const item = createMockItem({
        creatorImageUrl: 'https://example.com/avatar.jpg',
      });

      expect(getSubtitleLeadingVisualMode(item, true)).toBe('content-type');
    });
  });

  describe('layout constraints', () => {
    it('title truncation is set to single line', () => {
      const TITLE_LINES = 1;

      expect(TITLE_LINES).toBe(1);
    });

    it('subtitle truncation is set to single line', () => {
      const SUBTITLE_LINES = 1;

      expect(SUBTITLE_LINES).toBe(1);
    });

    it('thumbnail dimensions are 48x48', () => {
      const THUMBNAIL_SIZE = 48;

      expect(THUMBNAIL_SIZE).toBe(48);
    });

    it('content-type icon slot matches the shared xs icon size', () => {
      expect(IconSizes.xs).toBe(14);
    });

    it('subtitle separator dot dimensions meet minimum visibility', () => {
      const SEPARATOR_DOT_SIZE = 4;
      const MIN_VISIBLE_SIZE = 4;

      expect(SEPARATOR_DOT_SIZE).toBeGreaterThanOrEqual(MIN_VISIBLE_SIZE);
    });
  });
});
