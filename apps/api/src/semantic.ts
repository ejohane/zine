import { all, ApiError, atomicOwnerWrite, digest, id, now, ownedItem, stmt } from './lib';
import { ProviderError } from './remote';
import { reserveAIUsage } from './usage';
import type { Env } from './types';

interface SearchDocument {
  id: number;
  field: string;
  text: string;
  anchor_json: string | null;
  contribution_id: string | null;
}
export async function embedding(
  env: Env,
  text: string[],
  mode: 'documents' | 'queries',
  owner: string
) {
  if (!env.AI)
    throw new ApiError(503, 'semantic_search_not_ready', 'Embedding service is not configured');
  await reserveAIUsage(env, owner, text);
  let result: unknown;
  try {
    result = await env.AI.run(
      '@cf/qwen/qwen3-embedding-0.6b',
      mode === 'queries'
        ? {
            queries: text,
            instruction: 'Retrieve saved media and information relevant to this request.',
          }
        : { documents: text }
    );
  } catch (error) {
    if (/429|rate limit|quota/i.test(error instanceof Error ? error.message : ''))
      throw new ProviderError('rate_limited', true, 60);
    throw new ProviderError('embedding_service_unavailable', true);
  }
  const data = (result as { data?: number[][] }).data;
  if (
    !data ||
    data.length !== text.length ||
    data.some((vector) => vector.length !== 1024 || vector.some((n) => !Number.isFinite(n)))
  )
    throw new ProviderError('invalid_embedding_response', true);
  return data;
}
export const namespaceFor = (owner: string) =>
  digest(owner).then((hash) => `u_${hash.slice(0, 40)}`);

export async function indexItem(env: Env, owner: string, itemId: string) {
  if (!env.VECTORS || !env.AI) throw new ProviderError('semantic_index_not_configured', false);
  const item = await ownedItem(env, owner, itemId, true);
  const request = await stmt(
    env.DB,
    'SELECT requested_revision FROM index_requests WHERE item_id=?',
    itemId
  ).first<{ requested_revision: number }>();
  if (!request) return true;
  const namespace = await namespaceFor(owner);
  const existing = await all<{ document_id: number; vector_id: string; text_hash: string }>(
    env.DB,
    'SELECT document_id,vector_id,text_hash FROM indexed_documents WHERE item_id=?',
    itemId
  );
  const documents =
    item.status === 'deleted'
      ? []
      : await all<SearchDocument>(
          env.DB,
          'SELECT id,field,text,anchor_json,contribution_id FROM search_documents WHERE content_id=? AND (owner_id IS NULL OR owner_id=?) AND (item_id IS NULL OR item_id=?) ORDER BY id',
          item.content_id,
          owner,
          itemId
        );
  const liveIds = new Set(documents.map((document) => document.id));
  const removed = existing.filter((document) => !liveIds.has(document.document_id));
  if (removed.length) {
    for (let offset = 0; offset < removed.length; offset += 100)
      await env.VECTORS.deleteByIds(
        removed.slice(offset, offset + 100).map((document) => document.vector_id)
      );
    await env.DB.batch(
      removed.map((document) =>
        stmt(env.DB, 'DELETE FROM indexed_documents WHERE vector_id=?', document.vector_id)
      )
    );
  }
  const existingById = new Map(existing.map((entry) => [entry.document_id, entry]));
  let processed = 0;
  for (let offset = 0; offset < documents.length; offset += 20) {
    const batch = documents.slice(offset, offset + 20);
    const changes = [];
    for (const document of batch) {
      const hash = await digest(document.text);
      if (existingById.get(document.id)?.text_hash !== hash)
        changes.push({ document, hash, vectorId: `${itemId}_${document.id}` });
    }
    if (!changes.length) continue;
    const values = await embedding(
      env,
      changes.map((entry) => entry.document.text),
      'documents',
      owner
    );
    await env.VECTORS.upsert(
      changes.map((entry, index) => ({
        id: entry.vectorId,
        namespace,
        values: values[index],
        metadata: { itemId, documentId: String(entry.document.id) },
      }))
    );
    // A stale vector can exist briefly but is never authoritative: search joins
    // live SQL documents and owner state before exposing evidence.
    for (const entry of changes)
      await stmt(
        env.DB,
        `INSERT INTO indexed_documents(item_id,document_id,vector_id,namespace,text_hash)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_items WHERE id=? AND generation=? AND status!='deleted') AND EXISTS(SELECT 1 FROM search_documents WHERE id=? AND text=?)
      ON CONFLICT(item_id,document_id) DO UPDATE SET vector_id=excluded.vector_id,text_hash=excluded.text_hash`,
        itemId,
        entry.document.id,
        entry.vectorId,
        namespace,
        entry.hash,
        itemId,
        item.generation,
        entry.document.id,
        entry.document.text
      ).run();
    processed += changes.length;
    if (processed >= 100 && offset + 20 < documents.length) return false;
  }
  await stmt(
    env.DB,
    'UPDATE index_requests SET indexed_revision=? WHERE item_id=?',
    request.requested_revision,
    itemId
  ).run();
  return true;
}

