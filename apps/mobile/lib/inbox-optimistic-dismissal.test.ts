import {
  addPendingDismissedId,
  removePendingDismissedId,
  filterPendingDismissedItems,
  pruneResolvedPendingDismissedIds,
} from './inbox-optimistic-dismissal';

describe('inbox optimistic dismissal helpers', () => {
  it('adds a pending id without mutating the original set', () => {
    const pendingIds = new Set<string>(['item-1']);

    const next = addPendingDismissedId(pendingIds, 'item-2');

    expect([...pendingIds]).toEqual(['item-1']);
    expect([...next]).toEqual(['item-1', 'item-2']);
  });

  it('returns the same set when adding a duplicate pending id', () => {
    const pendingIds = new Set<string>(['item-1']);

    const next = addPendingDismissedId(pendingIds, 'item-1');

    expect(next).toBe(pendingIds);
  });

  it('removes a pending id without mutating the original set', () => {
    const pendingIds = new Set<string>(['item-1', 'item-2']);

    const next = removePendingDismissedId(pendingIds, 'item-1');

    expect([...pendingIds]).toEqual(['item-1', 'item-2']);
    expect([...next]).toEqual(['item-2']);
  });

  it('filters dismissed items out of the rendered inbox list', () => {
    const items = [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }];
    const pendingIds = new Set<string>(['item-2']);

    expect(filterPendingDismissedItems(items, pendingIds)).toEqual([
      { id: 'item-1' },
      { id: 'item-3' },
    ]);
  });

  it('prunes pending ids once the backing query no longer contains the item', () => {
    const pendingIds = new Set<string>(['item-1', 'item-2']);
    const items = [{ id: 'item-2' }, { id: 'item-3' }];

    expect([...pruneResolvedPendingDismissedIds(pendingIds, items)]).toEqual(['item-2']);
  });

  it('returns the same set when all pending ids are still present', () => {
    const pendingIds = new Set<string>(['item-1']);
    const items = [{ id: 'item-1' }, { id: 'item-2' }];

    expect(pruneResolvedPendingDismissedIds(pendingIds, items)).toBe(pendingIds);
  });
});
