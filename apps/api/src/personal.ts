import { Hono } from 'hono';
import { z } from 'zod4';
import {
  all,
  ApiError,
  assertPresent,
  atomicItemWrite,
  atomicOwnerWrite,
  canonicalItemId,
  id,
  now,
  ownedItem,
  parseBody,
  shortText,
  stmt,
} from './lib';
import type { AppEnv } from './types';
import { getItem } from './items';

export const contextSchema = z
  .object({
    text: shortText,
    origin: z.enum(['explicit', 'experience', 'inferred']).default('explicit'),
  })
  .strict();
const anchorSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('text'),
      exact: z.string().min(1).max(20000),
      prefix: z.string().max(2000).optional(),
      suffix: z.string().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('time'),
      startSeconds: z.number().nonnegative(),
      endSeconds: z.number().nonnegative().optional(),
    })
    .strict()
    .refine(
      (a) => a.endSeconds === undefined || a.endSeconds >= a.startSeconds,
      'End must follow start'
    ),
]);
export const annotationSchema = z
  .object({
    kind: z.enum(['note', 'highlight', 'timestamp']),
    text: shortText.optional(),
    anchor: anchorSchema.optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.kind === 'note' && !a.text)
      ctx.addIssue({ code: 'custom', message: 'A note requires text' });
    if (a.kind === 'highlight' && a.anchor?.type !== 'text')
      ctx.addIssue({ code: 'custom', message: 'A highlight requires a text anchor' });
    if (a.kind === 'timestamp' && a.anchor?.type !== 'time')
      ctx.addIssue({ code: 'custom', message: 'A timestamp requires a time anchor' });
  });

export const personalRoutes = new Hono<AppEnv>();

personalRoutes.get('/items/:itemId/context', async (c) => {
  await ownedItem(c.env, c.get('principal').userId, c.req.param('itemId'));
  return c.json({
    entries: await all(
      c.env.DB,
      'SELECT id,text,origin,contributor,created_at AS createdAt,updated_at AS updatedAt FROM context_entries WHERE item_id=? ORDER BY created_at,id',
      c.req.param('itemId')
    ),
  });
});
personalRoutes.post('/items/:itemId/context', async (c) => {
  const input = await parseBody(c.req.raw, contextSchema);
  const principal = c.get('principal');
  const itemId = c.req.param('itemId');
  const entryId = id('ctx');
  const timestamp = now();
  await atomicItemWrite(c.env, principal.userId, itemId, async (row) => {
    assertPresent(row);
    return {
      statements: [
        stmt(
          c.env.DB,
          'INSERT INTO context_entries(id,item_id,text,origin,contributor,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
          entryId,
          itemId,
          input.text,
          input.origin,
          principal.contributor,
          timestamp,
          timestamp
        ),
        stmt(
          c.env.DB,
          'INSERT INTO search_documents(content_id,owner_id,item_id,field,text,anchor_json) VALUES(?,?,?,?,?,?)',
          row.content_id,
          principal.userId,
          itemId,
          'context',
          input.text,
          JSON.stringify({ contextId: entryId })
        ),
        stmt(
          c.env.DB,
          'UPDATE personal_items SET revision=revision+1,updated_at=? WHERE id=?',
          timestamp,
          itemId
        ),
      ],
      result: null,
    };
  });
  return c.json(
    { id: entryId, ...input, contributor: principal.contributor, createdAt: timestamp },
    201
  );
});
personalRoutes.patch('/items/:itemId/context/:entryId', async (c) => {
  const input = await parseBody(c.req.raw, z.object({ text: shortText }).strict());
  const owner = c.get('principal').userId;
  const itemId = c.req.param('itemId');
  const entryId = c.req.param('entryId');
  const timestamp = now();
  await atomicItemWrite(c.env, owner, itemId, async (row) => {
    assertPresent(row);
    if (
      !(await stmt(
        c.env.DB,
        'SELECT id FROM context_entries WHERE id=? AND item_id=?',
        entryId,
        itemId
      ).first())
    )
      throw new ApiError(404, 'not_found', 'Context entry not found');
    return {
      statements: [
        stmt(
          c.env.DB,
          'UPDATE context_entries SET text=?,updated_at=? WHERE id=? AND item_id=?',
          input.text,
          timestamp,
          entryId,
          itemId
        ),
        stmt(
          c.env.DB,
          "UPDATE search_documents SET text=? WHERE item_id=? AND field='context' AND json_extract(anchor_json,'$.contextId')=?",
          input.text,
          itemId,
          entryId
        ),
        stmt(
          c.env.DB,
          'UPDATE personal_items SET revision=revision+1,updated_at=? WHERE id=?',
          timestamp,
          itemId
        ),
      ],
      result: null,
    };
  });
  return c.json({ id: entryId, text: input.text, updatedAt: timestamp });
});
personalRoutes.delete('/items/:itemId/context/:entryId', async (c) => {
  const itemId = c.req.param('itemId');
  const entryId = c.req.param('entryId');
  await atomicItemWrite(c.env, c.get('principal').userId, itemId, async (row) => {
    assertPresent(row);
    if (
      !(await stmt(
        c.env.DB,
        'SELECT id FROM context_entries WHERE id=? AND item_id=?',
        entryId,
        itemId
      ).first())
    )
      throw new ApiError(404, 'not_found', 'Context entry not found');
    return {
      statements: [
        stmt(c.env.DB, 'DELETE FROM context_entries WHERE item_id=? AND id=?', itemId, entryId),
        stmt(
          c.env.DB,
          "DELETE FROM search_documents WHERE item_id=? AND field='context' AND json_extract(anchor_json,'$.contextId')=?",
          itemId,
          entryId
        ),
        stmt(
          c.env.DB,
          'UPDATE personal_items SET revision=revision+1,updated_at=? WHERE id=?',
          now(),
          itemId
        ),
      ],
      result: null,
    };
  });
  return c.body(null, 204);
});

