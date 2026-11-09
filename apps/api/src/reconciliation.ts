import { Hono } from 'hono';
import { z } from 'zod4';
import {
  contentIdentity,
  mutablePlatformIdentity,
  strongRedirect,
  unrelatedRedirect,
} from './identity';
import { extractYouTube } from './providers/youtube';
import { extractX } from './providers/x';
import { fetchPublic, ProviderError } from './remote';
import {
  all,
  ApiError,
  canonicalItemId,
  id,
  now,
  ownedItem,
  ownerGeneration,
  operationGeneration,
  parseBody,
  stableId,
  stmt,
} from './lib';
import type { AppEnv, Env, PersonalRow, Principal } from './types';

type Identity = Awaited<ReturnType<typeof contentIdentity>>;
interface Progress {
  position: number | null;
  unit: string | null;
  completed_at: string | null;
  updated_at: string;
  contributor: string;
}
export const reconciliationSchema = z
  .object({ targetItemId: z.string().min(1).max(100).optional() })
  .strict();
export interface ReconciliationResult {
  outcome: 'merged' | 'unchanged' | 'suppressed';
  sourceItemId: string;
  canonicalItemId: string;
  eventId: string | null;
}
const progressObservation = (p: Progress | null) =>
  p
    ? {
        position: p.position,
        unit: p.unit,
        completedAt: p.completed_at,
        updatedAt: p.updated_at,
        contributor: p.contributor,
      }
    : null;
const decision = (row: PersonalRow) => ({
  status: row.status,
  archived: !!row.archived,
  savedAt: row.saved_at,
  decisionAt: row.decision_at ?? row.created_at,
  origin: row.decision_origin,
});
function chooseDecision(source: PersonalRow, target: PersonalRow | null) {
  if (!target) return source;
  if (source.decision_origin === 'explicit' && target.decision_origin !== 'explicit') return source;
  if (target.decision_origin === 'explicit' && source.decision_origin !== 'explicit') return target;
  if (
    source.decision_origin === 'explicit' &&
    (source.decision_at ?? source.created_at) > (target.decision_at ?? target.created_at)
  )
    return source;
  return target;
}