export interface SemanticHit {
  id: string;
  score: number;
  documentId: number;
  matchedBy?: string[];
}
/** Vectorize requires compact metadata filters to be strictly below 2048 B. */
export function vectorFilterPages(eligible: string[]) {
  const pages: string[][] = [];
  let page: string[] = [];
  for (const itemId of eligible) {
    const next = [...page, itemId];
    if (new TextEncoder().encode(JSON.stringify({ itemId: { $in: next } })).length >= 2000) {
      if (!page.length)
        throw new ApiError(500, 'semantic_filter_invalid', 'Invalid indexed item identity');
      pages.push(page);
      page = [itemId];
    } else page = next;
  }
  if (page.length) pages.push(page);
  return pages;
}
export async function semanticCandidates(
  env: Env,
  owner: string,
  query: string,
  eligible: string[]
) {
  if (!env.VECTORS)
    throw new ApiError(503, 'semantic_search_not_ready', 'Semantic index is not configured');
  if (!eligible.length) return [];
  const vector = (await embedding(env, [query], 'queries', owner))[0];
  const namespace = await namespaceFor(owner);
  const hits: SemanticHit[] = [];
  // Filter eligible IDs before vector retrieval, then re-authorize every hit in
  // SQL. This avoids unrelated items consuming all filtered-search candidates.
  for (const page of vectorFilterPages(eligible)) {
    let result: VectorizeMatches;
    try {
      result = await env.VECTORS.query(vector, {
        namespace,
        topK: 100,
        returnMetadata: 'none',
        filter: { itemId: { $in: page } },
      });
    } catch {
      throw new ApiError(
        503,
        'semantic_search_unavailable',
        'Semantic retrieval is temporarily unavailable'
      );
    }
    if (!result.matches.length) continue;
    const ids = result.matches.map((match) => match.id);
    const allowed = await all<{ vector_id: string; item_id: string; document_id: number }>(
      env.DB,
      `SELECT v.vector_id,v.item_id,v.document_id FROM indexed_documents v
      JOIN personal_items p ON p.id=v.item_id JOIN search_documents d ON d.id=v.document_id
      WHERE p.owner_id=? AND p.status!='deleted' AND (d.owner_id IS NULL OR d.owner_id=?) AND v.vector_id IN (SELECT value FROM json_each(?))`,
      owner,
      owner,
      JSON.stringify(ids)
    );
    for (const match of result.matches) {
      const row = allowed.find((entry) => entry.vector_id === match.id);
      if (row && page.includes(row.item_id))
        hits.push({ id: row.item_id, score: match.score, documentId: row.document_id });
    }
  }
  const best = new Map<string, SemanticHit>();
  for (const hit of hits)
    if (!best.has(hit.id) || best.get(hit.id)!.score < hit.score) best.set(hit.id, hit);
  return [...best.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export async function semanticEvidence(env: Env, owner: string, hit: SemanticHit) {
  const row = await stmt(
    env.DB,
    `SELECT d.field,d.text,d.anchor_json,d.contribution_id FROM search_documents d
    JOIN personal_items p ON p.content_id=d.content_id WHERE p.id=? AND p.owner_id=? AND p.status!='deleted' AND d.id=? AND (d.owner_id IS NULL OR d.owner_id=?)`,
    hit.id,
    owner,
    hit.documentId,
    owner
  ).first<SearchDocument>();
  if (!row) return null;
  return {
    field: row.field,
    excerpt: row.text.slice(0, 1200),
    contributionId: row.contribution_id,
    matchedBy: hit.matchedBy ?? ['semantic'],
    ...(row.anchor_json ? JSON.parse(row.anchor_json) : {}),
  };
}

export async function saveSearchSession(
  env: Env,
  owner: string,
  signature: string,
  results: unknown[]
) {
  const sessionId = id('search');
  await atomicOwnerWrite(env, owner, [
    stmt(
      env.DB,
      'INSERT INTO search_sessions(id,owner_id,signature,results_json,expires_at) VALUES(?,?,?,?,?)',
      sessionId,
      owner,
      signature,
      JSON.stringify(results),
      new Date(Date.now() + 15 * 60000).toISOString()
    ),
  ]);
  return sessionId;
}
export async function loadSearchSession(
  env: Env,
  owner: string,
  signature: string,
  sessionId: string
) {
  const session = await stmt(
    env.DB,
    'SELECT results_json FROM search_sessions WHERE id=? AND owner_id=? AND signature=? AND expires_at>?',
    sessionId,
    owner,
    signature,
    now()
  ).first<string>('results_json');
  if (!session)
    throw new ApiError(
      422,
      'invalid_cursor',
      'Search cursor expired or belongs to a different query'
    );
  return JSON.parse(session) as SemanticHit[];
}