personalRoutes.get('/items/:itemId/annotations', async (c) => {
  await ownedItem(c.env, c.get('principal').userId, c.req.param('itemId'));
  const rows = await all<{
    id: string;
    kind: string;
    text: string | null;
    anchor_json: string | null;
    contributor: string;
    created_at: string;
    updated_at: string;
  }>(
    c.env.DB,
    'SELECT * FROM annotations WHERE item_id=? ORDER BY created_at,id',
    c.req.param('itemId')
  );
  return c.json({
    annotations: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      text: r.text,
      anchor: r.anchor_json ? JSON.parse(r.anchor_json) : null,
      contributor: r.contributor,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});
personalRoutes.post('/items/:itemId/annotations', async (c) => {
  const input = await parseBody(c.req.raw, annotationSchema);
  const annotationId = id('ann');
  const timestamp = now();
  const itemId = c.req.param('itemId');
  const principal = c.get('principal');
  await atomicItemWrite(c.env, principal.userId, itemId, async (row) => {
    assertPresent(row);
    const statements = [
      stmt(
        c.env.DB,
        'INSERT INTO annotations(id,item_id,kind,text,anchor_json,contributor,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        annotationId,
        itemId,
        input.kind,
        input.text ?? null,
        input.anchor ? JSON.stringify(input.anchor) : null,
        principal.contributor,
        timestamp,
        timestamp
      ),
      stmt(
        c.env.DB,
        'UPDATE personal_items SET revision=revision+1,updated_at=? WHERE id=?',
        timestamp,
        itemId
      ),
    ];
    const text = [input.text, input.anchor?.type === 'text' ? input.anchor.exact : null]
      .filter(Boolean)
      .join('\n');
    if (text)
      statements.push(
        stmt(
          c.env.DB,
          'INSERT INTO search_documents(content_id,owner_id,item_id,field,text,anchor_json) VALUES(?,?,?,?,?,?)',
          row.content_id,
          principal.userId,
          itemId,
          'annotation',
          text,
          JSON.stringify({ annotationId })
        )
      );
    return { statements, result: null };
  });
  return c.json({ id: annotationId, ...input, createdAt: timestamp }, 201);
});
personalRoutes.patch('/items/:itemId/annotations/:annotationId', async (c) => {
  const input = await parseBody(c.req.raw, annotationSchema);
  const annotationId = c.req.param('annotationId');
  const itemId = c.req.param('itemId');
  const principal = c.get('principal');
  const timestamp = now();
  await atomicItemWrite(c.env, principal.userId, itemId, async (row) => {
    assertPresent(row);
    if (
      !(await stmt(
        c.env.DB,
        'SELECT id FROM annotations WHERE id=? AND item_id=?',
        annotationId,
        itemId
      ).first())
    )
      throw new ApiError(404, 'not_found', 'Annotation not found');
    return {
      statements: [
        stmt(
          c.env.DB,
          'UPDATE annotations SET kind=?,text=?,anchor_json=?,updated_at=? WHERE id=? AND item_id=?',
          input.kind,
          input.text ?? null,
          input.anchor ? JSON.stringify(input.anchor) : null,
          timestamp,
          annotationId,
          itemId
        ),
        stmt(
          c.env.DB,
          "DELETE FROM search_documents WHERE item_id=? AND field='annotation' AND json_extract(anchor_json,'$.annotationId')=?",
          itemId,
          annotationId
        ),
        stmt(
          c.env.DB,
          'INSERT INTO search_documents(content_id,owner_id,item_id,field,text,anchor_json) VALUES(?,?,?,?,?,?)',
          row.content_id,
          principal.userId,
          itemId,
          'annotation',
          [input.text, input.anchor?.type === 'text' ? input.anchor.exact : null]
            .filter(Boolean)
            .join('\n'),
          JSON.stringify({ annotationId })
        ),
        stmt(
          c.env.DB,
          'UPDATE personal_items SET revision=revision+1,updated_at=? WHERE id=?',
          timestamp,
          itemId
        ),
      ],
      result: null,
    };
  });
  return c.json({ id: annotationId, ...input, updatedAt: timestamp });
});
personalRoutes.delete('/items/:itemId/annotations/:annotationId', async (c) => {
  const itemId = c.req.param('itemId');
  const annotationId = c.req.param('annotationId');
  await atomicItemWrite(c.env, c.get('principal').userId, itemId, async (row) => {
    assertPresent(row);
    if (
      !(await stmt(
        c.env.DB,
        'SELECT id FROM annotations WHERE id=? AND item_id=?',
        annotationId,
        itemId
      ).first())
    )
      throw new ApiError(404, 'not_found', 'Annotation not found');
    return {
      statements: [
        stmt(c.env.DB, 'DELETE FROM annotations WHERE id=? AND item_id=?', annotationId, itemId),
        stmt(
          c.env.DB,
          "DELETE FROM search_documents WHERE item_id=? AND field='annotation' AND json_extract(anchor_json,'$.annotationId')=?",
          itemId,
          annotationId
        ),
        stmt(
          c.env.DB,
          'UPDATE personal_items SET revision=revision+1,updated_at=? WHERE id=?',
          now(),
          itemId
        ),
      ],
      result: null,
    };
  });
  return c.body(null, 204);
});

export const collectionSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(20000).nullable().optional(),
  })
  .strict();
