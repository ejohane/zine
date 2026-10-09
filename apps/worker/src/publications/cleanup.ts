import type { Bindings } from '../types';
/** Retain unavailable IDs only. Reader-owned snapshots must never cascade from these rows. */
export async function deletePublicationOwner(env: Bindings, owner: string) {
  const p = await env.DB.prepare('SELECT id FROM personal_publications WHERE owner_id=?')
    .bind(owner)
    .first<{ id: string }>();
  const assets = await env.DB.prepare(
    'SELECT storage_key FROM personal_publication_assets WHERE owner_id=?'
  )
    .bind(owner)
    .all<{ storage_key: string }>();
  if (p) {
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE personal_publications SET unavailable_at=?,editor_name=?,display_name=NULL,description=NULL,cover_asset_id=NULL WHERE id=?'
      ).bind(Date.now(), 'Unavailable editor', p.id),
      env.DB.prepare(
        "UPDATE personal_issues SET unavailable_at=?,title='',introduction=NULL,cover_asset_id=NULL WHERE publication_id=?"
      ).bind(Date.now(), p.id),
      env.DB.prepare(
        "UPDATE personal_issue_selections SET metadata_json='{}',commentary=NULL,bookmark_id=NULL,removed_at=? WHERE issue_id IN(SELECT id FROM personal_issues WHERE publication_id=?)"
      ).bind(Date.now(), p.id),
      env.DB.prepare(
        'UPDATE personal_issue_sections SET heading=NULL,removed_at=? WHERE issue_id IN(SELECT id FROM personal_issues WHERE publication_id=?)'
      ).bind(Date.now(), p.id),
      env.DB.prepare(
        'DELETE FROM personal_publication_outbox WHERE event_id IN(SELECT id FROM personal_publication_events WHERE publication_id=?)'
      ).bind(p.id),
      env.DB.prepare('DELETE FROM personal_publication_events WHERE publication_id=?').bind(p.id),
      env.DB.prepare('DELETE FROM personal_publication_subscriptions WHERE publication_id=?').bind(
        p.id
      ),
    ]);
  }
  // Delete bytes before dropping owner linkage so a failed retry can still find them.
  if (env.PUBLICATION_MEDIA && assets.results.length)
    await env.PUBLICATION_MEDIA.delete(assets.results.map((v) => v.storage_key));
  if (!env.PUBLICATION_MEDIA && assets.results.length)
    throw new Error('Publication media binding required for owner cleanup');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM personal_publication_subscriptions WHERE subscriber_id=?').bind(
      owner
    ),
    env.DB.prepare('DELETE FROM personal_publication_mutations WHERE actor_id=?').bind(owner),
    env.DB.prepare(
      'UPDATE personal_publication_assets SET unavailable_at=?,owner_id=NULL WHERE owner_id=?'
    ).bind(Date.now(), owner),
    env.DB.prepare('UPDATE personal_publications SET owner_id=NULL WHERE owner_id=?').bind(owner),
  ]);
}
export async function publicationAvailability(
  db: D1Database,
  publicationId: string,
  issueId?: string
) {
  const p = await db
    .prepare('SELECT id FROM personal_publications WHERE id=? AND unavailable_at IS NULL')
    .bind(publicationId)
    .first();
  if (!p) return false;
  if (!issueId) return true;
  return !!(await db
    .prepare(
      "SELECT id FROM personal_issues WHERE id=? AND publication_id=? AND status='PUBLISHED' AND unavailable_at IS NULL"
    )
    .bind(issueId, publicationId)
    .first());
}
