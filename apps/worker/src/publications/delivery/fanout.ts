import { ulid } from 'ulid';
import { pendingPublicationEvents } from '../events';

/** Bounded recipient pages, durable checkpoints and expiring claims. */
export async function fanoutPendingPublications(db: D1Database, now = Date.now()) {
  const pending = await pendingPublicationEvents(db, now);
  for (const { event_id: id } of pending) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO personal_publication_fanout(event_id)
   SELECT id FROM personal_publication_events WHERE id=?`
      )
      .bind(id)
      .run();
    const lease = ulid();
    const claimed = await db
      .prepare(
        `UPDATE personal_publication_fanout SET lease_token=?,lease_until=?
    WHERE event_id=? AND (lease_until IS NULL OR lease_until<=?) RETURNING recipient_cursor`
      )
      .bind(lease, now + 120_000, id, now)
      .first<{ recipient_cursor: string }>();
    if (!claimed) continue;
    let cursor = claimed.recipient_cursor,
      complete = false;
    // Bound one invocation; subsequent cron/replay resumes from committed cursor.
    for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
      const page = await db
        .prepare(
          `SELECT s.subscriber_id,e.occurred_at FROM personal_publication_subscriptions s
    JOIN personal_publication_events e ON e.publication_id=s.publication_id
    WHERE e.id=? AND e.kind='ISSUE_PUBLISHED' AND s.ended_at IS NULL
      AND s.subscribed_at<=e.occurred_at AND s.subscriber_id>? ORDER BY s.subscriber_id LIMIT 50`
        )
        .bind(id, cursor)
        .all<{ subscriber_id: string; occurred_at: number }>();
      if (!page.results.length) {
        complete = true;
        break;
      }
      const next = page.results[page.results.length - 1].subscriber_id;
      await db.batch([
        ...page.results.map((row) =>
          db
            .prepare(
              `INSERT OR IGNORE INTO personal_publication_activity
     (id,recipient_id,publication_id,generation,logical_key,kind,issue_ids_json,selection_ids_json,created_at)
     SELECT ?,s.subscriber_id,e.publication_id,s.generation,e.id,'ISSUE_PUBLISHED',
       json_array(e.issue_id),e.selection_ids_json,e.occurred_at
     FROM personal_publication_events e JOIN personal_publications p ON p.id=e.publication_id
       JOIN personal_issues i ON i.id=e.issue_id
       JOIN personal_publication_subscriptions s ON s.publication_id=e.publication_id
     WHERE e.id=? AND s.subscriber_id=? AND e.kind='ISSUE_PUBLISHED' AND p.unavailable_at IS NULL AND i.unavailable_at IS NULL
       AND i.status='PUBLISHED' AND s.ended_at IS NULL AND s.subscribed_at<=e.occurred_at AND s.subscriber_id<>p.owner_id
       AND EXISTS(SELECT 1 FROM personal_publication_fanout WHERE event_id=? AND lease_token=?)`
            )
            .bind(ulid(row.occurred_at), id, row.subscriber_id, id, lease)
        ),
        db
          .prepare(
            'UPDATE personal_publication_fanout SET recipient_cursor=? WHERE event_id=? AND lease_token=?'
          )
          .bind(next, id, lease),
      ]);
      cursor = next;
      if (page.results.length < 50) {
        complete = true;
        break;
      }
    }
    await db.batch([
      db
        .prepare(
          `UPDATE personal_publication_outbox SET completed_at=? WHERE event_id=? AND completed_at IS NULL
    AND ?=1 AND EXISTS(SELECT 1 FROM personal_publication_fanout WHERE event_id=? AND lease_token=?)`
        )
        .bind(now, id, complete ? 1 : 0, id, lease),
      db
        .prepare(
          'UPDATE personal_publication_fanout SET lease_token=NULL,lease_until=NULL WHERE event_id=? AND lease_token=?'
        )
        .bind(id, lease),
    ]);
  }
  return pending.length;
}
