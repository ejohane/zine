/** Pure lifecycle projection used during migration planning and readback. */
export interface LegacyLifecycle {
  id: string;
  state: 'BOOKMARKED' | 'INBOX' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
  ingested_at: string;
  bookmarked_at: string | null;
  archived_at: string | null;
}

export interface NextLifecycle {
  id: string;
  status: string;
  archived: number;
  saved_at: string | null;
  decision_at: string | null;
}

export interface ImportReceipt {
  item_id: string;
  created_at: string;
}

export function projectLegacyLifecycle(row: LegacyLifecycle) {
  // Next orders timestamp columns lexically. Legacy uses UTC ISO 8601 milliseconds.
  for (const value of [
    row.created_at,
    row.updated_at,
    row.ingested_at,
    row.bookmarked_at,
    row.archived_at,
  ]) {
    if (
      value !== null &&
      (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    ) {
      throw new Error('Legacy timestamp requires a separately reviewed representation');
    }
  }
  switch (row.state) {
    case 'BOOKMARKED':
      if (!row.bookmarked_at) throw new Error('Bookmarked row has no original save timestamp');
      return {
        status: 'saved',
        archived: 0,
        savedAt: row.bookmarked_at,
        decisionAt: row.bookmarked_at,
        decisionOrigin: 'explicit',
      } as const;
    case 'INBOX':
      if (row.bookmarked_at) throw new Error('Inbox row unexpectedly has a save timestamp');
      return {
        status: 'received',
        archived: 0,
        savedAt: null,
        decisionAt: row.ingested_at,
        decisionOrigin: 'automatic',
      } as const;
    case 'ARCHIVED':
      if (!row.archived_at) throw new Error('Archived row has no archive timestamp');
      return {
        status: row.bookmarked_at ? 'saved' : 'dismissed',
        archived: row.bookmarked_at ? 1 : 0,
        savedAt: row.bookmarked_at,
        decisionAt: row.archived_at,
        decisionOrigin: 'explicit',
      } as const;
    default:
      throw new Error('Unknown legacy lifecycle state');
  }
}

export function planPriorSave(
  source: LegacyLifecycle,
  destination: NextLifecycle,
  receipt: ImportReceipt | undefined
) {
  if (!receipt || destination.id !== receipt.item_id) return 'review-missing-receipt';
  const projected = projectLegacyLifecycle(source);
  if (
    destination.status === projected.status &&
    destination.archived === projected.archived &&
    destination.saved_at === projected.savedAt &&
    destination.decision_at === projected.decisionAt
  )
    return 'already-reconciled';
  if (
    destination.status !== 'saved' ||
    destination.archived !== 0 ||
    destination.saved_at !== receipt.created_at ||
    destination.decision_at !== receipt.created_at
  )
    return 'preserve-next-decision';
  return 'correct-import-date';
}

export interface LegacyProgress {
  progress_position: number | null;
  progress_duration: number | null;
  progress_updated_at: string | null;
  is_finished: 0 | 1;
  finished_at: string | null;
}

export function projectLegacyProgress(row: LegacyProgress) {
  const position = row.progress_position;
  if (position !== null && (!Number.isFinite(position) || position < 0))
    throw new Error('Legacy progress position is invalid');
  if ((row.is_finished === 1) !== (row.finished_at !== null))
    throw new Error('Legacy completion flag and timestamp disagree');
  if (position !== null && !row.progress_updated_at)
    throw new Error('Legacy progress lacks an original timestamp');
  const completedAt = row.finished_at;
  const updatedAt = [row.progress_updated_at, completedAt]
    .filter((date) => date !== null)
    .sort()
    .at(-1);
  if (!updatedAt) return null;
  return { position, unit: position === null ? null : 'seconds', completedAt, updatedAt } as const;
}
