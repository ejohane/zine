import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { Database } from '../db';
import { userItemConsumptionEvents, userItems } from '../db/schema';

/** Batch this BEFORE an unsaved -> saved state write; after a fresh row insert use newlyCreated. */
export function savedEvidence(
  db: Database,
  input: {
    userId: string;
    userItemId: string;
    occurredAt: number;
    source: string;
    newlyCreated?: boolean;
  }
) {
  return db
    .insert(userItemConsumptionEvents)
    .select(
      sql`
    SELECT ${input.newlyCreated ? `saved:${input.userItemId}` : ulid()}, ui.user_id, ui.id, ui.item_id, 'SAVED', ${input.occurredAt},
      NULL, NULL, NULL, ${input.source}, ${evidenceSnapshotSql()}
    FROM user_items ui JOIN items i ON i.id=ui.item_id
    LEFT JOIN creators c ON c.id=i.creator_id
    WHERE ui.id=${input.userItemId} AND ui.user_id=${input.userId}
      AND ${input.newlyCreated ? sql`ui.state='BOOKMARKED'` : sql`ui.state<>'BOOKMARKED'`}
  `
    )
    .onConflictDoNothing();
}

/** Snapshots are private: source metadata never enters a published issue automatically. */
export function evidenceSnapshotSql() {
  return sql`json_object('version',1,'title',i.title,'creatorName',c.name,
    'contentType',i.content_type,'provider',i.provider,'artworkUrl',i.thumbnail_url)`;
}

export function finishedEvidence(
  db: Database,
  input: {
    userId: string;
    userItemId: string;
    isFinished: boolean;
    occurredAt: number;
    metadata?: unknown;
  }
) {
  return db.insert(userItemConsumptionEvents).select(sql`
    SELECT ${ulid()}, ui.user_id, ui.id, ui.item_id,
      ${input.isFinished ? 'FINISHED' : 'UNFINISHED'}, ${input.occurredAt},
      NULL,NULL,NULL,'MANUAL_FINISH_TOGGLE',
      json_patch(${evidenceSnapshotSql()},${JSON.stringify(input.metadata ?? {})})
    FROM user_items ui JOIN items i ON i.id=ui.item_id LEFT JOIN creators c ON c.id=i.creator_id
    WHERE ui.id=${input.userItemId} AND ui.user_id=${input.userId}
      AND ui.is_finished<>${input.isFinished ? 1 : 0}
  `);
}

/** Delivery's trusted canonical save adapter can batch this raw D1 statement BEFORE its update. */
export function savedEvidenceStatement(
  db: D1Database,
  input: {
    userId: string;
    userItemId: string;
    occurredAt: number;
    source: string;
    newlyCreated?: boolean;
    mutationGuard?: string;
  }
) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO user_item_consumption_events
    (id,user_id,user_item_id,item_id,event_type,occurred_at,source,metadata)
    SELECT ?,ui.user_id,ui.id,ui.item_id,'SAVED',?,?,
      json_object('version',1,'title',i.title,'creatorName',c.name,'contentType',i.content_type,
        'provider',i.provider,'artworkUrl',i.thumbnail_url)
    FROM user_items ui JOIN items i ON i.id=ui.item_id LEFT JOIN creators c ON c.id=i.creator_id
    WHERE ui.id=? AND ui.user_id=? AND ui.state ${input.newlyCreated ? '=' : '<>'} 'BOOKMARKED'
      ${input.mutationGuard ? 'AND EXISTS(SELECT 1 FROM personal_publication_mutations WHERE id=?)' : ''}`
    )
    .bind(
      input.newlyCreated ? `saved:${input.userItemId}` : ulid(),
      input.occurredAt,
      input.source,
      input.userItemId,
      input.userId,
      ...(input.mutationGuard ? [input.mutationGuard] : [])
    );
}

/** One identity per actual open; retries retain its timestamp and cannot create extra evidence. */
export async function markOwnedItemOpened(
  db: Database,
  input: { userId: string; userItemId: string; interactionId?: string; occurredAt?: number }
) {
  const nowMs = input.occurredAt ?? Date.now();
  const now = new Date(nowMs).toISOString();
  const eventId = input.interactionId ? `open:${input.userId}:${input.interactionId}` : ulid();
  await db.batch([
    db
      .insert(userItemConsumptionEvents)
      .select(
        sql`
      SELECT ${eventId},ui.user_id,ui.id,ui.item_id,'OPENED',${nowMs},
        NULL,NULL,NULL,'ITEM_DETAIL_OPEN',${evidenceSnapshotSql()}
      FROM user_items ui JOIN items i ON i.id=ui.item_id LEFT JOIN creators c ON c.id=i.creator_id
      WHERE ui.id=${input.userItemId} AND ui.user_id=${input.userId}
    `
      )
      .onConflictDoNothing(),
    db.update(userItems).set({ lastOpenedAt: now, updatedAt: now })
      .where(sql`id=${input.userItemId} AND user_id=${input.userId}
        AND EXISTS(SELECT 1 FROM user_item_consumption_events
          WHERE id=${eventId} AND user_item_id=${input.userItemId} AND occurred_at=${nowMs})`),
  ]);
  const result = await db
    .select({
      occurredAt: userItemConsumptionEvents.occurredAt,
      userItemId: userItemConsumptionEvents.userItemId,
    })
    .from(userItemConsumptionEvents)
    .where(sql`id=${eventId}`)
    .limit(1);
  if (!result[0] || result[0].userItemId !== input.userItemId) return null;
  return {
    success: true as const,
    updated: true,
    lastOpenedAt: new Date(result[0].occurredAt).toISOString(),
  };
}