/** The caller must have established a public HTTP redirect, never a canonical-tag hint. */
export async function reconcileVerifiedIdentity(
  env: Env,
  principal: Principal,
  sourceItemId: string,
  finalUrl: string,
  expectedGeneration?: number,
  evidenceMethod: 'http-redirect' | 'platform-identifier' = 'http-redirect'
): Promise<ReconciliationResult> {
  const owner = principal.userId;
  const epoch = await operationGeneration(env, owner);
  const identity = await contentIdentity(finalUrl);
  const intendedTarget = await canonicalItemId(
    env,
    owner,
    await stableId('itm', owner, identity.id)
  );
  for (let attempt = 0; attempt < 8; attempt++) {
    const currentSource = await canonicalItemId(env, owner, sourceItemId);
    if (currentSource !== sourceItemId) {
      if (currentSource !== intendedTarget)
        throw new ApiError(
          409,
          'identity_changed',
          'Identity was reconciled concurrently; retry against its canonical reference'
        );
      return { outcome: 'unchanged', sourceItemId, canonicalItemId: currentSource, eventId: null };
    }
    const source = await ownedItem(env, owner, sourceItemId);
    if (expectedGeneration !== undefined && source.generation !== expectedGeneration)
      throw new ApiError(
        409,
        'stale_generation',
        'Reconciliation belongs to a deleted item generation'
      );
    if (source.content_id === identity.id)
      return { outcome: 'unchanged', sourceItemId, canonicalItemId: sourceItemId, eventId: null };
    const targetId = await canonicalItemId(env, owner, intendedTarget);
    if (targetId === sourceItemId)
      return { outcome: 'unchanged', sourceItemId, canonicalItemId: sourceItemId, eventId: null };
    const target = await stmt(
      env.DB,
      'SELECT * FROM personal_items WHERE id=? AND owner_id=?',
      targetId,
      owner
    ).first<PersonalRow>();
    if (target && target.content_id !== identity.id)
      throw new ApiError(
        409,
        'identity_changed',
        'The destination identity changed; resolve it again'
      );
    const sourceContent = await stmt(
      env.DB,
      'SELECT canonical_url,identity_key,platform,kind FROM content_items WHERE id=?',
      source.content_id
    ).first<{ canonical_url: string; identity_key: string; platform: string; kind: string }>();
    if (!sourceContent)
      throw new ApiError(409, 'identity_unavailable', 'Source identity is unavailable');
    const mutableToStable =
      (/^youtube:(handle|username|custom):/.test(sourceContent.identity_key) &&
        identity.platform === 'youtube' &&
        identity.key.startsWith('youtube:channel:')) ||
      (sourceContent.identity_key.startsWith('x:account:') &&
        identity.key.startsWith('x:account_id:'));
    if (['youtube', 'spotify', 'x'].includes(sourceContent.platform) && !mutableToStable)
      throw new ApiError(
        409,
        'different_platform_identity',
        'Distinct immutable platform items remain separate; record a relationship instead'
      );
    if (evidenceMethod === 'platform-identifier' && !mutableToStable)
      throw new ApiError(
        409,
        'identity_not_established',
        'A provider identity can resolve only its own mutable alias'
      );

    if (unrelatedRedirect(sourceContent.canonical_url, identity.url))
      throw new ApiError(
        409,
        'identity_not_established',
        'An access gate or homepage fallback does not establish identity'
      );
    const winner = chooseDecision(source, target);
    const suppressed = winner.status === 'deleted';
    const timestamp = now();
    const eventId = suppressed ? null : id('rec');
    const guard = id('guard');
    const targetGuard = id('guard');
    const targetGeneration = target
      ? target.generation + Number(target.status === 'deleted' && !suppressed)
      : epoch;
    const [sourceProgress, targetProgress, sourceMemberships, targetMemberships, collapsed] =
      await Promise.all([
        stmt(
          env.DB,
          'SELECT position,unit,completed_at,updated_at,contributor FROM progress WHERE item_id=?',
          sourceItemId
        ).first<Progress>(),
        stmt(
          env.DB,
          'SELECT position,unit,completed_at,updated_at,contributor FROM progress WHERE item_id=?',
          targetId
        ).first<Progress>(),
        all<{ collection_id: string; position: number }>(
          env.DB,
          'SELECT collection_id,position FROM collection_members WHERE item_id=?',
          sourceItemId
        ),
        all<{ collection_id: string; position: number }>(
          env.DB,
          'SELECT collection_id,position FROM collection_members WHERE item_id=?',
          targetId
        ),
        all<Record<string, unknown>>(
          env.DB,
          'SELECT * FROM item_relationships WHERE owner_id=? AND ((source_item_id=? AND target_content_id=?) OR (source_item_id=? AND target_content_id=?))',
          owner,
          sourceItemId,
          identity.id,
          targetId,
          source.content_id
        ),
      ]);
    const progress =
      sourceProgress && (!targetProgress || sourceProgress.updated_at > targetProgress.updated_at)
        ? sourceProgress
        : targetProgress;
    const state = {
      originalSourceItemId: sourceItemId,
      originalTargetItemId: targetId,
      source: decision(source),
      target: target ? decision(target) : null,
      lifecycleResolution:
        winner.id === sourceItemId ? 'source_explicit_or_new' : 'existing_target',
      progress: {
        source: progressObservation(sourceProgress),
        target: progressObservation(targetProgress),
        resolution: !progress ? 'none' : progress === sourceProgress ? 'source' : 'target',
      },
      collectionPositionConflicts: sourceMemberships.flatMap((s) =>
        targetMemberships
          .filter((t) => t.collection_id === s.collection_id)
          .map((t) => ({
            collectionId: s.collection_id,
            source: s.position,
            target: t.position,
            resolution: 'target',
          }))
      ),
      collapsedRelationships: collapsed.map((r) => ({
        id: r.id,
        sourceItemId: r.source_item_id,
        targetContentId: r.target_content_id,
        kind: r.kind,
        contributor: r.contributor,
        provenance: JSON.parse(String(r.provenance_json)),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
    const statements: D1PreparedStatement[] = [
      stmt(
        env.DB,
        'INSERT INTO write_guards(id,valid) SELECT ?,COALESCE((SELECT revision FROM personal_items WHERE id=? AND owner_id=?),-1)=? AND COALESCE((SELECT generation FROM owner_generations WHERE owner_id=?),0)=?',
        guard,
        sourceItemId,
        owner,
        source.revision,
        owner,
        epoch
      ),
      stmt(
        env.DB,
        'INSERT INTO write_guards(id,valid) SELECT ?,COALESCE((SELECT revision FROM personal_items WHERE id=? AND owner_id=?),-1)=? AND COALESCE((SELECT generation FROM owner_generations WHERE owner_id=?),0)=?',
        targetGuard,
        targetId,
        owner,
        target?.revision ?? -1,
        owner,
        epoch
      ),
      stmt(
        env.DB,
        'INSERT OR IGNORE INTO content_items(id,identity_key,canonical_url,platform,kind,created_at) VALUES(?,?,?,?,?,?)',
        identity.id,
        identity.key,
        identity.url,
        identity.platform,
        identity.kind,
        timestamp
      ),
    ];
    if (!target)
      statements.push(
        stmt(
          env.DB,
          'INSERT INTO personal_items(id,owner_id,content_id,status,archived,created_at,saved_at,updated_at,generation,content_type,decision_at,decision_origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          targetId,
          owner,
          identity.id,
          winner.status,
          winner.status === 'saved' ? winner.archived : 0,
          source.created_at,
          winner.saved_at,
          timestamp,
          targetGeneration,
          identity.kind,
          winner.decision_at ?? winner.created_at,
          winner.decision_origin
        )
      );
    // Source vectors and checkpoints cannot authorize or resurrect the retired personal ID.
    statements.push(
      stmt(
        env.DB,
        'INSERT OR IGNORE INTO vector_garbage(vector_id) SELECT vector_id FROM indexed_documents WHERE item_id=?',
        sourceItemId
      ),
      stmt(env.DB, 'DELETE FROM indexed_documents WHERE item_id=?', sourceItemId),
      stmt(
        env.DB,
        'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT artifact_key,? FROM understanding_artifacts WHERE owner_id=? AND item_id=?',
        timestamp,
        owner,
        sourceItemId
      ),
      stmt(
        env.DB,
        'DELETE FROM understanding_runs WHERE owner_id=? AND item_id=?',
        owner,
        sourceItemId
      ),
      stmt(
        env.DB,
        'DELETE FROM understanding_artifacts WHERE owner_id=? AND item_id=?',
        owner,
        sourceItemId
      ),
      stmt(env.DB, 'DELETE FROM understanding_requests WHERE item_id=?', sourceItemId)
    );
    if (suppressed) {
      statements.push(
        ...[
          'context_entries',
          'annotations',
          'save_occurrences',
          'item_tags',
          'collection_members',
          'collection_note_references',
          'progress',
        ].map((table) => stmt(env.DB, `DELETE FROM ${table} WHERE item_id=?`, sourceItemId)),
        stmt(
          env.DB,
          'DELETE FROM item_relationships WHERE owner_id=? AND (source_item_id=? OR target_content_id=?)',
          owner,
          sourceItemId,
          source.content_id
        ),
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT artifact_key,? FROM material_artifacts WHERE owner_id=? AND item_id=?',
          timestamp,
          owner,
          sourceItemId
        ),
        stmt(
          env.DB,
          'DELETE FROM material_artifacts WHERE owner_id=? AND item_id=?',
          owner,
          sourceItemId
        ),
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT artifact_key,? FROM contributions WHERE owner_id=? AND content_id=? AND artifact_key IS NOT NULL',
          timestamp,
          owner,
          source.content_id
        ),
        stmt(
          env.DB,
          'DELETE FROM search_documents WHERE owner_id=? AND (content_id=? OR item_id=?)',
          owner,
          source.content_id,
          sourceItemId
        ),
        stmt(
          env.DB,
          'DELETE FROM contributions WHERE owner_id=? AND content_id=?',
          owner,
          source.content_id
        ),
        stmt(
          env.DB,
          'DELETE FROM reconciliation_events WHERE owner_id=? AND (source_item_id=? OR target_item_id=?)',
          owner,
          sourceItemId,
          sourceItemId
        )
      );
    } else {
      statements.push(
        ...['context_entries', 'annotations', 'save_occurrences'].map((table) =>
          stmt(env.DB, `UPDATE ${table} SET item_id=? WHERE item_id=?`, targetId, sourceItemId)
        ),
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO item_tags(item_id,tag) SELECT ?,tag FROM item_tags WHERE item_id=?',
          targetId,
          sourceItemId
        ),
        stmt(env.DB, 'DELETE FROM item_tags WHERE item_id=?', sourceItemId),
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO collection_members(collection_id,item_id,position) SELECT collection_id,?,position FROM collection_members WHERE item_id=?',
          targetId,
          sourceItemId
        ),
        stmt(env.DB, 'DELETE FROM collection_members WHERE item_id=?', sourceItemId),
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO collection_note_references(note_id,item_id) SELECT note_id,? FROM collection_note_references WHERE item_id=?',
          targetId,
          sourceItemId
        ),
        stmt(env.DB, 'DELETE FROM collection_note_references WHERE item_id=?', sourceItemId)
      );
      if (progress)
        statements.push(
          stmt(
            env.DB,
            'INSERT INTO progress(item_id,position,unit,completed_at,updated_at,contributor) VALUES(?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET position=excluded.position,unit=excluded.unit,completed_at=excluded.completed_at,updated_at=excluded.updated_at,contributor=excluded.contributor',
            targetId,
            progress.position,
            progress.unit,
            progress.completed_at,
            progress.updated_at,
            progress.contributor
          )
        );
      statements.push(
        stmt(env.DB, 'DELETE FROM progress WHERE item_id=?', sourceItemId),
        stmt(
          env.DB,
          'UPDATE material_artifacts SET item_id=? WHERE owner_id=? AND item_id=?',
          targetId,
          owner,
          sourceItemId
        ),
        stmt(
          env.DB,
          'UPDATE contributions SET content_id=? WHERE content_id=? AND owner_id=?',
          identity.id,
          source.content_id,
          owner
        ),
        stmt(
          env.DB,
          'UPDATE search_documents SET content_id=?,item_id=CASE WHEN item_id=? THEN ? ELSE item_id END WHERE owner_id=? AND (content_id=? OR item_id=?)',
          identity.id,
          sourceItemId,
          targetId,
          owner,
          source.content_id,
          sourceItemId
        ),
        stmt(
          env.DB,
          "INSERT INTO enrichment_components(content_id,owner_id,component,status,reason_code,updated_at) SELECT ?,owner_id,component,status,reason_code,updated_at FROM enrichment_components WHERE content_id=? AND owner_id=? ON CONFLICT(content_id,owner_id,component) DO UPDATE SET status=CASE WHEN excluded.status='available' THEN excluded.status ELSE enrichment_components.status END,reason_code=CASE WHEN excluded.status='available' THEN NULL ELSE enrichment_components.reason_code END",
          identity.id,
          source.content_id,
          owner
        )
      );
      statements.push(
        stmt(
          env.DB,
          'UPDATE item_relationships SET source_item_id=CASE WHEN source_item_id=? THEN ? ELSE source_item_id END,target_content_id=CASE WHEN target_content_id=? THEN ? ELSE target_content_id END WHERE owner_id=? AND (source_item_id=? OR target_content_id=?)',
          sourceItemId,
          targetId,
          source.content_id,
          identity.id,
          owner,
          sourceItemId,
          source.content_id
        ),
        stmt(
          env.DB,
          'DELETE FROM item_relationships WHERE owner_id=? AND source_item_id=? AND target_content_id=?',
          owner,
          targetId,
          identity.id
        )
      );
      statements.push(
        stmt(
          env.DB,
          "UPDATE personal_items SET status=?,archived=?,saved_at=?,created_at=?,updated_at=?,revision=revision+1,generation=?,decision_at=?,decision_origin=?,content_type=COALESCE((SELECT json_extract(value_json,'$') FROM contributions WHERE content_id=? AND field='type' AND (owner_id IS NULL OR owner_id=?) ORDER BY CASE WHEN category='correction' AND owner_id=? THEN 1 ELSE 0 END DESC,priority DESC,created_at,id LIMIT 1),?) WHERE id=?",
          winner.status,
          winner.status === 'saved' ? winner.archived : 0,
          winner.saved_at,
          target && target.status !== 'deleted'
            ? [source.created_at, target.created_at].sort()[0]
            : source.created_at,
          timestamp,
          targetGeneration,
          winner.decision_at ?? winner.created_at,
          winner.decision_origin,
          identity.id,
          owner,
          owner,
          identity.kind,
          targetId
        ),
        stmt(
          env.DB,
          'UPDATE reconciliation_events SET target_item_id=? WHERE owner_id=? AND target_item_id=?',
          targetId,
          owner,
          sourceItemId
        ),
        stmt(
          env.DB,
          'INSERT INTO reconciliation_events(id,owner_id,source_item_id,target_item_id,contributor,evidence_json,state_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
          eventId!,
          owner,
          sourceItemId,
          targetId,
          principal.contributor,
          JSON.stringify({
            method: evidenceMethod,
            sourceUrl: sourceContent.canonical_url,
            finalUrl: identity.url,
            observedAt: timestamp,
          }),
          JSON.stringify(state),
          timestamp
        ),
        stmt(
          env.DB,
          'INSERT INTO index_requests(item_id) VALUES(?) ON CONFLICT(item_id) DO UPDATE SET requested_revision=requested_revision+1',
          targetId
        ),
        stmt(
          env.DB,
          'INSERT INTO understanding_requests(item_id) VALUES(?) ON CONFLICT(item_id) DO UPDATE SET requested_revision=requested_revision+1',
          targetId
        )
      );
      statements.push(
        stmt(
          env.DB,
          "INSERT INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at) SELECT ?,?,?,'enrich',?,'pending',?,?,? WHERE NOT EXISTS(SELECT 1 FROM jobs WHERE item_id=? AND kind='enrich' AND json_extract(payload_json,'$.stage') IS NULL AND status IN ('pending','running'))",
          id('job'),
          owner,
          targetId,
          JSON.stringify({
            contentId: identity.id,
            url: identity.url,
            generation: targetGeneration,
          }),
          timestamp,
          timestamp,
          timestamp,
          targetId
        )
      );
    }
    statements.push(
      stmt(
        env.DB,
        'DELETE FROM enrichment_components WHERE owner_id=? AND content_id=?',
        owner,
        source.content_id
      ),
      stmt(
        env.DB,
        "UPDATE jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,payload_json='{}',last_error_code='identity_reconciled',updated_at=? WHERE owner_id=? AND item_id=?",
        timestamp,
        owner,
        sourceItemId
      ),
      stmt(
        env.DB,
        "UPDATE personal_items SET status='deleted',archived=0,saved_at=NULL,content_type=NULL,updated_at=?,revision=revision+1,generation=generation+1 WHERE id=?",
        timestamp,
        sourceItemId
      ),
      stmt(
        env.DB,
        'UPDATE item_aliases SET canonical_item_id=? WHERE owner_id=? AND canonical_item_id=?',
        targetId,
        owner,
        sourceItemId
      ),
      stmt(
        env.DB,
        'INSERT INTO item_aliases(alias_item_id,owner_id,canonical_item_id,created_at) VALUES(?,?,?,?)',
        sourceItemId,
        owner,
        targetId,
        timestamp
      ),
      stmt(
        env.DB,
        'UPDATE index_requests SET indexed_revision=requested_revision WHERE item_id=?',
        sourceItemId
      ),
      stmt(env.DB, 'DELETE FROM write_guards WHERE id IN (?,?)', guard, targetGuard)
    );
    if (suppressed)
      statements.push(
        stmt(
          env.DB,
          `UPDATE idempotency SET response_json='{"error":{"code":"save_deleted","message":"This save was deleted; use a new idempotency key for an intentional new save"}}',status_code=410 WHERE owner_id=? AND json_extract(response_json,'$.item.id') IN (SELECT ? UNION SELECT alias_item_id FROM item_aliases WHERE owner_id=? AND canonical_item_id=?)`,
          owner,
          targetId,
          owner,
          targetId
        )
      );
    try {
      await env.DB.batch(statements);
      return {
        outcome: suppressed ? 'suppressed' : 'merged',
        sourceItemId,
        canonicalItemId: targetId,
        eventId,
      };
    } catch (error) {
      if (String(error).includes('CHECK constraint failed: valid=1')) {
        if ((await ownerGeneration(env, owner)) !== epoch)
          throw new ApiError(
            409,
            'account_data_erased',
            'Account data was erased during reconciliation'
          );
        continue;
      }
      throw error;
    }
  }
  throw new ApiError(
    409,
    'concurrent_write',
    'Identity changed concurrently; retry reconciliation'
  );
}

