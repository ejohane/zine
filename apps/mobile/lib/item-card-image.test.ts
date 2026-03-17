import { getItemCardImageCandidates, normalizeItemCardImageUrl } from './item-card-image';

jest.mock('@/components/icons', () => ({
  HeadphonesIcon: 'HeadphonesIcon',
  VideoIcon: 'VideoIcon',
  ArticleIcon: 'ArticleIcon',
  PostIcon: 'PostIcon',
}));

describe('item card image selection', () => {
  describe('normalizeItemCardImageUrl', () => {
    it('upgrades YouTube image sizes', () => {
      expect(normalizeItemCardImageUrl('https://yt3.ggpht.com/ytc/abc123=s88-c-k')).toBe(
        'https://yt3.ggpht.com/ytc/abc123=s800-c-k'
      );
    });

    it('returns null for empty values', () => {
      expect(normalizeItemCardImageUrl(null)).toBeNull();
      expect(normalizeItemCardImageUrl(undefined)).toBeNull();
    });
  });

  describe('getItemCardImageCandidates', () => {
    it('prefers the cover image before the creator image', () => {
      expect(
        getItemCardImageCandidates({
          thumbnailUrl: 'https://example.com/cover.jpg',
          creatorImageUrl: 'https://example.com/creator.jpg',
        })
      ).toEqual(['https://example.com/cover.jpg', 'https://example.com/creator.jpg']);
    });

    it('falls back to the creator image when the cover image is missing', () => {
      expect(
        getItemCardImageCandidates({
          thumbnailUrl: null,
          creatorImageUrl: 'https://example.com/creator.jpg',
        })
      ).toEqual(['https://example.com/creator.jpg']);
    });

    it('returns no image candidates when neither image exists', () => {
      expect(
        getItemCardImageCandidates({
          thumbnailUrl: null,
          creatorImageUrl: null,
        })
      ).toEqual([]);
    });

    it('deduplicates identical cover and creator image urls', () => {
      expect(
        getItemCardImageCandidates({
          thumbnailUrl: 'https://example.com/shared.jpg',
          creatorImageUrl: 'https://example.com/shared.jpg',
        })
      ).toEqual(['https://example.com/shared.jpg']);
    });
  });
});
