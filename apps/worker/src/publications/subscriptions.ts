import { PublicationRepository } from './repository';
import { PublicationError } from './errors';
import { PublicationSubscriptionSchema } from '@zine/shared';
interface SubscriptionRow {
  publication_id: string;
  subscriber_id: string;
  muted: number;
  generation: number;
  subscribed_at: number;
  ended_at: number | null;
}
export async function subscription(
  db: D1Database,
  owner: string,
  publicationId: string,
  action: 'get' | 'subscribe' | 'mute' | 'end',
  muted = false
) {
  const p = await new PublicationRepository(db).publication(publicationId);
  if (action === 'subscribe' && p.owner_id === owner)
    throw new PublicationError('RESOURCE_CONFLICT', 409);
  if (action === 'subscribe')
    await db
      .prepare(
        `INSERT INTO personal_publication_subscriptions(publication_id,subscriber_id,subscribed_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM personal_publications WHERE id=? AND unavailable_at IS NULL)
 ON CONFLICT(publication_id,subscriber_id) DO UPDATE SET generation=personal_publication_subscriptions.generation+CASE WHEN personal_publication_subscriptions.ended_at IS NULL THEN 0 ELSE 1 END,subscribed_at=CASE WHEN personal_publication_subscriptions.ended_at IS NULL THEN personal_publication_subscriptions.subscribed_at ELSE excluded.subscribed_at END,muted=CASE WHEN personal_publication_subscriptions.ended_at IS NULL THEN personal_publication_subscriptions.muted ELSE 0 END,ended_at=NULL`
      )
      .bind(publicationId, owner, Date.now(), publicationId)
      .run();
  if (action === 'mute')
    await db
      .prepare(
        'UPDATE personal_publication_subscriptions SET muted=? WHERE publication_id=? AND subscriber_id=? AND ended_at IS NULL'
      )
      .bind(muted ? 1 : 0, publicationId, owner)
      .run();
  if (action === 'end')
    await db
      .prepare(
        'UPDATE personal_publication_subscriptions SET ended_at=? WHERE publication_id=? AND subscriber_id=? AND ended_at IS NULL'
      )
      .bind(Date.now(), publicationId, owner)
      .run();
  const row = await db
    .prepare(
      'SELECT * FROM personal_publication_subscriptions WHERE publication_id=? AND subscriber_id=?'
    )
    .bind(publicationId, owner)
    .first<SubscriptionRow>();
  return PublicationSubscriptionSchema.parse({
    publicationId,
    subscribed: !!row && row.ended_at === null,
    muted: !!row?.muted,
    generation: row?.generation || 0,
    subscribedAt: row ? new Date(row.subscribed_at).toISOString() : null,
  });
}
