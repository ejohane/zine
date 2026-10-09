import { ulid } from 'ulid';
import { publicationEventHighWater } from '../events';
import { PublicationRepository } from '../repository';
import { PublicationError } from '../errors';
import { nextMorning, localDate } from './time';
interface Cursor {
  recipient_id: string;
  publication_id: string;
  generation: number;
  covered_cursor: number;
  next_due_at: number;
  timezone: string;
  claim_token: string | null;
  lease_until: number | null;
  cutoff: number | null;
  local_date: string | null;
}

/** Discover new subscription generations. No activity backfill before subscribedAt. */
export async function initializeDigestCursors(db: D1Database, now = Date.now()) {
  const rows = await db
    .prepare(
      `SELECT s.subscriber_id,s.publication_id,s.generation,s.subscribed_at,COALESCE(p.timezone,'UTC') AS timezone
 FROM personal_publication_subscriptions s LEFT JOIN personal_delivery_preferences p ON p.user_id=s.subscriber_id
 LEFT JOIN personal_digest_cursors c ON c.recipient_id=s.subscriber_id AND c.publication_id=s.publication_id
 WHERE s.ended_at IS NULL AND (c.recipient_id IS NULL OR c.generation<>s.generation) LIMIT 100`
    )
    .all<{
      subscriber_id: string;
      publication_id: string;
      generation: number;
      subscribed_at: number;
      timezone: string;
    }>();
  for (const r of rows.results) {
    await db
      .prepare(
        `INSERT INTO personal_digest_cursors(recipient_id,publication_id,generation,next_due_at,timezone)
   SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_publication_subscriptions WHERE subscriber_id=? AND publication_id=? AND generation=? AND ended_at IS NULL)
   ON CONFLICT(recipient_id,publication_id) DO UPDATE SET generation=excluded.generation,covered_cursor=0,next_due_at=excluded.next_due_at,
     timezone=excluded.timezone,claim_token=NULL,lease_until=NULL,cutoff=NULL,local_date=NULL WHERE personal_digest_cursors.generation<>excluded.generation`
      )
      .bind(
        r.subscriber_id,
        r.publication_id,
        r.generation,
        nextMorning(r.subscribed_at, r.timezone),
        r.timezone,
        r.subscriber_id,
        r.publication_id,
        r.generation
      )
      .run();
  }
  // Reconcile a timezone update that raced an in-flight occurrence's commit.
  const changed = await db
    .prepare(
      `SELECT c.recipient_id,c.publication_id,p.timezone
    FROM personal_digest_cursors c JOIN personal_delivery_preferences p ON p.user_id=c.recipient_id
    WHERE c.claim_token IS NULL AND c.timezone<>p.timezone LIMIT 100`
    )
    .all<{ recipient_id: string; publication_id: string; timezone: string }>();
  for (const r of changed.results)
    await db
      .prepare(
        `UPDATE personal_digest_cursors SET timezone=?,next_due_at=?
    WHERE recipient_id=? AND publication_id=? AND claim_token IS NULL AND timezone<>?`
      )
      .bind(r.timezone, nextMorning(now, r.timezone), r.recipient_id, r.publication_id, r.timezone)
      .run();
  return now;
}
export async function processDailyDigests(db: D1Database, now = Date.now()) {
  await initializeDigestCursors(db, now);
  const due = await db
    .prepare(
      `SELECT c.* FROM personal_digest_cursors c JOIN personal_publication_subscriptions s
  ON s.subscriber_id=c.recipient_id AND s.publication_id=c.publication_id AND s.generation=c.generation
  JOIN personal_publications p ON p.id=c.publication_id
  WHERE c.next_due_at<=? AND (c.lease_until IS NULL OR c.lease_until<=?) AND s.ended_at IS NULL AND p.unavailable_at IS NULL LIMIT 50`
    )
    .bind(now, now)
    .all<Cursor>();
  let batches = 0;
  for (const c of due.results) {
    const token = ulid(),
      cutoff = c.cutoff ?? (await publicationEventHighWater(db)),
      date = c.local_date ?? localDate(c.next_due_at, c.timezone);
    const claim = await db
      .prepare(
        `UPDATE personal_digest_cursors SET claim_token=?,lease_until=?,cutoff=COALESCE(cutoff,?),local_date=COALESCE(local_date,?)
   WHERE recipient_id=? AND publication_id=? AND generation=? AND next_due_at=? AND covered_cursor=? AND (lease_until IS NULL OR lease_until<=?) RETURNING recipient_id`
      )
      .bind(
        token,
        now + 120_000,
        cutoff,
        date,
        c.recipient_id,
        c.publication_id,
        c.generation,
        c.next_due_at,
        c.covered_cursor,
        now
      )
      .first();
    if (!claim) continue;
    const events = await db
      .prepare(
        `SELECT e.issue_id,e.selection_ids_json FROM personal_publication_events e
   JOIN personal_publication_subscriptions s ON s.publication_id=e.publication_id
   WHERE e.publication_id=? AND e.sequence>? AND e.sequence<=? AND e.kind='SELECTIONS_ADDED'
     AND s.subscriber_id=? AND s.generation=? AND s.ended_at IS NULL AND s.subscribed_at<=e.occurred_at ORDER BY e.sequence`
      )
      .bind(c.publication_id, c.covered_cursor, cutoff, c.recipient_id, c.generation)
      .all<{ issue_id: string; selection_ids_json: string }>();
    const groups = new Map<string, Set<string>>();
    for (const e of events.results) {
      try {
        const state = await new PublicationRepository(db).issue(e.issue_id);
        if (state.issue.kind !== 'INDEPENDENT') continue;
        const candidates: string[] = JSON.parse(e.selection_ids_json);
        for (const id of candidates)
          if (state.selections.some((s) => s.id === id)) {
            if (!groups.has(e.issue_id)) groups.set(e.issue_id, new Set());
            groups.get(e.issue_id)!.add(id);
          }
      } catch (error) {
        if (!(error instanceof PublicationError) || error.status !== 404) throw error;
        // An unavailable issue contributes no visible additions.
      }
    }
    const issueIds = [...groups.keys()],
      selectionIds = [...groups.values()].flatMap((v) => [...v]);
    const preferences = await db
      .prepare('SELECT timezone FROM personal_delivery_preferences WHERE user_id=?')
      .bind(c.recipient_id)
      .first<{ timezone: string }>();
    const timezone = preferences?.timezone || c.timezone;
    const guard = `EXISTS(SELECT 1 FROM personal_digest_cursors WHERE recipient_id=? AND publication_id=? AND generation=? AND claim_token=?)
    AND EXISTS(SELECT 1 FROM personal_publication_subscriptions s JOIN personal_publications p ON p.id=s.publication_id
     WHERE s.subscriber_id=? AND s.publication_id=? AND s.generation=? AND s.ended_at IS NULL AND p.unavailable_at IS NULL)
    AND EXISTS(SELECT 1 FROM json_each(?) ids JOIN personal_issue_selections sx ON sx.id=ids.value
      JOIN personal_issues ix ON ix.id=sx.issue_id WHERE sx.removed_at IS NULL AND ix.unavailable_at IS NULL
      AND ix.status='PUBLISHED' AND ix.publication_id=?)`;
    const args = [
      c.recipient_id,
      c.publication_id,
      c.generation,
      token,
      c.recipient_id,
      c.publication_id,
      c.generation,
      JSON.stringify(selectionIds),
      c.publication_id,
    ];
    const activity = selectionIds.length
      ? [
          db
            .prepare(
              `INSERT OR IGNORE INTO personal_publication_activity
   (id,recipient_id,publication_id,generation,logical_key,kind,issue_ids_json,selection_ids_json,created_at)
   SELECT ?,?,?,?,?, 'DAILY_ADDITIONS',?,?,? WHERE ${guard}`
            )
            .bind(
              ulid(now),
              c.recipient_id,
              c.publication_id,
              c.generation,
              `digest:${c.publication_id}:${date}`,
              JSON.stringify(issueIds),
              JSON.stringify(selectionIds),
              now,
              ...args
            ),
        ]
      : [];
    await db.batch([
      ...activity,
      db
        .prepare(
          `UPDATE personal_digest_cursors SET covered_cursor=?,next_due_at=?,timezone=?,claim_token=NULL,lease_until=NULL,cutoff=NULL,local_date=NULL
   WHERE recipient_id=? AND publication_id=? AND generation=? AND claim_token=?`
        )
        .bind(
          cutoff,
          nextMorning(now, timezone),
          timezone,
          c.recipient_id,
          c.publication_id,
          c.generation,
          token
        ),
    ]);
    batches++;
  }
  return batches;
}
