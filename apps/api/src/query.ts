import { z } from 'zod4';
import { all, ApiError, canonicalJson, digest } from './lib';
import { identify } from './identity';
import { getItem } from './items';
import type { Env, SqlValue } from './types';
import {
  semanticCandidates,
  semanticEvidence,
  saveSearchSession,
  loadSearchSession,
} from './semantic';
import type { SemanticHit } from './semantic';

export const filterSchema = z
  .object({
    status: z.enum(['saved', 'received', 'dismissed']).default('saved'),
    archived: z.boolean().optional(),
    types: z.array(z.string().max(100)).max(30).optional(),
    platforms: z.array(z.string().max(100)).max(30).optional(),
    tags: z.array(z.string().max(100)).max(30).optional(),
    tagMatch: z.enum(['any', 'all']).default('any'),
    collectionIds: z.array(z.string()).max(30).optional(),
    subscriptionIds: z.array(z.string()).max(30).optional(),
    sourceIds: z.array(z.string()).max(30).optional(),
    completed: z.boolean().optional(),
    savedAfter: z.iso.datetime({ offset: true }).optional(),
    savedBefore: z.iso.datetime({ offset: true }).optional(),
    url: z.string().max(8192).optional(),
  })
  .strict();
export const searchSchema = z
  .object({
    query: z.string().trim().min(1).max(2000),
    match: z.enum(['keyword', 'semantic', 'hybrid']).default('hybrid'),
    filters: filterSchema.default({ status: 'saved', tagMatch: 'any' }),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().max(3000).optional(),
  })
  .strict();
