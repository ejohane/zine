type ItemWithId = {
  id: string;
};

export function addPendingDismissedId(pendingIds: Set<string>, id: string): Set<string> {
  if (pendingIds.has(id)) {
    return pendingIds;
  }

  const next = new Set(pendingIds);
  next.add(id);
  return next;
}

export function removePendingDismissedId(pendingIds: Set<string>, id: string): Set<string> {
  if (!pendingIds.has(id)) {
    return pendingIds;
  }

  const next = new Set(pendingIds);
  next.delete(id);
  return next;
}

export function filterPendingDismissedItems<T extends ItemWithId>(
  items: T[],
  pendingIds: ReadonlySet<string>
): T[] {
  if (pendingIds.size === 0) {
    return items;
  }

  return items.filter((item) => !pendingIds.has(item.id));
}

export function pruneResolvedPendingDismissedIds<T extends ItemWithId>(
  pendingIds: Set<string>,
  items: T[]
): Set<string> {
  if (pendingIds.size === 0) {
    return pendingIds;
  }

  const visibleIds = new Set(items.map((item) => item.id));
  let didChange = false;
  const next = new Set<string>();

  pendingIds.forEach((id) => {
    if (visibleIds.has(id)) {
      next.add(id);
      return;
    }

    didChange = true;
  });

  return didChange ? next : pendingIds;
}
