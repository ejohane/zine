import { Hono } from 'hono';
import { z } from 'zod4';
import { contributionSchema } from './enrichment';
import { personalContentIdentity } from './identity';
import {
  all,
  ApiError,
  assertPresent,
  atomicItemWrite,
  canonicalItemId,
  digest,
  id,
  now,
  ownedItem,
  parseBody,
  stmt,
} from './lib';
import type { AppEnv, Env, Principal } from './types';

export const relationshipSchema = z
  .object({
    kind: z.enum(['same_work', 'part_of', 'references', 'quotes', 'reply_to', 'related']),
    targetItemId: z.string().min(1).max(100).optional(),
    targetUrl: z.string().url().max(8192).optional(),
    provenance: contributionSchema.shape.provenance,
  })
  .strict()
  .refine(
    (v) => Number(!!v.targetItemId) + Number(!!v.targetUrl) === 1,
    'Supply exactly one target item or URL'
  );
export const relationshipUpdateSchema = z
  .object({ provenance: contributionSchema.shape.provenance })
  .strict();
type Input = z.infer<typeof relationshipSchema>;
async function validateInputs(env: Env, owner: string, provenance: Input['provenance']) {
  for (const contributionId of provenance.inputContributionIds) {
    const visible = await stmt(
      env.DB,
      'SELECT id FROM contributions WHERE id=? AND (owner_id IS NULL OR owner_id=?)',
      contributionId,
      owner
    ).first();
    if (!visible) throw new ApiError(404, 'input_not_found', 'Input contribution not found');
  }
}
export async function addRelationship(
  env: Env,
  principal: Principal,
  itemId: string,
  input: Input,
  expectedGeneration?: number
) {
  itemId = await canonicalItemId(env, principal.userId, itemId);
  return atomicItemWrite(env, principal.userId, itemId, async (source) => {
    assertPresent(source);
    if (expectedGeneration !== undefined && source.generation !== expectedGeneration)
      throw new ApiError(
        409,
        'stale_generation',
        'Relationship belongs to a deleted item generation'
      );
    await validateInputs(env, principal.userId, input.provenance);
    const target = input.targetItemId
      ? await ownedItem(
          env,
          principal.userId,
          await canonicalItemId(env, principal.userId, input.targetItemId)
        )
      : null;
    const identity = input.targetUrl
      ? (await personalContentIdentity(env, principal.userId, input.targetUrl)).content
      : null;
    const targetContent = target?.content_id ?? identity!.id;
    if (targetContent === source.content_id)
      throw new ApiError(
        409,
        'self_relationship',
        'A relationship needs distinct content references'
      );
    const existing = await stmt(
      env.DB,
      'SELECT id FROM item_relationships WHERE owner_id=? AND source_item_id=? AND target_content_id=? AND kind=? AND contributor=? ORDER BY created_at,id LIMIT 1',
      principal.userId,
      itemId,
      targetContent,
      input.kind,
      principal.contributor
    ).first<string>('id');
    const relationshipId = existing ?? id('rel');
    const timestamp = now();
    const guard = id('guard');
    const statements: D1PreparedStatement[] = [];
    if (target)
      statements.push(
        stmt(
          env.DB,
          "INSERT INTO write_guards(id,valid) SELECT ?,COALESCE((SELECT revision FROM personal_items WHERE id=? AND owner_id=? AND status!='deleted'),-1)=?",
          guard,
          target.id,
          principal.userId,
          target.revision
        )
      );
    if (identity)
      statements.push(
        stmt(
          env.DB,
          'INSERT OR IGNORE INTO content_items(id,identity_key,canonical_url,platform,kind,created_at) VALUES(?,?,?,?,?,?)',
          identity.id,
          identity.key,
          identity.url,
          identity.platform,
          identity.kind,
          timestamp
        )
      );
    statements.push(
      stmt(
        env.DB,
        'INSERT INTO item_relationships(id,owner_id,source_item_id,target_content_id,kind,contributor,provenance_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provenance_json=excluded.provenance_json,updated_at=excluded.updated_at',
        relationshipId,
        principal.userId,
        itemId,
        targetContent,
        input.kind,
        principal.contributor,
        JSON.stringify(input.provenance),
        timestamp,
        timestamp
      ),
      stmt(
        env.DB,
        'UPDATE personal_items SET revision=revision+1,updated_at=? WHERE id=?',
        timestamp,
        itemId
      )
    );
    if (target) statements.push(stmt(env.DB, 'DELETE FROM write_guards WHERE id=?', guard));
    return {
      statements,
      result: {
        id: relationshipId,
        sourceItemId: itemId,
        targetContentId: targetContent,
        kind: input.kind,
        created: !existing,
      },
    };
  });
}

