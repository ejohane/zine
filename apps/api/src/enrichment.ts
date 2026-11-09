import { Hono } from 'hono';
import { z } from 'zod4';
import {
  all,
  ApiError,
  assertPresent,
  atomicItemWrite,
  atomicOwnerWrite,
  id,
  now,
  ownedItem,
  parseBody,
  stmt,
} from './lib';
import { publicUrl } from './identity';
import { reserveArtifactUsage } from './usage';
import { visibleContributions } from './items';
import type { AppEnv, Env, Principal } from './types';

export const fields = [
  'type',
  'title',
  'creator',
  'description',
  'thumbnail',
  'publishedAt',
  'durationSeconds',
  'language',
  'topics',
  'summary',
  'entities',
  'links',
  'chapters',
  'members',
  'transcript',
  'article',
  'thread',
  'structuredData',
  'source',
] as const;
const largeFields = new Set(['transcript', 'article', 'thread', 'structuredData', 'members']);
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ])
);
export const contributionSchema = z
  .object({
    field: z.enum(fields),
    value: jsonValue,
    category: z.enum(['source', 'derived', 'correction']).default('source'),
    provenance: z
      .object({
        sourceUrl: z.string().max(8192).optional(),
        method: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        model: z.string().max(200).optional(),
        inputDigest: z.string().max(128).optional(),
        coverage: z.enum(['article', 'transcript', 'thread', 'metadata_only']).optional(),
        sourceCoverage: z.enum(['complete', 'partial', 'unknown']).optional(),
        sourceChunkCount: z.number().int().positive().optional(),
        reductionLevels: z.number().int().nonnegative().optional(),
        inputContributionIds: z.array(z.string()).max(100).default([]),
      })
      .strict(),
  })
  .strict();
export type ContributionInput = z.infer<typeof contributionSchema>;
const segmentSchema = z
  .object({
    text: z.string().max(30000),
    speaker: z.string().max(300).optional(),
    startSeconds: z.number().nonnegative().optional(),
    endSeconds: z.number().nonnegative().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.endSeconds === undefined || v.startSeconds === undefined || v.endSeconds >= v.startSeconds,
    'Invalid segment range'
  );
const transcriptSchema = z
  .object({
    language: z.string().max(30).optional(),
    text: z.string().max(900000).optional(),
    segments: z.array(segmentSchema).max(30000),
  })
  .strict();
const articleSchema = z
  .object({
    text: z.string().min(1).max(900000),
    html: z.string().max(900000).optional(),
    coverage: z.enum(['complete', 'partial', 'unknown']).optional(),
  })
  .strict();

export const fieldValueSchemas: Partial<Record<ContributionInput['field'], z.ZodType>> = {
  type: z.enum([
    'unknown',
    'article',
    'newsletter_issue',
    'post',
    'image',
    'video',
    'short_video',
    'podcast_episode',
    'track',
    'album',
    'playlist',
    'show',
    'artist',
    'channel',
    'account',
    'list',
    'feed',
    'publication',
  ]),
  title: z.string().min(1).max(2000),
  creator: z.union([
    z.string().max(2000),
    z
      .object({
        name: z.string().max(2000),
        url: z.string().max(8192).optional(),
        id: z.string().max(300).optional(),
      })
      .strict(),
  ]),
  description: z.string().max(100000),
  thumbnail: z.string().url().max(8192),
  publishedAt: z.iso.datetime({ offset: true }),
  durationSeconds: z.number().nonnegative().finite(),
  language: z.string().max(30),
  topics: z.array(z.string().max(300)).max(200),
  summary: z.string().max(100000),
  transcript: transcriptSchema,
  article: articleSchema,
};
export function validateField(input: ContributionInput) {
  const result = fieldValueSchemas[input.field]?.safeParse(input.value);
  if (result && !result.success)
    throw new ApiError(422, 'invalid_field_value', `Invalid ${input.field} contribution`);
  if (input.provenance.sourceUrl) publicUrl(input.provenance.sourceUrl);
}

export function searchableSegments(
  field: string,
  value: unknown
): { text: string; anchor?: unknown }[] {
  if (field === 'structuredData') return [];
  if (
    field === 'thread' &&
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { posts?: unknown }).posts)
  )
    return (value as { posts: { id?: string; text?: string; author_id?: string }[] }).posts
      .filter((post) => typeof post.text === 'string')
      .map((post) => ({ text: post.text!, anchor: { postId: post.id, authorId: post.author_id } }));
  if (field === 'members') {
    const members = Array.isArray(value) ? value : (value as { items?: unknown[] } | null)?.items;
    if (members)
      return members.map((member) => {
        const item =
          member && typeof member === 'object' ? (member as Record<string, unknown>) : {};
        return {
          text: [
            item.title,
            item.name,
            item.creator,
            typeof item.description === 'string' ? item.description.slice(0, 500) : undefined,
          ]
            .filter((value) => typeof value === 'string')
            .join('\n'),
        };
      });
  }
  if (typeof value === 'string') return [{ text: value }];
  if (field === 'transcript')
    return (value as z.infer<typeof transcriptSchema>).segments.map((segment) => ({
      text: segment.text,
      anchor:
        segment.startSeconds === undefined
          ? undefined
          : { startSeconds: segment.startSeconds, endSeconds: segment.endSeconds },
    }));
  if (field === 'article') return [{ text: (value as { text: string }).text }];
  if (field === 'topics') return [{ text: (value as string[]).join(' ') }];
  if (field === 'creator' && value && typeof value === 'object' && 'name' in value)
    return [{ text: String(value.name) }];
  return [{ text: JSON.stringify(value) }];
}