async function collectionOwned(db: D1Database, owner: string, collectionId: string) {
  const row = await stmt(
    db,
    'SELECT id,name,description,created_at AS createdAt,updated_at AS updatedAt FROM collections WHERE id=? AND owner_id=?',
    collectionId,
    owner
  ).first();
  if (!row) throw new ApiError(404, 'not_found', 'Collection not found');
  return row;
}
personalRoutes.post('/collections', async (c) => {
  const input = await parseBody(c.req.raw, collectionSchema);
  const collectionId = id('col');
  const timestamp = now();
  await atomicOwnerWrite(c.env, c.get('principal').userId, [
    stmt(
      c.env.DB,
      'INSERT INTO collections(id,owner_id,name,description,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      collectionId,
      c.get('principal').userId,
      input.name,
      input.description ?? null,
      timestamp,
      timestamp
    ),
  ]);
  return c.json({ id: collectionId, ...input, createdAt: timestamp, updatedAt: timestamp }, 201);
});
personalRoutes.get('/collections', async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50));
  const cursor = c.req.query('cursor') ?? '';
  const rows = await all<{ id: string }>(
    c.env.DB,
    'SELECT id,name,description,created_at AS createdAt,updated_at AS updatedAt FROM collections WHERE owner_id=? AND id>? ORDER BY id LIMIT ?',
    c.get('principal').userId,
    cursor,
    limit + 1
  );
  const more = rows.length > limit;
  const collections = rows.slice(0, limit);
  return c.json({ collections, nextCursor: more ? collections.at(-1)!.id : null });
});
personalRoutes.get('/collections/:collectionId', async (c) => {
  const collectionId = c.req.param('collectionId');
  const owner = c.get('principal').userId;
  const collection = await collectionOwned(c.env.DB, owner, collectionId);
  const notes = await all<{ id: string }>(
    c.env.DB,
    'SELECT id,text,contributor,created_at AS createdAt,updated_at AS updatedAt FROM collection_notes WHERE collection_id=? ORDER BY created_at,id',
    collectionId
  );
  const references = await all<{ note_id: string; item_id: string }>(
    c.env.DB,
    'SELECT r.note_id,r.item_id FROM collection_note_references r JOIN collection_notes n ON n.id=r.note_id WHERE n.collection_id=?',
    collectionId
  );
  return c.json({
    ...collection,
    notes: notes.map((n) => ({
      ...n,
      itemIds: references.filter((r) => r.note_id === n.id).map((r) => r.item_id),
    })),
  });
});
personalRoutes.patch('/collections/:collectionId', async (c) => {
  const input = await parseBody(
    c.req.raw,
    collectionSchema
      .partial()
      .refine((v) => Object.keys(v).length > 0, 'At least one change is required')
  );
  const collectionId = c.req.param('collectionId');
  const owner = c.get('principal').userId;
  await collectionOwned(c.env.DB, owner, collectionId);
  await stmt(
    c.env.DB,
    'UPDATE collections SET name=COALESCE(?,name),description=CASE WHEN ? THEN ? ELSE description END,updated_at=? WHERE id=? AND owner_id=?',
    input.name ?? null,
    input.description !== undefined ? 1 : 0,
    input.description ?? null,
    now(),
    collectionId,
    owner
  ).run();
  return c.json(await collectionOwned(c.env.DB, owner, collectionId));
});
personalRoutes.delete('/collections/:collectionId', async (c) => {
  const owner = c.get('principal').userId;
  const collectionId = c.req.param('collectionId');
  await collectionOwned(c.env.DB, owner, collectionId);
  await stmt(
    c.env.DB,
    'DELETE FROM collections WHERE id=? AND owner_id=?',
    collectionId,
    owner
  ).run();
  return c.body(null, 204);
});
personalRoutes.put('/collections/:collectionId/items/:itemId', async (c) => {
  const input = await parseBody(
    c.req.raw,
    z.object({ position: z.number().finite().min(-1e9).max(1e9).optional() }).strict()
  );
  const owner = c.get('principal').userId;
  const collectionId = c.req.param('collectionId');
  const itemId = c.req.param('itemId');
  await collectionOwned(c.env.DB, owner, collectionId);
  await atomicItemWrite(c.env, owner, itemId, async (row) => {
    assertPresent(row);
    if (row.status !== 'saved')
      throw new ApiError(409, 'not_saved', 'Save the item before adding it to a collection');
    return {
      statements: [
        stmt(
          c.env.DB,
          `INSERT INTO collection_members(collection_id,item_id,position) SELECT ?,?,COALESCE(?,(SELECT COALESCE(MAX(position),-1)+1 FROM collection_members WHERE collection_id=?))
        ON CONFLICT(collection_id,item_id) DO UPDATE SET position=excluded.position`,
          collectionId,
          itemId,
          input.position ?? null,
          collectionId
        ),
        stmt(c.env.DB, 'UPDATE personal_items SET revision=revision+1 WHERE id=?', itemId),
      ],
      result: null,
    };
  });
  return c.json({ collectionId, itemId });
});
personalRoutes.delete('/collections/:collectionId/items/:itemId', async (c) => {
  const owner = c.get('principal').userId;
  const collectionId = c.req.param('collectionId');
  const itemId = c.req.param('itemId');
  await collectionOwned(c.env.DB, owner, collectionId);
  await ownedItem(c.env, owner, itemId);
  await stmt(
    c.env.DB,
    'DELETE FROM collection_members WHERE collection_id=? AND item_id=?',
    collectionId,
    itemId
  ).run();
  return c.body(null, 204);
});
personalRoutes.get('/collections/:collectionId/items', async (c) => {
  const owner = c.get('principal').userId;
  const collectionId = c.req.param('collectionId');
  await collectionOwned(c.env.DB, owner, collectionId);
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(c.req.query('limit'));
  let after: { position: number; id: string } | null = null;
  if (c.req.query('cursor')) {
    try {
      const cursor = JSON.parse(atob(c.req.query('cursor')!));
      if (cursor.collectionId !== collectionId) throw new Error();
      after = z.object({ position: z.number().finite(), id: z.string() }).parse(cursor);
    } catch {
      throw new ApiError(422, 'invalid_cursor', 'Invalid collection cursor');
    }
  }
  const rows = await all<{ item_id: string; position: number }>(
    c.env.DB,
    `SELECT m.item_id,m.position FROM collection_members m JOIN personal_items p ON p.id=m.item_id
    WHERE m.collection_id=? AND p.owner_id=? AND p.status='saved' ${after ? 'AND (m.position>? OR (m.position=? AND m.item_id>?))' : ''}
    ORDER BY m.position,m.item_id LIMIT ?`,
    collectionId,
    owner,
    ...(after ? [after.position, after.position, after.id] : []),
    limit + 1
  );
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return c.json({
    items: await Promise.all(
      page.map(async (row) => ({
        position: row.position,
        item: await getItem(c.env, owner, row.item_id),
      }))
    ),
    nextCursor:
      rows.length > limit && last
        ? btoa(JSON.stringify({ collectionId, position: last.position, id: last.item_id }))
        : null,
  });
});