export async function listRelationships(
  env: Env,
  owner: string,
  itemId: string,
  limit = 50,
  cursor?: string,
  direction = 'both'
) {
  itemId = await canonicalItemId(env, owner, itemId);
  const personal = await ownedItem(env, owner, itemId);
  const signature = await digest(JSON.stringify({ owner, itemId, direction }));
  let after = '';
  if (cursor)
    try {
      const value = JSON.parse(atob(cursor));
      if (value.signature !== signature || typeof value.id !== 'string') throw new Error();
      after = value.id;
    } catch {
      throw new ApiError(422, 'invalid_cursor', 'Invalid relationship cursor');
    }
  const rows = await all<{
    id: string;
    source_item_id: string;
    target_content_id: string;
    kind: string;
    contributor: string;
    provenance_json: string;
    created_at: string;
    updated_at: string;
    source_url: string;
    target_url: string;
    target_platform: string;
    target_kind: string;
    target_item_id: string | null;
  }>(
    env.DB,
    `SELECT r.*,s.canonical_url AS source_url,t.canonical_url AS target_url,t.platform AS target_platform,COALESCE(p.content_type,t.kind) AS target_kind,p.id AS target_item_id FROM item_relationships r JOIN personal_items source ON source.id=r.source_item_id AND source.owner_id=r.owner_id AND source.status!='deleted' JOIN content_items s ON s.id=source.content_id JOIN content_items t ON t.id=r.target_content_id LEFT JOIN personal_items p ON p.content_id=r.target_content_id AND p.owner_id=r.owner_id AND p.status!='deleted' WHERE r.owner_id=? AND r.id>? AND ${direction === 'outgoing' ? 'r.source_item_id=?' : direction === 'incoming' ? 'r.target_content_id=?' : '(r.source_item_id=? OR r.target_content_id=?)'} ORDER BY r.id LIMIT ?`,
    owner,
    after,
    ...(direction === 'outgoing'
      ? [itemId]
      : direction === 'incoming'
        ? [personal.content_id]
        : [itemId, personal.content_id]),
    limit + 1
  );
  const page = rows.slice(0, limit);
  return {
    relationships: page.map((r) => ({
      id: r.id,
      kind: r.kind,
      direction: r.source_item_id === itemId ? 'outgoing' : 'incoming',
      source: { itemId: r.source_item_id, url: r.source_url },
      target: {
        itemId: r.target_item_id,
        contentId: r.target_content_id,
        url: r.target_url,
        platform: r.target_platform,
        type: r.target_kind,
      },
      contributor: r.contributor,
      provenance: JSON.parse(r.provenance_json),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    nextCursor:
      rows.length > limit ? btoa(JSON.stringify({ signature, id: page.at(-1)!.id })) : null,
  };
}
export const relationshipRoutes = new Hono<AppEnv>();
relationshipRoutes.post('/items/:itemId/relationships', async (c) => {
  const result = await addRelationship(
    c.env,
    c.get('principal'),
    c.req.param('itemId'),
    await parseBody(c.req.raw, relationshipSchema)
  );
  return c.json(result, result.created ? 201 : 200);
});
relationshipRoutes.get('/items/:itemId/relationships', async (c) =>
  c.json(
    await listRelationships(
      c.env,
      c.get('principal').userId,
      c.req.param('itemId'),
      z.coerce.number().int().min(1).max(100).default(50).parse(c.req.query('limit')),
      c.req.query('cursor'),
      z.enum(['both', 'incoming', 'outgoing']).default('both').parse(c.req.query('direction'))
    )
  )
);
relationshipRoutes.patch('/items/:itemId/relationships/:relationshipId', async (c) => {
  const principal = c.get('principal');
  const itemId = await canonicalItemId(c.env, principal.userId, c.req.param('itemId'));
  const relationshipId = c.req.param('relationshipId');
  const input = await parseBody(c.req.raw, relationshipUpdateSchema);
  await atomicItemWrite(c.env, principal.userId, itemId, async (row) => {
    assertPresent(row);
    const existing = await stmt(
      c.env.DB,
      'SELECT contributor FROM item_relationships WHERE id=? AND owner_id=? AND source_item_id=?',
      relationshipId,
      principal.userId,
      itemId
    ).first<{ contributor: string }>();
    if (!existing) throw new ApiError(404, 'not_found', 'Relationship not found');
    if (existing.contributor !== principal.contributor)
      throw new ApiError(
        403,
        'different_contributor',
        'Replace only your own relationship contribution'
      );
    await validateInputs(c.env, principal.userId, input.provenance);
    return {
      statements: [
        stmt(
          c.env.DB,
          'UPDATE item_relationships SET provenance_json=?,updated_at=? WHERE id=?',
          JSON.stringify(input.provenance),
          now(),
          relationshipId
        ),
        stmt(c.env.DB, 'UPDATE personal_items SET revision=revision+1 WHERE id=?', itemId),
      ],
      result: null,
    };
  });
  return c.json({ id: relationshipId, provenance: input.provenance });
});
relationshipRoutes.delete('/items/:itemId/relationships/:relationshipId', async (c) => {
  const owner = c.get('principal').userId;
  const itemId = await canonicalItemId(c.env, owner, c.req.param('itemId'));
  await ownedItem(c.env, owner, itemId);
  const deleted = await stmt(
    c.env.DB,
    'DELETE FROM item_relationships WHERE id=? AND owner_id=? AND source_item_id=?',
    c.req.param('relationshipId'),
    owner,
    itemId
  ).run();
  if (!deleted.meta.changes) throw new ApiError(404, 'not_found', 'Relationship not found');
  return c.body(null, 204);
});
