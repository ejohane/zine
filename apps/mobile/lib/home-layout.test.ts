import { getValidFeaturedGridItems } from './home-layout';

describe('getValidFeaturedGridItems', () => {
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
