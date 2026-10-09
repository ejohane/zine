import { PublicationEventSchema } from '@zine/shared';
export interface EventRow {
  sequence: number;
  id: string;
  publication_id: string;
  issue_id: string;
  revision: number;
  kind: string;
  selection_ids_json: string;
  occurred_at: number;
}
export async function publicationEvents(db: D1Database, after = 0, limit = 100) {
  const rows = await db
    .prepare('SELECT * FROM personal_publication_events WHERE sequence>? ORDER BY sequence LIMIT ?')
    .bind(after, Math.min(100, Math.max(1, limit)))
    .all<EventRow>();
  return rows.results.map((v) =>
    PublicationEventSchema.parse({
      id: v.id,
      cursor: v.sequence,
      publicationId: v.publication_id,
      issueId: v.issue_id,
      revision: v.revision,
      kind: v.kind,
      selectionIds: JSON.parse(v.selection_ids_json),
      occurredAt: new Date(v.occurred_at).toISOString(),
    })
  );
}
export async function publicationEventHighWater(db: D1Database) {
  return (
    (
      await db
        .prepare(
          "SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name='personal_publication_events'),0) AS cursor"
        )
        .first<{ cursor: number }>()
    )?.cursor || 0
  );
}
/** Delivery owns external dispatch; ack only after its idempotent consumer succeeds. */
export async function pendingPublicationEvents(db: D1Database, now = Date.now()) {
  return (
    await db
      .prepare(
        'SELECT event_id FROM personal_publication_outbox WHERE completed_at IS NULL AND next_attempt_at<=? ORDER BY next_attempt_at,event_id LIMIT 100'
      )
      .bind(now)
      .all<{ event_id: string }>()
  ).results;
}
export async function acknowledgePublicationEvent(db: D1Database, id: string) {
  await db
    .prepare(
      'UPDATE personal_publication_outbox SET completed_at=? WHERE event_id=? AND completed_at IS NULL'
    )
    .bind(Date.now(), id)
    .run();
}

/** Retrying keeps the immutable event identity; Delivery owns claim leases/fanout. */
export async function retryPublicationEvent(db: D1Database, id: string, nextAttemptAt: number) {
  if (!Number.isFinite(nextAttemptAt)) throw new Error('Invalid publication outbox retry time');
  await db
    .prepare(
      'UPDATE personal_publication_outbox SET attempts=attempts+1,next_attempt_at=? WHERE event_id=? AND completed_at IS NULL'
    )
    .bind(nextAttemptAt, id)
    .run();
}