export const collectionNoteSchema = z
  .object({ text: shortText, itemIds: z.array(z.string()).max(100).default([]) })
  .strict();
personalRoutes.post('/collections/:collectionId/notes', async (c) => {
  const input = await parseBody(c.req.raw, collectionNoteSchema);
  const owner = c.get('principal').userId;
  const collectionId = c.req.param('collectionId');
  await collectionOwned(c.env.DB, owner, collectionId);
  input.itemIds = await Promise.all(
    input.itemIds.map((itemId) => canonicalItemId(c.env, owner, itemId))
  );
  for (const itemId of input.itemIds) await ownedItem(c.env, owner, itemId);
  const noteId = id('note');
  const timestamp = now();
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      'INSERT INTO collection_notes(id,collection_id,text,contributor,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      noteId,
      collectionId,
      input.text,
      c.get('principal').contributor,
      timestamp,
      timestamp
    ),
    ...[...new Set(input.itemIds)].map((itemId) =>
      stmt(
        c.env.DB,
        'INSERT INTO collection_note_references(note_id,item_id) VALUES(?,?)',
        noteId,
        itemId
      )
    ),
  ]);
  return c.json({ id: noteId, ...input, createdAt: timestamp }, 201);
});
personalRoutes.patch('/collections/:collectionId/notes/:noteId', async (c) => {
  const input = await parseBody(c.req.raw, collectionNoteSchema);
  const owner = c.get('principal').userId;
  const collectionId = c.req.param('collectionId');
  const noteId = c.req.param('noteId');
  await collectionOwned(c.env.DB, owner, collectionId);
  if (
    !(await stmt(
      c.env.DB,
      'SELECT id FROM collection_notes WHERE id=? AND collection_id=?',
      noteId,
      collectionId
    ).first())
  )
    throw new ApiError(404, 'not_found', 'Note not found');
  input.itemIds = await Promise.all(
    input.itemIds.map((itemId) => canonicalItemId(c.env, owner, itemId))
  );
  for (const itemId of input.itemIds) await ownedItem(c.env, owner, itemId);
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      'UPDATE collection_notes SET text=?,updated_at=? WHERE id=? AND collection_id=?',
      input.text,
      now(),
      noteId,
      collectionId
    ),
    stmt(c.env.DB, 'DELETE FROM collection_note_references WHERE note_id=?', noteId),
    ...[...new Set(input.itemIds)].map((itemId) =>
      stmt(
        c.env.DB,
        'INSERT INTO collection_note_references(note_id,item_id) VALUES(?,?)',
        noteId,
        itemId
      )
    ),
  ]);
  return c.json({ id: noteId, ...input });
});
personalRoutes.delete('/collections/:collectionId/notes/:noteId', async (c) => {
  await collectionOwned(c.env.DB, c.get('principal').userId, c.req.param('collectionId'));
  const result = await stmt(
    c.env.DB,
    'DELETE FROM collection_notes WHERE id=? AND collection_id=?',
    c.req.param('noteId'),
    c.req.param('collectionId')
  ).run();
  if (!result.meta.changes) throw new ApiError(404, 'not_found', 'Note not found');
  return c.body(null, 204);
});