function boundedSegments(segments: { text: string; anchor?: unknown }[], combine: boolean) {
  const output: { text: string; anchor?: unknown }[] = [];
  for (const segment of segments) {
    for (let offset = 0; offset < segment.text.length; offset += 4000) {
      const text = segment.text.slice(offset, offset + 4000);
      const previous = output.at(-1);
      if (combine && previous && previous.text.length + text.length < 2000) {
        previous.text += `\n${text}`;
        const end = (segment.anchor as { endSeconds?: number } | undefined)?.endSeconds;
        if (end !== undefined)
          previous.anchor = { ...((previous.anchor as object) ?? {}), endSeconds: end };
      } else output.push({ text, anchor: segment.anchor });
    }
  }
  return output;
}

/** All API-contributed enrichment is private by default, even when about public content. */
export async function contribute(
  env: Env,
  principal: Principal,
  itemId: string,
  input: ContributionInput,
  replaceId?: string,
  expectedGeneration?: number
) {
  validateField(input);
  const item = await ownedItem(env, principal.userId, itemId);
  if (expectedGeneration !== undefined && item.generation !== expectedGeneration)
    throw new ApiError(409, 'stale_generation', 'This job belongs to an erased item generation');
  const contributionId = replaceId ?? id('enr');
  const timestamp = now();
  if (replaceId) {
    const previous = await stmt(
      env.DB,
      'SELECT contributor,owner_id,content_id,field FROM contributions WHERE id=?',
      replaceId
    ).first<{ contributor: string; owner_id: string; content_id: string; field: string }>();
    if (
      !previous ||
      previous.owner_id !== principal.userId ||
      previous.content_id !== item.content_id
    )
      throw new ApiError(404, 'not_found', 'Contribution not found');
    if (previous.contributor !== principal.contributor)
      throw new ApiError(
        403,
        'contributor_mismatch',
        'Only the contributing experience can replace this contribution; submit a correction instead'
      );
    if (previous.field !== input.field)
      throw new ApiError(422, 'immutable_field', 'A contribution cannot change fields');
  }
  // Derived input references must be visible. All external contributions remain user-private,
  // which conservatively preserves privacy even for mixed public/private input sets.
  for (const inputId of input.provenance.inputContributionIds) {
    if (
      !(await stmt(
        env.DB,
        'SELECT id FROM contributions WHERE id=? AND (owner_id IS NULL OR owner_id=?)',
        inputId,
        principal.userId
      ).first())
    )
      throw new ApiError(404, 'input_not_found', 'An input contribution is unavailable');
  }
  const artifactKey = largeFields.has(input.field)
    ? `private/${principal.userId}/${contributionId}/${crypto.randomUUID()}.json`
    : null;
  if (artifactKey) {
    await reserveArtifactUsage(env, principal.userId, JSON.stringify(input.value));
    const [registered] = await atomicOwnerWrite(env, principal.userId, [
      stmt(
        env.DB,
        "INSERT INTO material_artifacts(artifact_key,owner_id,item_id,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_items WHERE id=? AND owner_id=? AND status!='deleted' AND generation=?)",
        artifactKey,
        principal.userId,
        itemId,
        timestamp,
        itemId,
        principal.userId,
        item.generation
      ),
    ]);
    if (!registered.meta.changes)
      throw new ApiError(409, 'stale_generation', 'The item was erased before upload');
  }
  let previousArtifact: string | null = null;
  if (replaceId)
    previousArtifact = await stmt(
      env.DB,
      'SELECT artifact_key FROM contributions WHERE id=?',
      replaceId
    ).first<string>('artifact_key');
  try {
    if (artifactKey)
      await env.ARTIFACTS.put(artifactKey, JSON.stringify(input.value), {
        httpMetadata: { contentType: 'application/json' },
      });
    await atomicItemWrite(env, principal.userId, itemId, async (row) => {
      assertPresent(row);
      if (row.generation !== item.generation)
        throw new ApiError(
          409,
          'stale_generation',
          'The item was deleted and re-saved during enrichment'
        );
      if (expectedGeneration !== undefined && row.generation !== expectedGeneration)
        throw new ApiError(
          409,
          'stale_generation',
          'This job belongs to a deleted generation of the item'
        );
      const statements = [
        stmt(
          env.DB,
          `INSERT INTO contributions(id,content_id,owner_id,field,value_json,artifact_key,provenance_json,contributor,category,priority,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,artifact_key=excluded.artifact_key,provenance_json=excluded.provenance_json,category=excluded.category,priority=excluded.priority,updated_at=excluded.updated_at`,
          contributionId,
          item.content_id,
          principal.userId,
          input.field,
          artifactKey ? null : JSON.stringify(input.value),
          artifactKey,
          JSON.stringify(input.provenance),
          principal.contributor,
          input.category,
          input.category === 'correction' ? 100 : 0,
          timestamp,
          timestamp
        ),
        stmt(env.DB, 'DELETE FROM search_documents WHERE contribution_id=?', contributionId),
        ...boundedSegments(
          searchableSegments(input.field, input.value),
          input.field === 'transcript'
        )
          .filter((segment) => segment.text)
          .map((segment) =>
            stmt(
              env.DB,
              'INSERT INTO search_documents(content_id,owner_id,contribution_id,field,text,anchor_json) VALUES(?,?,?,?,?,?)',
              item.content_id,
              principal.userId,
              contributionId,
              input.field,
              segment.text,
              segment.anchor ? JSON.stringify(segment.anchor) : null
            )
          ),
        stmt(
          env.DB,
          `INSERT INTO enrichment_components(content_id,owner_id,component,status,updated_at) VALUES(?,?,?,'available',?) ON CONFLICT(content_id,owner_id,component) DO UPDATE SET status='available',reason_code=NULL,updated_at=excluded.updated_at`,
          item.content_id,
          principal.userId,
          input.field,
          timestamp
        ),
        stmt(
          env.DB,
          'UPDATE personal_items SET revision=revision+1,updated_at=? WHERE id=?',
          timestamp,
          itemId
        ),
      ];
      if (input.field === 'type')
        statements.push(
          stmt(
            env.DB,
            `UPDATE personal_items SET content_type=(SELECT json_extract(value_json,'$') FROM contributions WHERE content_id=? AND field='type' AND (owner_id IS NULL OR owner_id=?) ORDER BY CASE WHEN category='correction' AND owner_id=? THEN 1 ELSE 0 END DESC,priority DESC,created_at,id LIMIT 1) WHERE id=?`,
            item.content_id,
            principal.userId,
            principal.userId,
            itemId
          )
        );
      return { statements, result: null };
    });
  } catch (e) {
    if (artifactKey)
      await stmt(
        env.DB,
        'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) VALUES(?,?)',
        artifactKey,
        now()
      ).run();
    throw e;
  }
  if (previousArtifact)
    await stmt(
      env.DB,
      'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) VALUES(?,?)',
      previousArtifact,
      now()
    ).run();
  return {
    id: contributionId,
    field: input.field,
    category: input.category,
    provenance: input.provenance,
    contributor: principal.contributor,
    visibility: 'private',
    updatedAt: timestamp,
  };
}

