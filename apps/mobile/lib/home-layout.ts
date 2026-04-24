const MAX_FEATURED_GRID_ITEMS = 6;
const FEATURED_GRID_COLUMNS = 2;

interface FeaturedGridItem {
  contentType: string;
}

export function getValidFeaturedGridItems<T>(items: readonly T[]): T[] {
  return items.slice(0, MAX_FEATURED_GRID_ITEMS);
}

export function getFeaturedGridItemWidth(containerWidth: number, gap: number): number {
  return Math.max(0, (containerWidth - gap * (FEATURED_GRID_COLUMNS - 1)) / FEATURED_GRID_COLUMNS);
}

export function getVisibleFeaturedGridItems<T extends FeaturedGridItem>(
  items: readonly T[],
  contentTypeFilter: string | null
): T[] {
  const visibleItems =
    contentTypeFilter === null
      ? items
      : items.filter((item) => item.contentType === contentTypeFilter);

  return getValidFeaturedGridItems(visibleItems);
}
