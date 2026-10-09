import { ulid } from 'ulid';
import type { z } from 'zod';
import type {
  CreatePublicationSchema,
  PatchPublicationSchema,
  PatchIssueSchema,
} from '@zine/shared';
import { PublicationError, requireFound } from './errors';
import { fingerprint, resolvePublicMetadata, savedSource, type SavedSource } from './eligibility';
import { issueProjection, publicationProjection } from './projections';
import { PublicationRepository, requestHash } from './repository';
import type { IssueRow, IssueState, PublicationRow, SelectionRow } from './model';
export class PublicationService {
  readonly repo: PublicationRepository;
  constructor(public db: D1Database) {
    this.repo = new PublicationRepository(db);
  }
  async createPublication(
    owner: string,
    input: z.infer<typeof CreatePublicationSchema>,
    key: string
  ) {
    const hash = await requestHash(input),
      op = 'publication:create';
    const replay = await this.repo.replay(owner, op, key, hash);
    if (replay !== undefined) return replay;
    const id = ulid(),
      p: PublicationRow = {
        id,
        owner_id: owner,
        handle: id,
        editor_name: input.editorName,
        display_name: input.displayName,
        description: input.description,
        cover_asset_id: input.coverAssetId,
        revision: 1,
        created_at: Date.now(),
        unavailable_at: null,
      };
    await this.asset(owner, p.cover_asset_id);
    const response = { publication: publicationProjection(p, true) };
    return this.repo.commit(
      owner,
      op,
      key,
      hash,
      response,
      'NOT EXISTS(SELECT 1 FROM personal_publications WHERE owner_id=?)',
      [owner],
      (g) => [
        this.db
          .prepare(
            'INSERT INTO personal_publications(id,owner_id,handle,editor_name,display_name,description,cover_asset_id,revision,created_at) SELECT ?,?,?,?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM personal_publication_mutations WHERE id=?)'
          )
          .bind(
            id,
            owner,
            id,
            p.editor_name,
            p.display_name,
            p.description,
            p.cover_asset_id,
            p.created_at,
            g
          ),
      ]
    );
  }
  async patchPublication(
    owner: string,
    input: z.infer<typeof PatchPublicationSchema>,
    key: string
  ) {
    const hash = await requestHash(input),
      op = 'publication:patch';
    const replay = await this.repo.replay(owner, op, key, hash);
    if (replay !== undefined) return replay;
    const p = await this.repo.ownPublication(owner);
    await this.asset(owner, input.coverAssetId);
    if (p.revision !== input.expectedRevision)
      throw new PublicationError('REVISION_CONFLICT', 409, { currentRevision: p.revision });
    Object.assign(p, {
      editor_name: input.editorName,
      display_name: input.displayName,
      description: input.description,
      cover_asset_id: input.coverAssetId,
      revision: p.revision + 1,
    });
    return this.repo.commit(
      owner,
      op,
      key,
      hash,
      { publication: publicationProjection(p, true) },
      'EXISTS(SELECT 1 FROM personal_publications WHERE id=? AND owner_id=? AND revision=? AND unavailable_at IS NULL)',
      [p.id, owner, input.expectedRevision],
      (g) => [
        this.repo.guarded(
          'UPDATE personal_publications SET editor_name=?,display_name=?,description=?,cover_asset_id=?,revision=? WHERE id=?',
          [p.editor_name, p.display_name, p.description, p.cover_asset_id, p.revision, p.id],
          g
        ),
      ]
    );
  }
  async asset(owner: string, id: string | null) {
    if (!id) return;
    requireFound(
      await this.db
        .prepare(
          'SELECT id FROM personal_publication_assets WHERE id=? AND owner_id=? AND unavailable_at IS NULL'
        )
        .bind(id, owner)
        .first()
    );
  }
  async createIssue(
    owner: string,
    title: string,
    key: string,
    window?: { id: string; timezone: string; startAt: number; endAt: number },
    savedIds: string[] = []
  ) {
    const input = { title, window: window || null, savedIds },
      hash = await requestHash(input),
      op = window ? 'issue:create-weekly' : 'issue:create';
    const replay = await this.repo.replay(owner, op, key, hash);
    if (replay !== undefined) return replay;
    if (window) {
      let zoneValid = true;
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: window.timezone }).format();
      } catch {
        zoneValid = false;
      }
      if (
        !zoneValid ||
        !Number.isFinite(window.startAt) ||
        !Number.isFinite(window.endAt) ||
        window.startAt >= window.endAt ||
        window.endAt > Date.now()
      )
        throw new PublicationError('INVALID_INPUT', 400);
      const existing = await this.db
        .prepare(
          'SELECT id FROM personal_issues WHERE publication_id=(SELECT id FROM personal_publications WHERE owner_id=?) AND weekly_window_id=?'
        )
        .bind(owner, window.id)
        .first<{ id: string }>();
      if (existing)
        throw new PublicationError('WEEKLY_ISSUE_EXISTS', 409, { existingIssueId: existing.id });
    }
    const p = await this.repo.ownPublication(owner),
      id = ulid(),
      sectionId = ulid(),
      now = Date.now();
    const issue: IssueRow = {
      id,
      publication_id: p.id,
      kind: window ? 'WEEKLY' : 'INDEPENDENT',
      status: 'DRAFT',
      title,
      introduction: null,
      cover_asset_id: null,
      revision: 1,
      published_at: null,
      weekly_window_id: window?.id || null,
      weekly_timezone: window?.timezone || null,
      weekly_start: window?.startAt ?? null,
      weekly_end: window?.endAt ?? null,
      created_at: now,
      unavailable_at: null,
    };
    const state: IssueState = {
      issue,
      publication: p,
      sections: [{ id: sectionId, issue_id: id, heading: null, position: 0, removed_at: null }],
      selections: [],
    };
    const sources: SavedSource[] = [];
    for (const bookmark of savedIds) {
      const source = requireFound(await savedSource(this.db, owner, bookmark));
      if (source.state !== 'BOOKMARKED') throw new PublicationError('INELIGIBLE_SELECTIONS', 422);
      sources.push(source);
      state.selections.push(
        await this.selection(source, id, sectionId, ulid(), null, state.selections.length)
      );
    }
    this.validate(state);
    const condition = this.sourceCondition(sources);
    return this.repo.commit(
      owner,
      op,
      key,
      hash,
      { issue: issueProjection(state, true) },
      `EXISTS(SELECT 1 FROM personal_publications WHERE id=? AND owner_id=? AND unavailable_at IS NULL)${condition.sql}`,
      [p.id, owner, ...condition.values],
      (g) => [
        this.db
          .prepare(
            `INSERT INTO personal_issues(id,publication_id,kind,title,weekly_window_id,weekly_timezone,weekly_start,weekly_end,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_publication_mutations WHERE id=?)`
          )
          .bind(
            id,
            p.id,
            issue.kind,
            title,
            issue.weekly_window_id,
            issue.weekly_timezone,
            issue.weekly_start,
            issue.weekly_end,
            now,
            g
          ),
        ...this.stateStatements(state, g),
      ]
    );
  }
  async selection(
    source: SavedSource,
    issueId: string,
    sectionId: string,
    id: string,
    commentary: string | null,
    position: number
  ): Promise<SelectionRow> {
    if (source.state !== 'BOOKMARKED')
      throw new PublicationError('INELIGIBLE_SELECTIONS', 422, { reason: 'NOT_SAVED' });
    return {
      id,
      issue_id: issueId,
      section_id: sectionId,
      item_id: source.item_id,
      bookmark_id: source.id,
      metadata_json: JSON.stringify(await resolvePublicMetadata(source)),
      source_fingerprint: await fingerprint(source),
      commentary,
      position,
      first_published_at: null,
      first_published_revision: null,
      removed_at: null,
    };
  }
  validate(s: IssueState) {
    const sections = s.sections.filter((v) => v.removed_at === null),
      selections = s.selections.filter((v) => v.removed_at === null);
    if (!sections.length || sections.length > 20 || selections.length > 100)
      throw new PublicationError('INVALID_INPUT', 400);
    if (new Set(selections.map((v) => v.item_id)).size !== selections.length)
      throw new PublicationError('DUPLICATE_SELECTION', 409);
    if (selections.some((v) => !sections.some((t) => t.id === v.section_id)))
      throw new PublicationError('INVALID_INPUT', 400);
  }
  sourceCondition(sources: SavedSource[]) {
    if (!sources.length) return { sql: '', values: [] as unknown[] };
    return {
      sql: ` AND NOT EXISTS(SELECT 1 FROM json_each(?) source WHERE NOT EXISTS(SELECT 1 FROM user_items ui JOIN items i ON i.id=ui.item_id WHERE ui.id=json_extract(source.value,'$[0]') AND ui.state='BOOKMARKED' AND i.updated_at=json_extract(source.value,'$[1]') AND i.canonical_url=json_extract(source.value,'$[2]') AND i.raw_metadata IS json_extract(source.value,'$[3]') AND i.title=json_extract(source.value,'$[4]') AND i.provider=json_extract(source.value,'$[5]') AND i.id=json_extract(source.value,'$[6]') AND ui.user_id=json_extract(source.value,'$[7]')))`,
      values: [
        JSON.stringify(
          sources.map((s) => [
            s.id,
            s.updated_at,
            s.canonical_url,
            s.raw_metadata,
            s.title,
            s.provider,
            s.item_id,
            s.user_id,
          ])
        ),
      ],
    };
  }
  stateStatements(s: IssueState, g: string): D1PreparedStatement[] {
    // Tombstone removed rows first so remove/re-add cannot violate active item uniqueness.
    return [
      ...s.selections
        .filter((v) => v.removed_at !== null)
        .map((v) =>
          this.repo.guarded(
            'UPDATE personal_issue_selections SET removed_at=? WHERE id=?',
            [v.removed_at, v.id],
            g
          )
        ),
      ...s.sections.map((v) =>
        this.db
          .prepare(
            `INSERT INTO personal_issue_sections(id,issue_id,heading,position,removed_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_publication_mutations WHERE id=?) ON CONFLICT(id) DO UPDATE SET heading=excluded.heading,position=excluded.position,removed_at=excluded.removed_at WHERE personal_issue_sections.issue_id=excluded.issue_id`
          )
          .bind(v.id, s.issue.id, v.heading, v.position, v.removed_at, g)
      ),
      ...s.selections.map((v) =>
        this.db
          .prepare(
            `INSERT INTO personal_issue_selections(id,issue_id,section_id,item_id,bookmark_id,metadata_json,source_fingerprint,commentary,position,first_published_revision,first_published_at,removed_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_publication_mutations WHERE id=?) ON CONFLICT(id) DO UPDATE SET section_id=excluded.section_id,metadata_json=excluded.metadata_json,source_fingerprint=excluded.source_fingerprint,commentary=excluded.commentary,position=excluded.position,first_published_revision=excluded.first_published_revision,first_published_at=excluded.first_published_at,removed_at=excluded.removed_at WHERE personal_issue_selections.issue_id=excluded.issue_id`
          )
          .bind(
            v.id,
            s.issue.id,
            v.section_id,
            v.item_id,
            v.bookmark_id,
            v.metadata_json,
            v.source_fingerprint,
            v.commentary,
            v.position,
            v.first_published_revision,
            v.first_published_at,
            v.removed_at,
            g
          )
      ),
    ];
  }
  async mutateIssue(
    owner: string,
    id: string,
    input: z.infer<typeof PatchIssueSchema> | { expectedRevision: number },
    key: string,
    action: 'patch' | 'publish' | 'delete'
  ) {
    const op = `issue:${id}:${action}`,
      hash = await requestHash(input),
      replay = await this.repo.replay(owner, op, key, hash);
    if (replay !== undefined) return replay;
    const s = await this.repo.issue(id, owner),
      old = structuredClone(s),
      now = Date.now(),
      sources: SavedSource[] = [];
    if (s.issue.revision !== input.expectedRevision)
      throw new PublicationError('REVISION_CONFLICT', 409, { currentRevision: s.issue.revision });
    if (action === 'publish' && s.issue.status === 'PUBLISHED')
      throw new PublicationError('RESOURCE_CONFLICT', 409);
    if (action === 'patch' && 'operations' in input)
      for (const o of input.operations) {
        const section = (sid: string) =>
          requireFound(s.sections.find((v) => v.id === sid && v.removed_at === null));
        const selection = (sid: string) =>
          requireFound(s.selections.find((v) => v.id === sid && v.removed_at === null));
        if (o.type === 'setPresentation') {
          if (o.title !== undefined) s.issue.title = o.title;
          if (o.introduction !== undefined) s.issue.introduction = o.introduction;
          if (o.coverAssetId !== undefined) {
            await this.asset(owner, o.coverAssetId);
            s.issue.cover_asset_id = o.coverAssetId;
          }
        }
        if (o.type === 'addSection') {
          if (
            s.sections.some((v) => v.id === o.sectionId) ||
            (await this.db
              .prepare('SELECT id FROM personal_issue_sections WHERE id=?')
              .bind(o.sectionId)
              .first())
          )
            throw new PublicationError('RESOURCE_CONFLICT', 409);
          s.sections.push({
            id: o.sectionId,
            issue_id: id,
            heading: o.heading || null,
            position: s.sections.length,
            removed_at: null,
          });
        }
        if (o.type === 'setSectionHeading') section(o.sectionId).heading = o.heading;
        if (o.type === 'removeSection') {
          if (s.selections.some((v) => v.section_id === o.sectionId && v.removed_at === null))
            throw new PublicationError('RESOURCE_CONFLICT', 409);
          section(o.sectionId).removed_at = now;
        }
        if (o.type === 'addSelection') {
          if (s.issue.kind === 'WEEKLY' && s.issue.status === 'PUBLISHED')
            throw new PublicationError('ISSUE_SELECTION_LOCKED', 409);
          section(o.sectionId);
          if (
            s.selections.some((v) => v.id === o.selectionId) ||
            (await this.db
              .prepare('SELECT id FROM personal_issue_selections WHERE id=?')
              .bind(o.selectionId)
              .first())
          )
            throw new PublicationError('RESOURCE_CONFLICT', 409);
          const source = requireFound(await savedSource(this.db, owner, o.bookmarkId));
          sources.push(source);
          s.selections.push(
            await this.selection(
              source,
              id,
              o.sectionId,
              o.selectionId,
              o.commentary || null,
              s.selections.length
            )
          );
        }
        if (o.type === 'setCommentary') selection(o.selectionId).commentary = o.commentary;
        if (o.type === 'removeSelection') selection(o.selectionId).removed_at = now;
        if (o.type === 'setOrder') {
          const visible = s.sections.filter((v) => v.removed_at === null),
            sels = s.selections.filter((v) => v.removed_at === null),
            ids = o.sections.flatMap((v) => v.selectionIds);
          if (
            new Set(o.sections.map((v) => v.sectionId)).size !== visible.length ||
            o.sections.length !== visible.length ||
            ids.length !== sels.length ||
            new Set(ids).size !== ids.length
          )
            throw new PublicationError('INVALID_INPUT', 400);
          o.sections.forEach((v, i) => {
            section(v.sectionId).position = i;
            v.selectionIds.forEach((sid, j) => {
              Object.assign(selection(sid), { section_id: v.sectionId, position: j });
            });
          });
        }
      }
    this.validate(s);
    if (action === 'publish') {
      if (!s.issue.title || !s.selections.some((v) => v.removed_at === null))
        throw new PublicationError('ISSUE_NOT_READY', 422);
      await this.asset(owner, s.issue.cover_asset_id);
      for (const v of s.selections.filter((v) => v.removed_at === null)) {
        const source = requireFound(await savedSource(this.db, owner, requireFound(v.bookmark_id)));
        if (source.state !== 'BOOKMARKED') throw new PublicationError('INELIGIBLE_SELECTIONS', 422);
        sources.push(source);
        try {
          v.metadata_json = JSON.stringify(await resolvePublicMetadata(source));
        } catch (e) {
          // Existing safe public snapshots survive a dead original; private-source failures do not.
          if (!(e instanceof PublicationError) || e.details?.reason !== 'ORIGINAL_UNAVAILABLE')
            throw e;
          const snapshot = JSON.parse(v.metadata_json);
          v.metadata_json = JSON.stringify({ ...snapshot, originalAvailability: 'UNAVAILABLE' });
        }
        v.source_fingerprint = await fingerprint(source);
      }
      s.issue.status = 'PUBLISHED';
      s.issue.published_at = now;
    }
    const noOp = action === 'patch' && JSON.stringify(s) === JSON.stringify(old);
    if (!noOp) s.issue.revision++;
    if (action === 'delete') {
      s.issue.unavailable_at = now;
      s.issue.title = '';
      s.issue.introduction = null;
      s.issue.cover_asset_id = null;
      for (const section of s.sections) {
        section.heading = null;
        section.removed_at = now;
      }
      for (const v of s.selections) {
        v.removed_at = now;
        v.commentary = null;
        v.metadata_json = '{}';
        v.bookmark_id = null;
      }
    }
    const added = s.selections.filter(
      (v) =>
        v.removed_at === null && !old.selections.some((w) => w.id === v.id && w.removed_at === null)
    );
    if (s.issue.status === 'PUBLISHED')
      for (const v of s.selections.filter(
        (v) => v.removed_at === null && v.first_published_revision === null
      )) {
        v.first_published_revision = s.issue.revision;
        v.first_published_at = now;
      }
    const removed = old.selections.filter(
      (v) =>
        v.removed_at === null && !s.selections.some((w) => w.id === v.id && w.removed_at === null)
    );
    const kinds: Array<{ kind: string; ids: string[] }> = [];
    if (action === 'publish')
      kinds.push({
        kind: 'ISSUE_PUBLISHED',
        ids: s.selections.filter((v) => v.removed_at === null).map((v) => v.id),
      });
    else if (action === 'delete') kinds.push({ kind: 'ISSUE_UNAVAILABLE', ids: [] });
    else if (s.issue.status === 'PUBLISHED' && !noOp) {
      if (added.length) kinds.push({ kind: 'SELECTIONS_ADDED', ids: added.map((v) => v.id) });
      if (removed.length) kinds.push({ kind: 'SELECTIONS_REMOVED', ids: removed.map((v) => v.id) });
      if (!added.length && !removed.length) kinds.push({ kind: 'ISSUE_CORRECTED', ids: [] });
    }
    const response = action === 'delete' ? { deleted: true } : { issue: issueProjection(s, true) },
      condition = this.sourceCondition(sources);
    const ownershipSql = ` AND NOT EXISTS(SELECT 1 FROM personal_issue_sections WHERE id IN(SELECT value FROM json_each(?)) AND issue_id<>?) AND NOT EXISTS(SELECT 1 FROM personal_issue_selections WHERE id IN(SELECT value FROM json_each(?)) AND issue_id<>?)`;
    const ownershipValues = [
      JSON.stringify(s.sections.map((v) => v.id)),
      id,
      JSON.stringify(s.selections.map((v) => v.id)),
      id,
    ];
    return this.repo.commit(
      owner,
      op,
      key,
      hash,
      response,
      `EXISTS(SELECT 1 FROM personal_issues i JOIN personal_publications p ON p.id=i.publication_id WHERE i.id=? AND p.owner_id=? AND i.revision=? AND i.unavailable_at IS NULL AND p.unavailable_at IS NULL)${condition.sql}${ownershipSql}`,
      [id, owner, input.expectedRevision, ...condition.values, ...ownershipValues],
      (g) => [
        this.repo.guarded(
          'UPDATE personal_issues SET title=?,introduction=?,cover_asset_id=?,revision=?,status=?,published_at=?,unavailable_at=? WHERE id=?',
          [
            s.issue.title,
            s.issue.introduction,
            s.issue.cover_asset_id,
            s.issue.revision,
            s.issue.status,
            s.issue.published_at,
            s.issue.unavailable_at,
            id,
          ],
          g
        ),
        ...this.stateStatements(s, g),
        ...(action === 'delete'
          ? [
              this.repo.guarded(
                "UPDATE personal_issue_selections SET metadata_json='{}',commentary=NULL,bookmark_id=NULL,source_fingerprint='',removed_at=COALESCE(removed_at,?) WHERE issue_id=?",
                [now, id],
                g
              ),
              this.repo.guarded(
                'UPDATE personal_issue_sections SET heading=NULL,removed_at=COALESCE(removed_at,?) WHERE issue_id=?',
                [now, id],
                g
              ),
            ]
          : []),
        ...(action === 'delete' && old.issue.cover_asset_id
          ? [
              this.repo.guarded(
                `UPDATE personal_publication_assets SET unavailable_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM personal_publications WHERE cover_asset_id=personal_publication_assets.id AND unavailable_at IS NULL) AND NOT EXISTS(SELECT 1 FROM personal_issues WHERE cover_asset_id=personal_publication_assets.id AND unavailable_at IS NULL)`,
                [now, old.issue.cover_asset_id],
                g
              ),
            ]
          : []),
        ...kinds.flatMap((event) => {
          const eventId = ulid();
          return [
            this.db
              .prepare(
                `INSERT INTO personal_publication_events(id,publication_id,issue_id,revision,kind,selection_ids_json,occurred_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_publication_mutations WHERE id=?)`
              )
              .bind(
                eventId,
                s.publication.id,
                id,
                s.issue.revision,
                event.kind,
                JSON.stringify(event.ids),
                now,
                g
              ),
            this.db
              .prepare(
                'INSERT INTO personal_publication_outbox(event_id,next_attempt_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM personal_publication_mutations WHERE id=?)'
              )
              .bind(eventId, now, g),
          ];
        }),
      ]
    );
  }
}
