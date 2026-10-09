/** Run BEFORE Foundation deletes publications/subscriptions and BEFORE deleting user_items. */
export async function cleanupPublicationDelivery(db: D1Database, owner: string) {
  await db.batch([
    db
      .prepare(
        'DELETE FROM personal_discovery_references WHERE user_item_id IN(SELECT id FROM user_items WHERE user_id=?)'
      )
      .bind(owner),
    db.prepare('DELETE FROM personal_issue_visits WHERE reader_id=?').bind(owner),
    db.prepare('DELETE FROM personal_push_installations WHERE owner_id=?').bind(owner),
    db
      .prepare(
        `DELETE FROM personal_publication_activity WHERE recipient_id=? OR publication_id IN(SELECT id FROM personal_publications WHERE owner_id=?)`
      )
      .bind(owner, owner),
    db
      .prepare(
        `DELETE FROM personal_digest_cursors WHERE recipient_id=? OR publication_id IN(SELECT id FROM personal_publications WHERE owner_id=?)`
      )
      .bind(owner, owner),
    db.prepare('DELETE FROM personal_delivery_preferences WHERE user_id=?').bind(owner),
  ]);
  // Deliberately retain references owned by other readers; no FK to editor-owned rows.
}