type Filters = z.infer<typeof filterSchema>;
export function filterSql(owner: string, filters: Filters) {
  const where = ['p.owner_id=?', 'p.status=?'];
  const params: SqlValue[] = [owner, filters.status];
  if (filters.archived !== undefined) {
    where.push('p.archived=?');
    params.push(filters.archived ? 1 : 0);
  }
  const any = (column: string, values?: string[]) => {
    if (values?.length) {
      where.push(`${column} IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(values));
    }
  };
  any('COALESCE(p.content_type,c.kind)', filters.types);
  any('c.platform', filters.platforms);
  if (filters.tags?.length) {
    where.push(
      `(SELECT COUNT(DISTINCT tag) FROM item_tags t WHERE t.item_id=p.id AND t.tag IN (SELECT value FROM json_each(?))) ${filters.tagMatch === 'all' ? '=' : '>='} ?`
    );
    params.push(
      JSON.stringify(filters.tags),
      filters.tagMatch === 'all' ? new Set(filters.tags).size : 1
    );
  }
  if (filters.collectionIds?.length) {
    where.push(
      `EXISTS(SELECT 1 FROM collection_members m WHERE m.item_id=p.id AND m.collection_id IN (SELECT value FROM json_each(?)))`
    );
    params.push(JSON.stringify(filters.collectionIds));
  }
  if (filters.subscriptionIds?.length) {
    where.push(
      `EXISTS(SELECT 1 FROM save_occurrences o WHERE o.item_id=p.id AND o.subscription_id IN (SELECT value FROM json_each(?)))`
    );
    params.push(JSON.stringify(filters.subscriptionIds));
  }
  if (filters.sourceIds?.length) {
    where.push(
      `(EXISTS(SELECT 1 FROM save_occurrences o JOIN subscriptions s ON s.id=o.subscription_id WHERE o.item_id=p.id AND s.owner_id=p.owner_id AND s.source_id IN (SELECT value FROM json_each(?)))
      OR EXISTS(SELECT 1 FROM sources s JOIN contributions d ON d.content_id=p.content_id WHERE s.owner_id=p.owner_id AND s.id IN(SELECT value FROM json_each(?)) AND d.field='source' AND (d.owner_id IS NULL OR d.owner_id=p.owner_id)
      AND d.id=(SELECT preferred.id FROM contributions preferred WHERE preferred.content_id=p.content_id AND preferred.field='source' AND (preferred.owner_id IS NULL OR preferred.owner_id=p.owner_id) ORDER BY CASE WHEN preferred.category='correction' THEN 1 ELSE 0 END DESC,preferred.priority DESC,preferred.created_at,preferred.id LIMIT 1)
      AND (s.url=json_extract(d.value_json,'$.url') OR (s.platform='x' AND s.identity_key='x:'||json_extract(d.value_json,'$.kind')||':'||json_extract(d.value_json,'$.id')))))`
    );
    params.push(JSON.stringify(filters.sourceIds), JSON.stringify(filters.sourceIds));
  }
  if (filters.completed !== undefined)
    where.push(
      `${filters.completed ? '' : 'NOT '}EXISTS(SELECT 1 FROM progress pr WHERE pr.item_id=p.id AND pr.completed_at IS NOT NULL)`
    );
  if (filters.savedAfter) {
    where.push('p.saved_at>=?');
    params.push(filters.savedAfter);
  }
  if (filters.savedBefore) {
    where.push('p.saved_at<=?');
    params.push(filters.savedBefore);
  }
  if (filters.url) {
    where.push(
      '(c.identity_key=? OR p.id IN (SELECT a.canonical_item_id FROM item_aliases a JOIN personal_items old ON old.id=a.alias_item_id JOIN content_items old_content ON old_content.id=old.content_id WHERE a.owner_id=? AND old_content.identity_key=?))'
    );
    params.push(identify(filters.url).key, owner, identify(filters.url).key);
  }
  return { where, params };
}

function encode(value: unknown) {
  return btoa(JSON.stringify(value));
}
function decode(cursor: string, signature: string): { id: string; sort: string | number } {
  try {
    const value = JSON.parse(atob(cursor));
    if (
      value.signature !== signature ||
      typeof value.id !== 'string' ||
      !['string', 'number'].includes(typeof value.sort)
    )
      throw new Error();
    return value;
  } catch {
    throw new ApiError(422, 'invalid_cursor', 'Cursor is invalid or belongs to a different query');
  }
}

export async function listItems(
  env: Env,
  owner: string,
  filters: Filters,
  limit = 50,
  cursor?: string
) {
  const { where, params } = filterSql(owner, filters);
  const signature = await digest(canonicalJson({ owner, filters }));
  const ordering =
    filters.status === 'received'
      ? 'COALESCE(p.ingested_at,p.created_at)'
      : 'COALESCE(p.saved_at,p.created_at)';
  if (cursor) {
    const after = decode(cursor, signature);
    where.push(`(${ordering}<? OR (${ordering}=? AND p.id<?))`);
    params.push(after.sort, after.sort, after.id);
  }
  const rows = await all<{ id: string; sort: string }>(
    env.DB,
    `SELECT p.id,${ordering} AS sort FROM personal_items p JOIN content_items c ON c.id=p.content_id WHERE ${where.join(' AND ')} ORDER BY sort DESC,p.id DESC LIMIT ?`,
    ...params,
    limit + 1
  );
  const page = rows.slice(0, limit);
  const items = await Promise.all(page.map((row) => getItem(env, owner, row.id)));
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last ? encode({ signature, id: last.id, sort: last.sort }) : null,
  };
}

export async function searchItems(env: Env, owner: string, input: z.infer<typeof searchSchema>) {
  if (input.match !== 'keyword') return rankedSearch(env, owner, input);
  const words = input.query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 50) ?? [];
  if (!words.length) throw new ApiError(422, 'empty_search', 'Search requires words');
  const ftsQuery = words.map((word) => `"${word.replaceAll('"', '""')}"`).join(' OR ');
  const { where, params } = filterSql(owner, input.filters);
  const signature = await digest(
    canonicalJson({ owner, query: input.query, match: input.match, filters: input.filters })
  );
  const after = input.cursor ? decode(input.cursor, signature) : null;
  const cursorWhere = after ? 'WHERE (rank>? OR (rank=? AND id>?))' : '';
  const rows = await all<{ id: string; rank: number }>(
    env.DB,
    `WITH hits AS MATERIALIZED (
      SELECT d.content_id,d.item_id,bm25(search_fts) AS score FROM search_fts JOIN search_documents d ON d.id=search_fts.rowid
      WHERE search_fts MATCH ? AND (d.owner_id IS NULL OR d.owner_id=?)
    ), ranked AS (
      SELECT p.id,MIN(h.score) AS rank FROM personal_items p JOIN content_items c ON c.id=p.content_id
      JOIN hits h ON h.content_id=p.content_id AND (h.item_id IS NULL OR h.item_id=p.id)
      WHERE ${where.join(' AND ')} GROUP BY p.id
    ) SELECT * FROM ranked ${cursorWhere} ORDER BY rank,id LIMIT ?`,
    ftsQuery,
    owner,
    ...params,
    ...(after ? [after.sort, after.sort, after.id] : []),
    input.limit + 1
  );
  const page = rows.slice(0, input.limit);
  const items = await Promise.all(
    page.map(async (row) => {
      const item = await getItem(env, owner, row.id);
      const matches = await all<{
        field: string;
        excerpt: string;
        anchor_json: string | null;
        contribution_id: string | null;
      }>(
        env.DB,
        `SELECT d.field,snippet(search_fts,0,'','',' … ',40) AS excerpt,d.anchor_json,d.contribution_id
      FROM search_fts JOIN search_documents d ON d.id=search_fts.rowid
      WHERE search_fts MATCH ? AND d.content_id=? AND (d.owner_id IS NULL OR d.owner_id=?) AND (d.item_id IS NULL OR d.item_id=?) ORDER BY bm25(search_fts),d.id LIMIT 5`,
        ftsQuery,
        item.content.id,
        owner,
        item.id
      );
      return {
        ...item,
        matches: matches.map((m) => ({
          field: m.field,
          excerpt: m.excerpt,
          contributionId: m.contribution_id,
          ...(m.anchor_json ? JSON.parse(m.anchor_json) : {}),
        })),
      };
    })
  );
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > input.limit && last
        ? encode({ signature, id: last.id, sort: last.rank })
        : null,
  };
}

async function rankedSearch(env: Env, owner: string, input: z.infer<typeof searchSchema>) {
  const signature = await digest(
    canonicalJson({ owner, query: input.query, match: input.match, filters: input.filters })
  );
  const { where, params } = filterSql(owner, input.filters);
  let sessionId: string;
  let offset = 0;
  let results: SemanticHit[];
  if (input.cursor) {
    let cursor: { sessionId: string; offset: number };
    try {
      cursor = z
        .object({ sessionId: z.string(), offset: z.number().int().nonnegative() })
        .parse(JSON.parse(atob(input.cursor)));
    } catch {
      throw new ApiError(422, 'invalid_cursor', 'Invalid search cursor');
    }
    sessionId = cursor.sessionId;
    offset = cursor.offset;
    results = await loadSearchSession(env, owner, signature, sessionId);
  } else {
    const eligible = await all<{ id: string }>(
      env.DB,
      `SELECT p.id FROM personal_items p JOIN content_items c ON c.id=p.content_id WHERE ${where.join(' AND ')} ORDER BY p.id`,
      ...params
    );
    const semantic = await semanticCandidates(
      env,
      owner,
      input.query,
      eligible.map((row) => row.id)
    );
    results = semantic.map((hit) => ({ ...hit, matchedBy: ['semantic'] }));
    if (input.match === 'hybrid') {
      const words = input.query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 50) ?? [];
      if (words.length) {
        const ftsQuery = words.map((word) => `"${word.replaceAll('"', '""')}"`).join(' OR ');
        const keyword = await all<{ id: string; documentId: number; score: number }>(
          env.DB,
          `WITH hits AS MATERIALIZED (
          SELECT d.id AS document_id,d.content_id,d.item_id,bm25(search_fts) AS score FROM search_fts JOIN search_documents d ON d.id=search_fts.rowid WHERE search_fts MATCH ? AND (d.owner_id IS NULL OR d.owner_id=?)
        ), ranked AS (
          SELECT p.id,h.document_id AS documentId,h.score,ROW_NUMBER() OVER(PARTITION BY p.id ORDER BY h.score,h.document_id) AS n
          FROM personal_items p JOIN content_items c ON c.id=p.content_id JOIN hits h ON h.content_id=p.content_id AND (h.item_id IS NULL OR h.item_id=p.id)
          WHERE ${where.join(' AND ')}
        ) SELECT id,documentId,score FROM ranked WHERE n=1 ORDER BY score,id LIMIT 1000`,
          ftsQuery,
          owner,
          ...params
        );
        const fused = new Map<string, SemanticHit>();
        results.forEach((hit, index) => fused.set(hit.id, { ...hit, score: 1 / (60 + index + 1) }));
        keyword.forEach((hit, index) => {
          const existing = fused.get(hit.id);
          fused.set(hit.id, {
            id: hit.id,
            documentId: hit.documentId,
            score: (existing?.score ?? 0) + 1 / (60 + index + 1),
            matchedBy: existing ? ['keyword', 'semantic'] : ['keyword'],
          });
        });
        results = [...fused.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      }
    }
    results = results.slice(0, 1000);
    sessionId = await saveSearchSession(env, owner, signature, results);
  }
  const page = results.slice(offset, offset + input.limit);
  const stillAllowed = page.length
    ? await all<{ id: string }>(
        env.DB,
        `SELECT p.id FROM personal_items p JOIN content_items c ON c.id=p.content_id WHERE ${where.join(' AND ')} AND p.id IN (SELECT value FROM json_each(?))`,
        ...params,
        JSON.stringify(page.map((hit) => hit.id))
      )
    : [];
  const items = [];
  for (const hit of page) {
    if (!stillAllowed.some((row) => row.id === hit.id)) continue;
    const evidence = await semanticEvidence(env, owner, hit);
    if (!evidence) continue;
    try {
      items.push({ ...(await getItem(env, owner, hit.id)), score: hit.score, matches: [evidence] });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  const pending = await all<{ count: number }>(
    env.DB,
    `SELECT COUNT(*) AS count FROM index_requests r JOIN personal_items p ON p.id=r.item_id WHERE p.owner_id=? AND p.status!='deleted' AND r.requested_revision>r.indexed_revision`,
    owner
  );
  return {
    items,
    nextCursor:
      offset + input.limit < results.length
        ? encode({ sessionId, offset: offset + input.limit })
        : null,
    resultWindow: 1000,
    index: { pendingItems: pending[0]?.count ?? 0, eventuallyConsistent: true },
  };
}

export async function material(env: Env, owner: string, itemId: string, field: string) {
  const item = await getItem(env, owner, itemId, [field]);
  const content = item.content as Record<string, unknown>;
  if (Object.hasOwn(content, field))
    return { field, value: content[field], provenance: item.enrichment.fields[field] };
  const component = item.enrichment.components.find((c) => c.component === field);
  throw new ApiError(
    component?.status === 'pending' || component?.status === 'processing' ? 409 : 404,
    'material_unavailable',
    `No accessible ${field} is available`,
    { status: component?.status ?? 'unavailable', reasonCode: component?.reasonCode ?? null }
  );
}
