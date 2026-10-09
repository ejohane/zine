import { ulid } from 'ulid';
import { publicationAvailability } from '../cleanup';
import { PublicationRepository } from '../repository';
import { PublicationError } from '../errors';
import type { PushProvider } from './apns';
import { retryAt } from './time';
interface Job {
  id: string;
  activity_id: string;
  installation_id: string;
  token_version: number;
  attempts: number;
  lease_token: string | null;
  recipient_id: string;
  publication_id: string;
  generation: number;
  kind: 'ISSUE_PUBLISHED' | 'DAILY_ADDITIONS';
  issue_ids_json: string;
  selection_ids_json: string;
  created_at: number;
  token: string;
  environment: 'sandbox' | 'production';
  topic: string;
}
/** New registrations never receive a backlog of pre-registration activities. */
export async function enqueuePushJobs(db: D1Database, now = Date.now()) {
  const rows = await db
    .prepare(
      `SELECT a.id AS activity_id,i.id AS installation_id,i.version FROM personal_publication_activity a
  JOIN personal_push_installations i ON i.owner_id=a.recipient_id AND i.enabled=1 AND i.updated_at<=a.created_at
  LEFT JOIN personal_push_jobs j ON j.activity_id=a.id AND j.installation_id=i.id AND j.token_version=i.version
  WHERE j.id IS NULL AND a.created_at>? LIMIT 100`
    )
    .bind(now - 86400_000)
    .all<{ activity_id: string; installation_id: string; version: number }>();
  if (rows.results.length)
    await db.batch(
      rows.results.map((row) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO personal_push_jobs
  (id,activity_id,installation_id,token_version,state,next_attempt_at) SELECT ?,?,?,?,'PENDING',?
  WHERE EXISTS(SELECT 1 FROM personal_publication_activity WHERE id=?) AND EXISTS(SELECT 1 FROM personal_push_installations WHERE id=? AND enabled=1 AND version=?)`
          )
          .bind(
            ulid(),
            row.activity_id,
            row.installation_id,
            row.version,
            now,
            row.activity_id,
            row.installation_id,
            row.version
          )
      )
    );
  return rows.results.length;
}
export async function processPushJobs(
  db: D1Database,
  provider: PushProvider | undefined,
  now = Date.now()
) {
  const jobs = await db
    .prepare(
      `SELECT j.*,a.recipient_id,a.publication_id,a.generation,a.kind,a.issue_ids_json,a.selection_ids_json,a.created_at,
   i.token,i.environment,i.topic FROM personal_push_jobs j
   JOIN personal_publication_activity a ON a.id=j.activity_id JOIN personal_push_installations i ON i.id=j.installation_id
   WHERE j.state='PENDING' AND j.next_attempt_at<=? AND (j.lease_until IS NULL OR j.lease_until<=?) ORDER BY j.next_attempt_at LIMIT 50`
    )
    .bind(now, now)
    .all<Job>();
  let processed = 0;
  for (const job of jobs.results) {
    const lease = ulid();
    const claimed = await db
      .prepare(
        `UPDATE personal_push_jobs SET lease_token=?,lease_until=? WHERE id=? AND state='PENDING' AND next_attempt_at<=?
    AND (lease_until IS NULL OR lease_until<=?) RETURNING id`
      )
      .bind(lease, now + 120_000, job.id, now, now)
      .first();
    if (!claimed) continue;
    const finish = async (
      state: string,
      reason: string,
      apnsId?: string,
      nextAttempt = now,
      countAttempt = true
    ) =>
      db
        .prepare(
          `UPDATE personal_push_jobs
   SET state=?,reason=?,apns_id=?,attempts=attempts+?,next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?`
        )
        .bind(state, reason, apnsId || null, countAttempt ? 1 : 0, nextAttempt, job.id, lease)
        .run();
    const valid = await db
      .prepare(
        `SELECT s.muted FROM personal_publication_subscriptions s JOIN personal_push_installations i ON i.owner_id=s.subscriber_id
   WHERE s.subscriber_id=? AND s.publication_id=? AND s.generation=? AND s.ended_at IS NULL
    AND i.id=? AND i.enabled=1 AND i.version=?`
      )
      .bind(
        job.recipient_id,
        job.publication_id,
        job.generation,
        job.installation_id,
        job.token_version
      )
      .first<{ muted: number }>();
    const issueIds: string[] = JSON.parse(job.issue_ids_json),
      liveIssues: string[] = [];
    for (const id of issueIds)
      if (await publicationAvailability(db, job.publication_id, id)) liveIssues.push(id);
    let visible = liveIssues.length > 0;
    if (visible && job.kind === 'DAILY_ADDITIONS') {
      const ids: string[] = JSON.parse(job.selection_ids_json);
      visible = false;
      for (const id of liveIssues) {
        try {
          const state = await new PublicationRepository(db).issue(id);
          if (state.selections.some((s) => ids.includes(s.id))) visible = true;
        } catch (error) {
          if (!(error instanceof PublicationError) || error.status !== 404) throw error;
        }
      }
    }
    if (!valid || valid.muted || !visible || now - job.created_at > 86400_000) {
      await finish('SUPPRESSED', valid?.muted ? 'MUTED' : 'NO_LONGER_ELIGIBLE');
      continue;
    }
    if (!provider) {
      await finish('PENDING', 'APNS_NOT_CONFIGURED', undefined, now + 300_000, false);
      continue;
    }
    // Authorization boundary: mute/unsubscribe checked immediately before external send.
    const authorized = await db
      .prepare(
        `SELECT s.muted FROM personal_publication_subscriptions s JOIN personal_push_installations i ON i.owner_id=s.subscriber_id
    JOIN personal_publications p ON p.id=s.publication_id
    WHERE s.subscriber_id=? AND s.publication_id=? AND s.generation=? AND s.ended_at IS NULL AND s.muted=0
    AND p.unavailable_at IS NULL AND i.id=? AND i.enabled=1 AND i.version=?`
      )
      .bind(
        job.recipient_id,
        job.publication_id,
        job.generation,
        job.installation_id,
        job.token_version
      )
      .first();
    if (!authorized) {
      await finish('SUPPRESSED', 'NO_LONGER_ELIGIBLE');
      continue;
    }
    let result;
    try {
      result = await provider({
        activityId: job.activity_id,
        publicationId: job.publication_id,
        issueIds: liveIssues,
        type: job.kind,
        token: job.token,
        environment: job.environment,
        topic: job.topic,
      });
    } catch {
      result = { kind: 'retry' as const, reason: 'NETWORK_ERROR' };
    }
    if (result.kind === 'invalid-token')
      await db
        .prepare(
          `UPDATE personal_push_installations SET enabled=0 WHERE id=? AND version=? AND token=?`
        )
        .bind(job.installation_id, job.token_version, job.token)
        .run();
    const retry = result.kind === 'retry' && job.attempts < 8;
    await finish(
      result.kind === 'sent' ? 'SENT' : retry ? 'PENDING' : 'FAILED',
      result.reason,
      result.apnsId,
      retryAt(now, job.attempts, result.retryAfterSeconds)
    );
    processed++;
  }
  return processed;
}
export async function publicationDeliveryHealth(db: D1Database) {
  const counts = await db
    .prepare(
      `SELECT state,count(*) AS count,min(next_attempt_at) AS oldestAt FROM personal_push_jobs GROUP BY state`
    )
    .all<{ state: string; count: number; oldestAt: number }>();
  const pendingEvents = await db
    .prepare('SELECT count(*) AS count FROM personal_publication_outbox WHERE completed_at IS NULL')
    .first<{ count: number }>();
  return { pendingEvents: pendingEvents?.count || 0, push: counts.results };
}

/** Operator replay retains the logical activity/job identity. Expired jobs remain suppressed at send. */
export async function retryFailedPublicationPush(db: D1Database, id: string, now = Date.now()) {
  return db
    .prepare(
      "UPDATE personal_push_jobs SET state='PENDING',attempts=0,next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND state='FAILED' RETURNING id"
    )
    .bind(now, id)
    .first<{ id: string }>();
}
