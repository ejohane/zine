import { ulid } from 'ulid';
import { PublicationRepository, requestHash } from './repository';
import { resolvePublishedSelection } from './selection-source';
import { PublicationError, requireFound } from './errors';
import { publicationAvailability } from './cleanup';
import { savedEvidenceStatement } from '../weekly-recaps/evidence';
import { ensureDeliveryUser } from './delivery/activity';
import { publicMetadata, type SavedSource } from './eligibility';
interface ReferenceRow {
  id: string;
  publication_id: string;
  issue_id: string;
  selection_id: string;
  publication_name: string;
  issue_title: string;
  editor_name: string;
  commentary: string | null;
  saved_at: number;
}
export async function discoveryReferences(db: D1Database, owner: string, bookmarkId: string) {
  requireFound(
    await db
      .prepare('SELECT id FROM user_items WHERE id=? AND user_id=?')
      .bind(bookmarkId, owner)
      .first()
  );
  const rows = await db
    .prepare(
      'SELECT * FROM personal_discovery_references WHERE user_item_id=? ORDER BY saved_at,id'
    )
    .bind(bookmarkId)
    .all<ReferenceRow>();
  return Promise.all(
    rows.results.map(async (r) => ({
      id: r.id,
      publicationId: r.publication_id,
      issueId: r.issue_id,
      selectionId: r.selection_id,
      publicationName: r.publication_name,
      issueTitle: r.issue_title,
      editorName: r.editor_name,
      commentary: r.commentary,
      savedAt: new Date(r.saved_at).toISOString(),
      available: await publicationAvailability(db, r.publication_id, r.issue_id),
    }))
  );
}
interface SaveIdentity {
  itemId: string;
  userItemId: string;
  status: 'created' | 'already_bookmarked' | 'rebookmarked';
}
/** Only server canonical identity is used. Bookmark + evidence + reference + replay commit atomically. */
export async function saveIssueSelection(
  db: D1Database,
  owner: string,
  issueId: string,
  selectionId: string,
  key: string,
  now = Date.now()
) {
  await ensureDeliveryUser(db, owner, now);
  const repo = new PublicationRepository(db),
    operation = `selection:save:${issueId}:${selectionId}`,
    hash = await requestHash({ issueId, selectionId });
  const old = await repo.replay<SaveIdentity>(owner, operation, key, hash);
  if (old)
    return { ...old, discoveryReferences: await discoveryReferences(db, owner, old.userItemId) };
  for (let attempt = 0; attempt < 3; attempt++) {
    const source = await resolvePublishedSelection(db, issueId, selectionId),
      state = await repo.issue(issueId);
    const item = requireFound(
      await db
        .prepare(
          'SELECT id AS item_id,updated_at,canonical_url,provider,provider_id,content_type,title,publisher,raw_metadata FROM items WHERE id=?'
        )
        .bind(source.itemId)
        .first<SavedSource>()
    );
    const eligibility = { ...item };
    if (eligibility.provider === 'GMAIL') {
      const edition = JSON.parse(eligibility.raw_metadata || '{}').publicWebUrl;
      if (typeof edition !== 'string') throw new PublicationError('NOT_FOUND', 404);
      eligibility.provider = 'WEB';
      eligibility.canonical_url = edition;
    }
    publicMetadata(eligibility);
    const prior = await db
      .prepare('SELECT id,state,updated_at FROM user_items WHERE user_id=? AND item_id=?')
      .bind(owner, source.itemId)
      .first<{ id: string; state: string; updated_at: string }>();
    const bookmarkId = prior?.id || ulid(),
      iso = new Date(now).toISOString();
    const result: SaveIdentity = {
      itemId: source.itemId,
      userItemId: bookmarkId,
      status: prior
        ? prior.state === 'BOOKMARKED'
          ? 'already_bookmarked'
          : 'rebookmarked'
        : 'created',
    };
    const condition = `EXISTS(SELECT 1 FROM personal_issues i JOIN personal_publications p ON p.id=i.publication_id
    JOIN personal_issue_selections s ON s.issue_id=i.id JOIN items t ON t.id=s.item_id
    WHERE i.id=? AND i.revision=? AND i.status='PUBLISHED' AND i.unavailable_at IS NULL AND p.unavailable_at IS NULL
    AND s.id=? AND s.removed_at IS NULL AND s.item_id=? AND s.metadata_json=? AND s.commentary IS ? AND t.updated_at=? AND t.canonical_url=? AND COALESCE(t.raw_metadata,'')=?)
    AND ${prior ? 'EXISTS(SELECT 1 FROM user_items WHERE id=? AND user_id=? AND state=? AND updated_at=?)' : 'NOT EXISTS(SELECT 1 FROM user_items WHERE user_id=? AND item_id=?)'}`;
    const args = [
      issueId,
      state.issue.revision,
      selectionId,
      source.itemId,
      JSON.stringify(source.metadata),
      source.commentary,
      item.updated_at,
      item.canonical_url,
      item.raw_metadata || '',
      ...(prior ? [prior.id, owner, prior.state, prior.updated_at] : [owner, source.itemId]),
    ];
    try {
      const committed = await repo.commit(
        owner,
        operation,
        key,
        hash,
        result,
        condition,
        args,
        (guard) => {
          const guarded = (sql: string, values: unknown[]) => repo.guarded(sql, values, guard);
          const statements: D1PreparedStatement[] = [];
          if (!prior)
            statements.push(
              guarded(
                `INSERT INTO user_items(id,user_id,item_id,state,ingested_at,bookmarked_at,created_at,updated_at)
     SELECT ?,?,?,'BOOKMARKED',?,?,?,? WHERE 1=1`,
                [bookmarkId, owner, source.itemId, iso, iso, iso, iso]
              )
            );
          if (prior?.state !== 'BOOKMARKED')
            statements.push(
              savedEvidenceStatement(db, {
                userId: owner,
                userItemId: bookmarkId,
                occurredAt: now,
                source: 'PUBLICATION_SAVE',
                newlyCreated: !prior,
                mutationGuard: guard,
              })
            );
          if (prior && prior.state !== 'BOOKMARKED')
            statements.push(
              guarded(
                `UPDATE user_items SET state='BOOKMARKED',bookmarked_at=?,updated_at=? WHERE id=? AND user_id=?`,
                [iso, iso, bookmarkId, owner]
              )
            );
          statements.push(
            guarded(
              `INSERT OR IGNORE INTO bookmark_enrichment_outbox(id,user_id,user_item_id,item_id,trigger,created_at,next_attempt_at)
     SELECT ?,?,?,?,'manual_save',?,? WHERE 1=1`,
              [ulid(), owner, bookmarkId, source.itemId, now, now]
            )
          );
          statements.push(
            guarded(
              `INSERT OR IGNORE INTO personal_discovery_references
     (id,user_item_id,selection_id,issue_id,publication_id,publication_name,issue_title,editor_name,commentary,saved_at)
     SELECT ?,?,?,?,?,?,?,?,?,? WHERE 1=1`,
              [
                ulid(),
                bookmarkId,
                selectionId,
                issueId,
                source.publicationId,
                source.publicationName,
                source.issueTitle,
                source.editorName,
                source.commentary,
                now,
              ]
            )
          );
          return statements;
        }
      );
      return {
        ...committed,
        discoveryReferences: await discoveryReferences(db, owner, committed.userItemId),
      };
    } catch (e) {
      if (e instanceof PublicationError && e.code === 'REVISION_CONFLICT' && attempt < 2) continue;
      throw e;
    }
  }
  throw new PublicationError('REVISION_CONFLICT', 409);
}