export const enrichmentRoutes = new Hono<AppEnv>();
enrichmentRoutes.get('/items/:itemId/enrichment', async (c) => {
  const owner = c.get('principal').userId;
  const item = await ownedItem(c.env, owner, c.req.param('itemId'));
  const entries = await visibleContributions(c.env, owner, item.content_id);
  return c.json({
    contributions: entries.map((entry) => ({
      id: entry.id,
      field: entry.field,
      category: entry.category,
      contributor: entry.contributor,
      visibility: entry.owner_id ? 'private' : 'public',
      provenance: JSON.parse(entry.provenance_json),
      value: entry.value_json ? JSON.parse(entry.value_json) : undefined,
      artifactAvailable: !!entry.artifact_key,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
  });
});
enrichmentRoutes.post('/items/:itemId/enrichment', async (c) =>
  c.json(
    await contribute(
      c.env,
      c.get('principal'),
      c.req.param('itemId'),
      await parseBody(c.req.raw, contributionSchema)
    ),
    201
  )
);
enrichmentRoutes.put('/items/:itemId/enrichment/:contributionId', async (c) =>
  c.json(
    await contribute(
      c.env,
      c.get('principal'),
      c.req.param('itemId'),
      await parseBody(c.req.raw, contributionSchema),
      c.req.param('contributionId')
    )
  )
);
enrichmentRoutes.get('/items/:itemId/enrichment/:contributionId', async (c) => {
  const owner = c.get('principal').userId;
  const item = await ownedItem(c.env, owner, c.req.param('itemId'));
  const entry = (await visibleContributions(c.env, owner, item.content_id)).find(
    (r) => r.id === c.req.param('contributionId')
  );
  if (!entry) throw new ApiError(404, 'not_found', 'Contribution not found');
  const object = entry.artifact_key ? await c.env.ARTIFACTS.get(entry.artifact_key) : null;
  if (entry.artifact_key && !object)
    throw new ApiError(
      503,
      'artifact_unavailable',
      'Contribution artifact is temporarily unavailable'
    );
  return c.json({
    id: entry.id,
    field: entry.field,
    value: entry.value_json ? JSON.parse(entry.value_json) : await object!.json(),
    provenance: JSON.parse(entry.provenance_json),
    category: entry.category,
    contributor: entry.contributor,
  });
});
enrichmentRoutes.post('/items/:itemId/enrichment/retry', async (c) => {
  const itemId = c.req.param('itemId');
  const owner = c.get('principal').userId;
  const jobId = id('job');
  const timestamp = now();
  await atomicItemWrite(c.env, owner, itemId, async (row) => {
    assertPresent(row);
    const url = await stmt(
      c.env.DB,
      'SELECT canonical_url FROM content_items WHERE id=?',
      row.content_id
    ).first<string>('canonical_url');
    return {
      statements: [
        stmt(
          c.env.DB,
          "INSERT INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES(?,?,?,'enrich',?,'pending',?,?,?)",
          jobId,
          owner,
          itemId,
          JSON.stringify({ url, contentId: row.content_id, generation: row.generation }),
          timestamp,
          timestamp,
          timestamp
        ),
        stmt(c.env.DB, 'UPDATE personal_items SET revision=revision+1 WHERE id=?', itemId),
      ],
      result: null,
    };
  });
  c.executionCtx.waitUntil(
    c.env.JOBS.send({ jobId }).catch(() =>
      console.warn(JSON.stringify({ event: 'outbox_delivery_failed', jobId }))
    )
  );
  return c.json({ jobId, status: 'pending' }, 202);
});
enrichmentRoutes.get('/jobs/:jobId', async (c) => {
  const job = await stmt(
    c.env.DB,
    'SELECT id,kind,item_id AS itemId,status,attempts,last_error_code AS errorCode,available_at AS availableAt,created_at AS createdAt,updated_at AS updatedAt FROM jobs WHERE id=? AND owner_id=?',
    c.req.param('jobId'),
    c.get('principal').userId
  ).first();
  if (!job) throw new ApiError(404, 'not_found', 'Job not found');
  return c.json(job);
});
enrichmentRoutes.post('/jobs/:jobId/retry', async (c) => {
  const owner = c.get('principal').userId;
  const jobId = c.req.param('jobId');
  const job = await stmt(
    c.env.DB,
    'SELECT status,kind,item_id,payload_json FROM jobs WHERE id=? AND owner_id=?',
    jobId,
    owner
  ).first<{ status: string; kind: string; item_id: string | null; payload_json: string }>();
  if (!job) throw new ApiError(404, 'not_found', 'Job not found');
  if (job.status === 'cancelled' || job.status === 'succeeded')
    throw new ApiError(409, 'job_not_retryable', 'Only failed or pending work can be retried');
  if (job.item_id) {
    const item = await ownedItem(c.env, owner, job.item_id);
    const payload = JSON.parse(job.payload_json);
    if (job.kind === 'enrich' && payload.generation !== item.generation)
      throw new ApiError(409, 'stale_generation', 'This work belongs to a deleted item generation');
  }
  if (job.status === 'failed')
    await stmt(
      c.env.DB,
      "UPDATE jobs SET status='pending',attempts=0,last_error_code=NULL,last_dispatched_at=NULL,available_at=?,updated_at=? WHERE id=? AND owner_id=? AND status='failed'",
      now(),
      now(),
      jobId,
      owner
    ).run();
  if (job.status !== 'running')
    c.executionCtx.waitUntil(
      c.env.JOBS.send({ jobId }).catch(() =>
        console.warn(JSON.stringify({ event: 'outbox_delivery_failed', jobId }))
      )
    );
  return c.json({ jobId, status: job.status === 'running' ? 'running' : 'pending' }, 202);
});
enrichmentRoutes.get('/items/:itemId/jobs', async (c) => {
  await ownedItem(c.env, c.get('principal').userId, c.req.param('itemId'));
  return c.json({
    jobs: await all(
      c.env.DB,
      'SELECT id,kind,status,attempts,last_error_code AS errorCode,created_at AS createdAt,updated_at AS updatedAt FROM jobs WHERE item_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 100',
      c.req.param('itemId'),
      c.get('principal').userId
    ),
  });
});
