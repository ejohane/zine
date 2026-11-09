import { z } from 'zod4';
import {
  all,
  ApiError,
  assertPresent,
  atomicItemWrite,
  canonicalJson,
  canonicalItemOperation,
  digest,
  id,
  now,
  ownedItem,
  ownerGeneration,
  requireCollections,
  shortText,
  stmt,
  tagsSchema,
} from './lib';
import { personalContentIdentity } from './identity';
import type { Env, Principal } from './types';

export const saveSchema = z
  .object({
    url: z.string().trim().url().max(8192),
    context: z
      .object({
        text: shortText,
        origin: z.enum(['explicit', 'experience', 'inferred']).default('explicit'),
      })
      .strict()
      .optional(),
    tags: tagsSchema.default([]),
    collectionIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  })
  .strict();
export type SaveInput = z.infer<typeof saveSchema>;

export async function save(env: Env, principal: Principal, input: SaveInput, key?: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await saveOnce(env, principal, input, key);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'identity_changed') continue;
      throw error;
    }
  }
  throw new ApiError(
    409,
    'identity_changed',
    'Identity changed concurrently; retry capture with the same idempotency key'
  );
}
async function saveOnce(env: Env, principal: Principal, input: SaveInput, key?: string) {
  const { userId: owner, contributor } = principal;
  if (key && (key.length > 200 || !/^[\x21-\x7e]+$/.test(key)))
    throw new ApiError(
      422,
      'invalid_idempotency_key',
      'Use a printable key of at most 200 characters'
    );
  const requestHash = await digest(canonicalJson(input));
  const replay = async () => {
    if (!key) return null;
    const previous = await stmt(
      env.DB,
      'SELECT * FROM idempotency WHERE owner_id=? AND operation=? AND key=?',
      owner,
      'save',
      key
    ).first<{ request_hash: string; response_json: string; status_code: number }>();
    if (!previous) return null;
    if (previous.request_hash !== requestHash)
      throw new ApiError(409, 'idempotency_conflict', 'This key was used for a different save');
    return {
      body: JSON.parse(previous.response_json),
      status: previous.status_code,
      replayed: true,
    };
  };
  const previous = await replay();
  if (previous) return previous;
  const { content, itemId } = await personalContentIdentity(env, owner, input.url);
  await requireCollections(env, owner, input.collectionIds);
  const occurrenceId = id('sav');
  const timestamp = now();
  try {
    return await atomicItemWrite(env, owner, itemId, async (existing) => {
      const initialGeneration = await ownerGeneration(env, owner);
      const previousJob =
        existing && existing.status !== 'deleted'
          ? await stmt(
              env.DB,
              "SELECT status FROM jobs WHERE item_id=? AND kind='enrich' AND json_extract(payload_json,'$.stage') IS NULL AND json_extract(payload_json,'$.generation')=? ORDER BY created_at DESC,id DESC LIMIT 1",
              itemId,
              existing.generation
            ).first<string>('status')
          : null;
      const outcome =
        !existing || existing.status === 'deleted'
          ? 'created'
          : existing.status !== 'saved' || existing.archived
            ? 'reactivated'
            : 'already_saved';
      const body = {
        item: {
          id: itemId,
          contentId: content.id,
          status: 'saved',
          archived: false,
          url: content.url,
        },
        save: { id: occurrenceId, outcome },
        enrichment: {
          status:
            previousJob === 'succeeded'
              ? 'available'
              : previousJob === 'running'
                ? 'processing'
                : 'pending',
        },
      };
      const status = outcome === 'created' ? 201 : 200;
      const statements = [
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO content_items(id,identity_key,canonical_url,platform,kind,created_at) VALUES(?,?,?,?,?,?)',
          content.id,
          content.key,
          content.url,
          content.platform,
          content.kind,
          timestamp
        ),
        stmt(
          env.DB,
          `INSERT INTO personal_items(id,owner_id,content_id,status,archived,created_at,saved_at,updated_at,revision,content_type,generation,decision_at,decision_origin) VALUES(?,?,?,'saved',0,?,?,?,0,?,?,?,'explicit')
          ON CONFLICT(id) DO UPDATE SET decision_at=excluded.decision_at,decision_origin='explicit',content_type=CASE WHEN personal_items.status='deleted' THEN excluded.content_type ELSE personal_items.content_type END,status='saved',archived=0,saved_at=excluded.saved_at,created_at=CASE WHEN personal_items.status='deleted' THEN excluded.created_at ELSE personal_items.created_at END,updated_at=excluded.updated_at,revision=personal_items.revision+1,generation=personal_items.generation+CASE WHEN personal_items.status='deleted' THEN 1 ELSE 0 END`,
          itemId,
          owner,
          content.id,
          timestamp,
          timestamp,
          timestamp,
          content.kind,
          initialGeneration,
          timestamp
        ),
        stmt(
          env.DB,
          'INSERT INTO save_occurrences(id,owner_id,item_id,contributor,route,created_at,input_url) VALUES(?,?,?,?,?,?,?)',
          occurrenceId,
          owner,
          itemId,
          contributor,
          'explicit',
          timestamp,
          input.url
        ),
        stmt(
          env.DB,
          `INSERT INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at)
            SELECT ?,?,?,'enrich',?,'pending',?,?,? WHERE NOT EXISTS(SELECT 1 FROM jobs WHERE item_id=? AND kind='enrich' AND json_extract(payload_json,'$.stage') IS NULL AND status IN ('pending','running','succeeded') AND json_extract(payload_json,'$.generation')=?)`,
          id('job'),
          owner,
          itemId,
          JSON.stringify({
            contentId: content.id,
            url: content.url,
            generation:
              (existing?.generation ?? initialGeneration) +
              (existing?.status === 'deleted' ? 1 : 0),
          }),
          timestamp,
          timestamp,
          timestamp,
          itemId,
          (existing?.generation ?? initialGeneration) + (existing?.status === 'deleted' ? 1 : 0)
        ),
      ];
      if (input.context) {
        const contextId = id('ctx');
        statements.push(
          stmt(
            env.DB,
            'INSERT INTO context_entries(id,item_id,text,origin,contributor,occurrence_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
            contextId,
            itemId,
            input.context.text,
            input.context.origin,
            contributor,
            occurrenceId,
            timestamp,
            timestamp
          )
        );
        statements.push(
          stmt(
            env.DB,
            'INSERT INTO search_documents(content_id,owner_id,item_id,field,text,anchor_json) VALUES(?,?,?,?,?,?)',
            content.id,
            owner,
            itemId,
            'context',
            input.context.text,
            JSON.stringify({ contextId })
          )
        );
      }
      for (const tag of input.tags)
        statements.push(
          stmt(env.DB, 'INSERT OR IGNORE INTO item_tags(item_id,tag) VALUES(?,?)', itemId, tag)
        );
      for (const collectionId of new Set(input.collectionIds))
        statements.push(
          stmt(
            env.DB,
            `INSERT OR IGNORE INTO collection_members(collection_id,item_id,position) SELECT ?,?,COALESCE(MAX(position),-1)+1 FROM collection_members WHERE collection_id=?`,
            collectionId,
            itemId,
            collectionId
          )
        );
      if (key)
        statements.push(
          stmt(
            env.DB,
            'INSERT INTO idempotency(owner_id,operation,key,request_hash,response_json,status_code,created_at) VALUES(?,?,?,?,?,?,?)',
            owner,
            'save',
            key,
            requestHash,
            JSON.stringify(body),
            status,
            timestamp
          )
        );
      return { statements, result: { body, status, replayed: false } };
    });
  } catch (e) {
    if (key && String(e).includes('UNIQUE constraint failed: idempotency')) {
      const response = await replay();
      if (response) return response;
    }
    throw e;
  }
}