export async function resolveRedirectIdentity(url: string): Promise<Identity> {
  let response;
  try {
    response = await fetchPublic(url, { method: 'HEAD', maxBytes: 1024 });
  } catch (error) {
    if (
      !(error instanceof ProviderError) ||
      !['source_http_405', 'source_http_501'].includes(error.code)
    )
      throw error;
    response = await fetchPublic(url, { maxBytes: 4 * 1024 * 1024 });
  }
  const original = await contentIdentity(url),
    final = await contentIdentity(response.url);
  if (original.id !== final.id && !strongRedirect(url, response.url, response.redirectChain))
    throw new ApiError(
      409,
      'identity_not_established',
      'A temporary or unrelated redirect is not sufficient identity evidence'
    );
  return final;
}
export const reconciliationRoutes = new Hono<AppEnv>();
reconciliationRoutes.post('/items/:itemId/reconcile', async (c) => {
  const principal = c.get('principal');
  const itemId = await canonicalItemId(c.env, principal.userId, c.req.param('itemId'));
  const source = await ownedItem(c.env, principal.userId, itemId);
  const input = await parseBody(c.req.raw, reconciliationSchema);
  const expected = input.targetItemId
    ? await ownedItem(
        c.env,
        principal.userId,
        await canonicalItemId(c.env, principal.userId, input.targetItemId)
      )
    : null;
  const url = await stmt(
    c.env.DB,
    'SELECT canonical_url FROM content_items WHERE id=?',
    source.content_id
  ).first<string>('canonical_url');
  if (!url) throw new ApiError(409, 'identity_unavailable', 'Source identity is unavailable');
  const initial = await contentIdentity(url);
  const provider = mutablePlatformIdentity(initial)
    ? initial.platform === 'youtube'
      ? await extractYouTube(c.env, url, principal.userId)
      : await extractX(c.env, url)
    : null;
  const final = provider?.verifiedIdentity
    ? await contentIdentity(provider.verifiedIdentity.url)
    : await resolveRedirectIdentity(url);
  const method = provider?.verifiedIdentity?.method ?? 'http-redirect';
  if (expected && expected.content_id !== final.id)
    throw new ApiError(
      409,
      'identity_not_established',
      'The verified redirect does not identify that target'
    );
  return c.json(
    await reconcileVerifiedIdentity(c.env, principal, itemId, final.url, source.generation, method)
  );
});
reconciliationRoutes.get('/items/:itemId/identity', async (c) => {
  const owner = c.get('principal').userId;
  const itemId = await canonicalItemId(c.env, owner, c.req.param('itemId'));
  const personal = await ownedItem(c.env, owner, itemId);
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(c.req.query('limit'));
  const aliases = await all<{ itemId: string; contentId: string; url: string; createdAt: string }>(
    c.env.DB,
    'SELECT a.alias_item_id AS itemId,p.content_id AS contentId,content.canonical_url AS url,a.created_at AS createdAt FROM item_aliases a JOIN personal_items p ON p.id=a.alias_item_id JOIN content_items content ON content.id=p.content_id WHERE a.owner_id=? AND a.canonical_item_id=? AND a.alias_item_id>? ORDER BY a.alias_item_id LIMIT ?',
    owner,
    itemId,
    c.req.query('cursor') ?? '',
    limit + 1
  );
  return c.json({
    canonicalItemId: itemId,
    contentId: personal.content_id,
    aliases: aliases.slice(0, limit),
    nextCursor: aliases.length > limit ? aliases[limit - 1].itemId : null,
  });
});
reconciliationRoutes.get('/items/:itemId/reconciliations', async (c) => {
  const owner = c.get('principal').userId;
  const itemId = await canonicalItemId(c.env, owner, c.req.param('itemId'));
  await ownedItem(c.env, owner, itemId);
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(c.req.query('limit'));
  const events = await all<{
    id: string;
    source_item_id: string;
    target_item_id: string;
    contributor: string;
    evidence_json: string;
    state_json: string;
    created_at: string;
  }>(
    c.env.DB,
    'SELECT * FROM reconciliation_events WHERE owner_id=? AND target_item_id=? AND id>? ORDER BY id LIMIT ?',
    owner,
    itemId,
    c.req.query('cursor') ?? '',
    limit + 1
  );
  return c.json({
    events: events.slice(0, limit).map((e) => ({
      id: e.id,
      sourceItemId: e.source_item_id,
      targetItemId: e.target_item_id,
      contributor: e.contributor,
      evidence: JSON.parse(e.evidence_json),
      state: JSON.parse(e.state_json),
      createdAt: e.created_at,
    })),
    nextCursor: events.length > limit ? events[limit - 1].id : null,
  });
});
