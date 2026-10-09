import { PublicationRepository } from './repository';
import { PublicationError } from './errors';
export async function issueVisit(
  db: D1Database,
  owner: string,
  id: string,
  revision?: number,
  now = Date.now()
) {
  const state = await new PublicationRepository(db).issue(id);
  if (revision !== undefined) {
    if (!Number.isSafeInteger(revision) || revision < 1 || revision > state.issue.revision)
      throw new PublicationError('INVALID_INPUT', 400);
    await db
      .prepare(
        `INSERT INTO personal_issue_visits(reader_id,issue_id,last_seen_revision,presented_at)
   SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_issues i JOIN personal_publications p ON p.id=i.publication_id
    WHERE i.id=? AND i.status='PUBLISHED' AND i.unavailable_at IS NULL AND p.unavailable_at IS NULL AND i.revision>=?)
   ON CONFLICT(reader_id,issue_id) DO UPDATE SET last_seen_revision=MAX(last_seen_revision,excluded.last_seen_revision),
    presented_at=MAX(presented_at,excluded.presented_at)`
      )
      .bind(owner, id, revision, now, id, revision)
      .run();
  }
  const row = await db
    .prepare(
      'SELECT last_seen_revision FROM personal_issue_visits WHERE reader_id=? AND issue_id=?'
    )
    .bind(owner, id)
    .first<{ last_seen_revision: number }>();
  return { lastSeenRevision: row?.last_seen_revision ?? null };
}
