import { ulid } from 'ulid';
import { publicMetadata, type SavedSource } from './eligibility';
import { PublicationError, requireFound } from './errors';
import type { IssueRow, IssueState, PublicationRow, SectionRow, SelectionRow } from './model';
export async function requestHash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value))
  );
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export class PublicationRepository {
  constructor(public db: D1Database) {}
  async publication(id: string, owner?: string): Promise<PublicationRow> {
    return requireFound(
      await this.db
        .prepare(
          `SELECT * FROM personal_publications WHERE id=? AND unavailable_at IS NULL ${owner ? 'AND owner_id=?' : ''}`
        )
        .bind(...(owner ? [id, owner] : [id]))
        .first<PublicationRow>()
    );
  }
  async ownPublication(owner: string): Promise<PublicationRow> {
    return requireFound(
      await this.db
        .prepare('SELECT * FROM personal_publications WHERE owner_id=? AND unavailable_at IS NULL')
        .bind(owner)
        .first<PublicationRow>()
    );
  }
  async issue(id: string, owner?: string): Promise<IssueState> {
    const issue = requireFound(
      await this.db
        .prepare('SELECT * FROM personal_issues WHERE id=? AND unavailable_at IS NULL')
        .bind(id)
        .first<IssueRow>()
    );
    const publication = await this.publication(issue.publication_id, owner);
    if (!owner && issue.status !== 'PUBLISHED') throw new PublicationError('NOT_FOUND', 404);
    const [sections, selections] = await Promise.all([
      this.db
        .prepare('SELECT * FROM personal_issue_sections WHERE issue_id=? AND removed_at IS NULL')
        .bind(id)
        .all<SectionRow>(),
      this.db
        .prepare('SELECT * FROM personal_issue_selections WHERE issue_id=? AND removed_at IS NULL')
        .bind(id)
        .all<SelectionRow>(),
    ]);
    let visible = selections.results;
    if (!owner) {
      const checks = await Promise.all(
        visible.map(async (selection) => {
          if (selection.removed_at !== null) return false;
          const item = await this.db
            .prepare(
              `SELECT id AS item_id,canonical_url,provider,provider_id,content_type,title,publisher,updated_at,raw_metadata FROM items WHERE id=?`
            )
            .bind(selection.item_id)
            .first<SavedSource>();
          if (!item) return false;
          try {
            if (item.provider === 'GMAIL') {
              const edition = JSON.parse(item.raw_metadata || '{}').publicWebUrl;
              if (typeof edition !== 'string') return false;
              item.provider = 'WEB';
              item.canonical_url = edition;
            }
            publicMetadata(item);
            return true;
          } catch {
            return false;
          }
        })
      );
      visible = visible.filter((_, index) => checks[index]);
    }
    return { issue, publication, sections: sections.results, selections: visible };
  }
  async replay<T>(
    actor: string,
    operation: string,
    key: string,
    hash: string
  ): Promise<T | undefined> {
    const row = await this.db
      .prepare(
        'SELECT request_hash,response_json FROM personal_publication_mutations WHERE actor_id=? AND operation=? AND key=?'
      )
      .bind(actor, operation, key)
      .first<{ request_hash: string; response_json: string }>();
    if (!row) return undefined;
    if (row.request_hash !== hash) throw new PublicationError('IDEMPOTENCY_CONFLICT', 409);
    return JSON.parse(row.response_json) as T;
  }
  async commit<T>(
    actor: string,
    operation: string,
    key: string,
    hash: string,
    response: T,
    condition: string,
    bindings: unknown[],
    statements: (guard: string) => D1PreparedStatement[]
  ): Promise<T> {
    const replay = await this.replay<T>(actor, operation, key, hash);
    if (replay !== undefined) return replay;
    const guard = ulid();
    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO personal_publication_mutations(id,actor_id,operation,key,request_hash,response_json,created_at) SELECT ?,?,?,?,?,?,? WHERE ${condition}`
          )
          .bind(
            guard,
            actor,
            operation,
            key,
            hash,
            JSON.stringify(response),
            Date.now(),
            ...bindings
          ),
        ...statements(guard),
      ]);
      if (results[0].meta.changes === 0) throw new PublicationError('REVISION_CONFLICT', 409);
    } catch (e) {
      const existing = await this.replay<T>(actor, operation, key, hash);
      if (existing !== undefined) return existing;
      if (e instanceof PublicationError) throw e;
      if (String(e).includes('UNIQUE constraint'))
        throw new PublicationError('RESOURCE_CONFLICT', 409);
      throw e;
    }
    return response;
  }
  guarded(sql: string, values: unknown[], guard: string): D1PreparedStatement {
    return this.db
      .prepare(`${sql} AND EXISTS(SELECT 1 FROM personal_publication_mutations WHERE id=?)`)
      .bind(...values, guard);
  }
}
