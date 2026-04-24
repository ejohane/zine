import {
  getFeaturedGridItemWidth,
  getValidFeaturedGridItems,
  getVisibleFeaturedGridItems,
} from './home-layout';

describe('getValidFeaturedGridItems', () => {
  it('returns an empty array when there are no items', () => {
    expect(getValidFeaturedGridItems([])).toEqual([]);
  });

  it('keeps a single item when there is only one item', () => {
    expect(getValidFeaturedGridItems([1])).toEqual([1]);
  });

  it('keeps counts up to six', () => {
    expect(getValidFeaturedGridItems([1, 2])).toEqual([1, 2]);
    expect(getValidFeaturedGridItems([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(getValidFeaturedGridItems([1, 2, 3, 4, 5, 6])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('preserves odd counts', () => {
    expect(getValidFeaturedGridItems([1, 2, 3])).toEqual([1, 2, 3]);
    expect(getValidFeaturedGridItems([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });

  it('caps results at six items', () => {
    expect(getValidFeaturedGridItems(Array.from({ length: 8 }, (_, index) => index + 1))).toEqual(
      Array.from({ length: 6 }, (_, index) => index + 1)
    );
  });
});

describe('getVisibleFeaturedGridItems', () => {
  const items = [
    { id: 'article-1', contentType: 'article' },
    { id: 'article-2', contentType: 'article' },
    { id: 'article-3', contentType: 'article' },
    { id: 'article-4', contentType: 'article' },
    { id: 'article-5', contentType: 'article' },
    { id: 'article-6', contentType: 'article' },
    { id: 'video-1', contentType: 'video' },
    { id: 'video-2', contentType: 'video' },
  ] as const;

  it('filters before truncating so later matches can still fill the grid', () => {
    expect(getVisibleFeaturedGridItems(items, 'video')).toEqual([
      { id: 'video-1', contentType: 'video' },
      { id: 'video-2', contentType: 'video' },
    ]);
  });

  it('preserves later filtered matches up to the visual cap', () => {
    expect(getVisibleFeaturedGridItems(items, 'article')).toEqual([
      { id: 'article-1', contentType: 'article' },
      { id: 'article-2', contentType: 'article' },
      { id: 'article-3', contentType: 'article' },
      { id: 'article-4', contentType: 'article' },
      { id: 'article-5', contentType: 'article' },
      { id: 'article-6', contentType: 'article' },
    ]);
  });
});

describe('getFeaturedGridItemWidth', () => {
  it('splits the available width into two columns after subtracting the gap', () => {
    expect(getFeaturedGridItemWidth(358, 16)).toBe(171);
  });

  it('clamps negative widths to zero', () => {
    expect(getFeaturedGridItemWidth(8, 16)).toBe(0);
  });
});