interface ContributionRow {
  id: string;
  field: string;
  value_json: string | null;
  artifact_key: string | null;
  owner_id: string | null;
  provenance_json: string;
  category: string;
  contributor: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export async function visibleContributions(env: Env, owner: string, contentId: string) {
  return all<ContributionRow>(
    env.DB,
    `SELECT * FROM contributions WHERE content_id=? AND (owner_id IS NULL OR owner_id=?)
    ORDER BY CASE WHEN category='correction' AND owner_id=? THEN 1 ELSE 0 END DESC,priority DESC,created_at ASC,id ASC`,
    contentId,
    owner,
    owner
  );
}

export async function getItem(env: Env, owner: string, itemId: string, include: string[] = []) {
  return canonicalItemOperation(env, owner, itemId, (canonical) =>
    getCanonicalItem(env, owner, canonical, include)
  );
}
async function getCanonicalItem(env: Env, owner: string, itemId: string, include: string[]) {
  const personal = await ownedItem(env, owner, itemId);
  const content = await stmt(
    env.DB,
    'SELECT * FROM content_items WHERE id=?',
    personal.content_id
  ).first<{ id: string; canonical_url: string; platform: string; kind: string }>();
  if (!content) throw new ApiError(500, 'integrity_error', 'Item content is unavailable');
  const results = await Promise.all([
    visibleContributions(env, owner, content.id),
    all<{
      id: string;
      text: string;
      origin: string;
      contributor: string;
      created_at: string;
      updated_at: string;
    }>(
      env.DB,
      'SELECT id,text,origin,contributor,created_at,updated_at FROM context_entries WHERE item_id=? ORDER BY created_at,id',
      itemId
    ),
    all<{ tag: string }>(env.DB, 'SELECT tag FROM item_tags WHERE item_id=? ORDER BY tag', itemId),
    all<{ collection_id: string }>(
      env.DB,
      'SELECT collection_id FROM collection_members WHERE item_id=? ORDER BY collection_id',
      itemId
    ),
    stmt(env.DB, 'SELECT * FROM progress WHERE item_id=?', itemId).first<{
      position: number | null;
      unit: string | null;
      completed_at: string | null;
      updated_at: string;
    }>(),
    all<{ component: string; status: string; reason_code: string | null }>(
      env.DB,
      'SELECT component,status,reason_code FROM enrichment_components WHERE content_id=? AND owner_id=? ORDER BY component',
      content.id,
      owner
    ),
    all<{
      id: string;
      route: string;
      contributor: string;
      subscription_id: string | null;
      input_url: string | null;
      created_at: string;
    }>(
      env.DB,
      'SELECT id,route,contributor,subscription_id,created_at,input_url FROM save_occurrences WHERE item_id=? ORDER BY created_at,id',
      itemId
    ),
  ]);
  const [contributions, context, tags, collections, progress, components, occurrences] = results;
  const fields: Record<string, unknown> = {};
  const large = new Set(['transcript', 'article', 'thread', 'raw', 'members', 'structuredData']);
  const selected: Record<
    string,
    { contributionId: string; category: string; provenance: unknown }
  > = {};
  for (const contribution of contributions) {
    if (Object.hasOwn(selected, contribution.field)) continue;
    selected[contribution.field] = {
      contributionId: contribution.id,
      category: contribution.category,
      provenance: JSON.parse(contribution.provenance_json),
    };
    if (large.has(contribution.field) && !include.includes(contribution.field)) continue;
    if (contribution.value_json) fields[contribution.field] = JSON.parse(contribution.value_json);
    else if (contribution.artifact_key) {
      const object = await env.ARTIFACTS.get(contribution.artifact_key);
      if (object) fields[contribution.field] = await object.json();
    }
  }
  return {
    id: itemId,
    status: personal.status,
    archived: !!personal.archived,
    createdAt: personal.created_at,
    savedAt: personal.saved_at,
    updatedAt: personal.updated_at,
    revision: personal.revision,
    content: {
      id: content.id,
      url: content.canonical_url,
      platform: content.platform,
      type: personal.content_type ?? content.kind,
      ...fields,
    } as Record<string, unknown> & { id: string; url: string; platform: string; type: string },
    context: context.map((entry) => ({
      id: entry.id,
      text: entry.text,
      origin: entry.origin,
      contributor: entry.contributor,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
    tags: tags.map((tag) => tag.tag),
    collectionIds: collections.map((collection) => collection.collection_id),
    progress: {
      position: progress?.position ?? null,
      unit: progress?.unit ?? null,
      completedAt: progress?.completed_at ?? null,
      updatedAt: progress?.updated_at ?? null,
    },
    enrichment: {
      fields: selected,
      components: components.map((component) => ({
        component: component.component,
        status: component.status,
        reasonCode: component.reason_code,
      })),
    },
    occurrences: occurrences.map((occurrence) => ({
      id: occurrence.id,
      route: occurrence.route,
      inputUrl: occurrence.input_url,
      contributor: occurrence.contributor,
      subscriptionId: occurrence.subscription_id,
      createdAt: occurrence.created_at,
    })),
  };
}

export const patchItemSchema = z
  .object({
    status: z.enum(['saved', 'dismissed']).optional(),
    archived: z.boolean().optional(),
    tags: tagsSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one change is required');

export async function patchItem(
  env: Env,
  owner: string,
  itemId: string,
  input: z.infer<typeof patchItemSchema>
) {
  return canonicalItemOperation(env, owner, itemId, (canonical) =>
    patchCanonicalItem(env, owner, canonical, input)
  );
}
async function patchCanonicalItem(
  env: Env,
  owner: string,
  itemId: string,
  input: z.infer<typeof patchItemSchema>
) {
  return atomicItemWrite(env, owner, itemId, async (row) => {
    assertPresent(row);
    if (input.status === 'dismissed' && row.status !== 'received')
      throw new ApiError(
        409,
        'invalid_transition',
        'Only received items can be dismissed; archive or delete saved items'
      );
    const status = input.status ?? row.status;
    const archived = input.archived ?? (status !== row.status ? false : !!row.archived);
    if (archived && status !== 'saved')
      throw new ApiError(409, 'invalid_transition', 'Only saved items can be archived');
    const timestamp = now();
    const statements = [
      stmt(
        env.DB,
        "UPDATE personal_items SET status=?,archived=?,saved_at=?,updated_at=?,decision_at=CASE WHEN ? THEN ? ELSE decision_at END,decision_origin=CASE WHEN ? THEN 'explicit' ELSE decision_origin END,revision=revision+1 WHERE id=?",
        status,
        archived ? 1 : 0,
        input.status === 'saved' ? timestamp : row.saved_at,
        timestamp,
        Number(input.status !== undefined || input.archived !== undefined),
        timestamp,
        Number(input.status !== undefined || input.archived !== undefined),
        itemId
      ),
    ];
    if (input.tags) {
      statements.push(stmt(env.DB, 'DELETE FROM item_tags WHERE item_id=?', itemId));
      statements.push(
        ...input.tags.map((tag) =>
          stmt(env.DB, 'INSERT INTO item_tags(item_id,tag) VALUES(?,?)', itemId, tag)
        )
      );
    }
    return { statements, result: { id: itemId, status, archived } };
  });
}

export async function deleteItem(env: Env, owner: string, itemId: string) {
  return canonicalItemOperation(env, owner, itemId, (canonical) =>
    deleteCanonicalItem(env, owner, canonical)
  );
}
async function deleteCanonicalItem(env: Env, owner: string, itemId: string) {
  return atomicItemWrite(env, owner, itemId, async (row) => {
    assertPresent(row);
    const timestamp = now();
    const statements = [
      stmt(
        env.DB,
        'DELETE FROM item_relationships WHERE owner_id=? AND (source_item_id=? OR target_content_id=?)',
        owner,
        itemId,
        row.content_id
      ),
      stmt(
        env.DB,
        'DELETE FROM reconciliation_events WHERE owner_id=? AND (source_item_id=? OR target_item_id=?)',
        owner,
        itemId,
        itemId
      ),
      stmt(
        env.DB,
        'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT artifact_key,? FROM understanding_artifacts WHERE owner_id=? AND item_id=?',
        timestamp,
        owner,
        itemId
      ),
      stmt(
        env.DB,
        'DELETE FROM understanding_artifacts WHERE owner_id=? AND item_id=?',
        owner,
        itemId
      ),
      stmt(
        env.DB,
        'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT artifact_key,? FROM material_artifacts WHERE owner_id=? AND item_id=?',
        timestamp,
        owner,
        itemId
      ),
      stmt(env.DB, 'DELETE FROM material_artifacts WHERE owner_id=? AND item_id=?', owner, itemId),
      stmt(env.DB, 'DELETE FROM understanding_requests WHERE item_id=?', itemId),
      stmt(env.DB, 'DELETE FROM understanding_runs WHERE item_id=?', itemId),
      ...[
        'context_entries',
        'item_tags',
        'collection_members',
        'collection_note_references',
        'progress',
        'annotations',
        'save_occurrences',
      ].map((table) => stmt(env.DB, `DELETE FROM ${table} WHERE item_id=?`, itemId)),
      stmt(
        env.DB,
        'DELETE FROM search_documents WHERE owner_id=? AND (item_id=? OR content_id=?)',
        owner,
        itemId,
        row.content_id
      ),
      stmt(
        env.DB,
        'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT artifact_key,? FROM contributions WHERE content_id=? AND owner_id=? AND artifact_key IS NOT NULL',
        timestamp,
        row.content_id,
        owner
      ),
      stmt(
        env.DB,
        'DELETE FROM contributions WHERE content_id=? AND owner_id=?',
        row.content_id,
        owner
      ),
      stmt(
        env.DB,
        'DELETE FROM enrichment_components WHERE content_id=? AND owner_id=?',
        row.content_id,
        owner
      ),
      stmt(
        env.DB,
        "UPDATE jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,payload_json='{}',updated_at=? WHERE item_id=?",
        timestamp,
        itemId
      ),
      stmt(
        env.DB,
        "UPDATE personal_items SET status='deleted',archived=0,saved_at=NULL,content_type=NULL,updated_at=?,decision_at=?,decision_origin='explicit',revision=revision+1 WHERE id=?",
        timestamp,
        timestamp,
        itemId
      ),
      // Keep a scrubbed idempotency tombstone so an old HTTP retry cannot
      // accidentally resurrect an item the user deliberately deleted.
      stmt(
        env.DB,
        `UPDATE idempotency SET response_json='{"error":{"code":"save_deleted","message":"This save was deleted; use a new idempotency key for an intentional new save"}}',status_code=410 WHERE owner_id=? AND json_extract(response_json,'$.item.id') IN (SELECT ? UNION SELECT alias_item_id FROM item_aliases WHERE owner_id=? AND canonical_item_id=?)`,
        owner,
        itemId,
        owner,
        itemId
      ),
    ];
    return { statements, result: { deleted: true } };
  });
}

export const progressSchema = z
  .object({
    position: z.number().finite().nonnegative().nullable().optional(),
    unit: z.enum(['seconds', 'fraction']).nullable().optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one change is required');

export async function updateProgress(
  env: Env,
  principal: Principal,
  itemId: string,
  input: z.infer<typeof progressSchema>
) {
  return canonicalItemOperation(env, principal.userId, itemId, (canonical) =>
    updateCanonicalProgress(env, principal, canonical, input)
  );
}
async function updateCanonicalProgress(
  env: Env,
  principal: Principal,
  itemId: string,
  input: z.infer<typeof progressSchema>
) {
  return atomicItemWrite(env, principal.userId, itemId, async (row) => {
    assertPresent(row);
    const current = await stmt(env.DB, 'SELECT * FROM progress WHERE item_id=?', itemId).first<{
      position: number | null;
      unit: string | null;
      completed_at: string | null;
    }>();
    const position = input.position === undefined ? (current?.position ?? null) : input.position;
    const unit = input.unit === undefined ? (current?.unit ?? null) : input.unit;
    if (
      (position !== null && !unit) ||
      (position === null && unit !== null) ||
      (unit === 'fraction' && position !== null && position > 1)
    )
      throw new ApiError(
        422,
        'invalid_progress',
        'Position requires an appropriate unit; fractions range from 0 to 1'
      );
    const timestamp = now();
    const completedAt =
      input.completed === undefined
        ? (current?.completed_at ?? null)
        : input.completed
          ? (current?.completed_at ?? timestamp)
          : null;
    return {
      statements: [
        stmt(
          env.DB,
          `INSERT INTO progress(item_id,position,unit,completed_at,contributor,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET position=excluded.position,unit=excluded.unit,completed_at=excluded.completed_at,contributor=excluded.contributor,updated_at=excluded.updated_at`,
          itemId,
          position,
          unit,
          completedAt,
          principal.contributor,
          timestamp
        ),
        stmt(
          env.DB,
          'UPDATE personal_items SET revision=revision+1,updated_at=? WHERE id=?',
          timestamp,
          itemId
        ),
      ],
      result: { position, unit, completedAt, updatedAt: timestamp },
    };
  });
}
