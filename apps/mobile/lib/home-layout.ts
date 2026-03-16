const MAX_FEATURED_GRID_ITEMS = 6;

export function getValidFeaturedGridItems<T>(items: T[]): T[] {
  const cappedItems = items.slice(0, MAX_FEATURED_GRID_ITEMS);
  const evenCount = cappedItems.length - (cappedItems.length % 2);

  return cappedItems.slice(0, evenCount);
}
