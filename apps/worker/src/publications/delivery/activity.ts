import { PublicationError, requireFound } from '../errors';
import { publicationAvailability } from '../cleanup';

export async function listActivity(db: D1Database, owner: string, cursor?: string, limit = 20) {
  const rows = await db
    .prepare(
      `SELECT a.*,p.display_name,p.editor_name FROM personal_publication_activity a
    JOIN personal_publications p ON p.id=a.publication_id
    WHERE a.recipient_id=? ${cursor ? 'AND a.id<?' : ''} ORDER BY a.id DESC LIMIT ?`
    )
    .bind(owner, ...(cursor ? [cursor] : []), limit + 1)
    .all<ActivityRow>();
  const activities = await Promise.all(
    rows.results.slice(0, limit).map(async (row) => {
      const available = await publicationAvailability(db, row.publication_id);
      const issueIds: string[] = JSON.parse(row.issue_ids_json);
      const liveIssues: string[] = [];
      for (const id of issueIds)
        if (await publicationAvailability(db, row.publication_id, id)) liveIssues.push(id);
      // Stored identities are operational routing only; removed selections cannot leak metadata.
      const selectionIds: string[] = JSON.parse(row.selection_ids_json);
      const visible: string[] = [];
      for (const id of selectionIds) {
        const s = await db
          .prepare(
            `SELECT s.id FROM personal_issue_selections s JOIN personal_issues i ON i.id=s.issue_id
        WHERE s.id=? AND s.removed_at IS NULL AND i.unavailable_at IS NULL AND i.status='PUBLISHED'`
          )
          .bind(id)
          .first();
        if (s) visible.push(id);
      }
      return {
        id: row.id,
        publicationId: row.publication_id,
        type: row.kind,
        publicationName: available
          ? row.display_name || `${row.editor_name}’s Zine`
          : 'Unavailable publication',
        issueIds: liveIssues,
        selectionIds: visible,
        available: available && liveIssues.length > 0,
        createdAt: new Date(row.created_at).toISOString(),
        readAt: row.read_at === null ? null : new Date(row.read_at).toISOString(),
      };
    })
  );
  return {
    activities,
    nextCursor: rows.results.length > limit ? rows.results[limit - 1].id : null,
  };
}
export interface ActivityRow {
  id: string;
  recipient_id: string;
  publication_id: string;
  generation: number;
  logical_key: string;
  kind: 'ISSUE_PUBLISHED' | 'DAILY_ADDITIONS';
  issue_ids_json: string;
  selection_ids_json: string;
  created_at: number;
  read_at: number | null;
  display_name: string | null;
  editor_name: string;
}
export async function markActivityRead(
  db: D1Database,
  owner: string,
  id: string,
  now = Date.now()
) {
  const row = await db
    .prepare(
      'UPDATE personal_publication_activity SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_id=? RETURNING id'
    )
    .bind(now, id, owner)
    .first();
  requireFound(row);
  return { id, read: true };
}
export async function ensureDeliveryUser(db: D1Database, owner: string, now = Date.now()) {
  const iso = new Date(now).toISOString();
  await db
    .prepare('INSERT OR IGNORE INTO users(id,created_at,updated_at) VALUES(?,?,?)')
    .bind(owner, iso, iso)
    .run();
}
export function deliveryLimit(value?: string) {
  if (value === undefined) return 20;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new PublicationError('INVALID_INPUT', 400);
  return n;
}
