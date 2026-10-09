import { ulid } from 'ulid';
import { PublicationError } from '../errors';
import { ensureDeliveryUser } from './activity';
import { nextMorning } from './time';

export async function deliveryPreferences(db: D1Database, owner: string) {
  const row = await db
    .prepare('SELECT timezone FROM personal_delivery_preferences WHERE user_id=?')
    .bind(owner)
    .first<{ timezone: string }>();
  return { timezone: row?.timezone || 'UTC', configured: !!row };
}
export async function setDeliveryPreferences(
  db: D1Database,
  owner: string,
  timezone: string,
  now = Date.now(),
  initializeOnly = false
) {
  await ensureDeliveryUser(db, owner, now);
  if (initializeOnly) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO personal_delivery_preferences(user_id,timezone,updated_at) VALUES(?,?,?)'
      )
      .bind(owner, timezone, now)
      .run();
    return deliveryPreferences(db, owner);
  }
  const due = nextMorning(now, timezone);
  await db.batch([
    db
      .prepare(
        'INSERT INTO personal_delivery_preferences(user_id,timezone,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET timezone=excluded.timezone,updated_at=excluded.updated_at'
      )
      .bind(owner, timezone, now),
    // In-flight occurrences keep their frozen timezone; future unclaimed occurrences use new zone.
    db
      .prepare(
        'UPDATE personal_digest_cursors SET timezone=?,next_due_at=? WHERE recipient_id=? AND claim_token IS NULL'
      )
      .bind(timezone, due, owner),
  ]);
  return { timezone, configured: true };
}
export async function registerInstallation(
  db: D1Database,
  owner: string,
  id: string,
  input: { token: string; environment: 'sandbox' | 'production' },
  topic = 'app.zine.native',
  now = Date.now()
) {
  await ensureDeliveryUser(db, owner, now);
  const token = input.token.toLowerCase();
  const existing = await db
    .prepare('SELECT owner_id FROM personal_push_installations WHERE id=?')
    .bind(id)
    .first<{ owner_id: string }>();
  if (existing && existing.owner_id !== owner) throw new PublicationError('NOT_FOUND', 404);
  const stamp = ulid();
  // A token can be registered on one account only; remove the old installation and its jobs.
  // A new client installation ID avoids authorizing control of another user's opaque ID.
  await db.batch([
    db
      .prepare(
        'DELETE FROM personal_push_installations WHERE environment=? AND topic=? AND token=? AND id<>?'
      )
      .bind(input.environment, topic, token, id),
    db
      .prepare(
        `INSERT INTO personal_push_installations(id,owner_id,token,environment,topic,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,environment=excluded.environment,
    topic=excluded.topic,enabled=1,updated_at=excluded.updated_at,version=personal_push_installations.version+1
    WHERE personal_push_installations.owner_id=excluded.owner_id`
      )
      .bind(id, owner, token, input.environment, topic, now),
    db
      .prepare(
        `UPDATE personal_push_jobs SET state='SUPPRESSED',reason=? WHERE installation_id=? AND state='PENDING'`
      )
      .bind(`rotated:${stamp}`, id),
  ]);
  return { id, enabled: true };
}
export async function revokeInstallation(
  db: D1Database,
  owner: string,
  id: string,
  now = Date.now()
) {
  await db.batch([
    db
      .prepare(
        'UPDATE personal_push_installations SET enabled=0,version=version+1,updated_at=? WHERE id=? AND owner_id=?'
      )
      .bind(now, id, owner),
    db
      .prepare(
        `UPDATE personal_push_jobs SET state='SUPPRESSED',reason='REVOKED' WHERE installation_id=? AND state='PENDING'
    AND EXISTS(SELECT 1 FROM personal_push_installations WHERE id=? AND owner_id=? AND enabled=0)`
      )
      .bind(id, id, owner),
  ]);
  return { id, enabled: false };
}
