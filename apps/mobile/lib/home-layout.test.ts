import {
  getFeaturedGridItemWidth,
  getValidFeaturedGridItems,
  getVisibleFeaturedGridItems,
} from './home-layout';

describe('getValidFeaturedGridItems', () => {
  it('returns an empty array when there are no items', () => {
    expect(getValidFeaturedGridItems([])).toEqual([]);
  });

  it('returns an empty array when there is only one item', () => {
    expect(getValidFeaturedGridItems([1])).toEqual([]);
  });

  it('keeps even counts up to six', () => {
    expect(getValidFeaturedGridItems([1, 2])).toEqual([1, 2]);
    expect(getValidFeaturedGridItems([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(getValidFeaturedGridItems([1, 2, 3, 4, 5, 6])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('rounds odd counts down to the nearest even count', () => {
    expect(getValidFeaturedGridItems([1, 2, 3])).toEqual([1, 2]);
    expect(getValidFeaturedGridItems([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4]);
  });

  it('caps results at six items', () => {
    expect(getValidFeaturedGridItems([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 2, 3, 4, 5, 6]);
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

  it('preserves the even-count cap after filtering', () => {
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
