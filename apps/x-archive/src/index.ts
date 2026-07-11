import { Hono } from 'hono';
import {
  CompleteXTimelineRunSchema,
  CreateXTimelineRunSchema,
  UploadXTimelineChunkSchema,
  X_ARCHIVE_SCHEMA_VERSION,
  type XPost,
} from '@zine/x-archive-schema';

type Bindings = Env;
type Variables = { userId: string; requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };

const API_TOKEN_PREFIX = 'zine_pat_';
const MAX_PAGE_SIZE = 100;

type TokenRow = {
  id: string;
  user_id: string;
  scopes_json: string;
  expires_at: number | null;
  revoked_at: number | null;
};

type RunRow = {
  id: string;
  user_id: string;
  requested_count: number;
  collected_count: number;
  status: string;
  started_at: number;
  completed_at: number | null;
  excluded_ads: number;
  collector_version: string;
  schema_version: number;
  manifest_key: string | null;
  failure_reason: string | null;
  created_at: number;
  updated_at: number;
};

type PostRow = {
  tweet_id: string;
  url: string;
  text: string;
  published_at: number | null;
  lang: string | null;
  kind: string;
  author_key: string;
  username: string;
  author_name: string;
  profile_url: string | null;
  profile_image_url: string | null;
  verified: number | null;
  media_json: string;
  metrics_json: string;
  r2_key: string;
  content_hash: string;
  first_seen_at: number;
  last_seen_at: number;
  first_run_id: string;
  latest_run_id: string;
  schema_version: number;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const source = new Blob([JSON.stringify(value)]).stream();
  return new Response(source.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}

function postObjectKey(userId: string, tweetId: string): string {
  return `users/${encodeURIComponent(userId)}/posts/${encodeURIComponent(tweetId)}.json.gz`;
}

function runManifestKey(userId: string, runId: string): string {
  return `users/${encodeURIComponent(userId)}/runs/${encodeURIComponent(runId)}.json.gz`;
}

function authorKey(post: XPost): string {
  return post.author.id
    ? `id:${post.author.id}`
    : `username:${post.author.username.toLocaleLowerCase()}`;
}

function toEpoch(value: string | null | undefined): number | null {
  return value ? Date.parse(value) : null;
}

function parseLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '50', 10);
  return Number.isFinite(parsed) ? Math.min(MAX_PAGE_SIZE, Math.max(1, parsed)) : 50;
}

function encodeCursor(lastSeenAt: number, tweetId: string): string {
  return btoa(JSON.stringify([lastSeenAt, tweetId]));
}

function decodeCursor(value: string | undefined): [number, string] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value)) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'number' &&
      typeof parsed[1] === 'string'
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    return null;
  }
  return null;
}

function publicRun(row: RunRow) {
  return {
    id: row.id,
    requestedCount: row.requested_count,
    collectedCount: row.collected_count,
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    excludedAds: row.excluded_ads,
    collectorVersion: row.collector_version,
    schemaVersion: row.schema_version,
    failureReason: row.failure_reason,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function publicPost(row: PostRow) {
  return {
    tweetId: row.tweet_id,
    url: row.url,
    text: row.text,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    lang: row.lang,
    kind: row.kind,
    author: {
      key: row.author_key,
      username: row.username,
      name: row.author_name,
      profileUrl: row.profile_url,
      profileImageUrl: row.profile_image_url,
      verified: row.verified === null ? null : Boolean(row.verified),
    },
    media: JSON.parse(row.media_json) as unknown,
    metrics: JSON.parse(row.metrics_json) as unknown,
    archiveKey: row.r2_key,
    contentHash: row.content_hash,
    firstSeenAt: new Date(row.first_seen_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    firstRunId: row.first_run_id,
    latestRunId: row.latest_run_id,
    schemaVersion: row.schema_version,
  };
}

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const requestId = c.req.header('X-Request-ID') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
});

app.onError((error, c) => {
  console.error('X archive request failed', {
    requestId: c.get('requestId'),
    path: c.req.path,
    error: error instanceof Error ? error.message : String(error),
  });
  return c.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR', requestId: c.get('requestId') },
    500
  );
});

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'x-archive',
    environment: c.env.ENVIRONMENT,
    schemaVersion: X_ARCHIVE_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
  })
);

app.use('/api/*', async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token.startsWith(API_TOKEN_PREFIX)) {
    return c.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', requestId: c.get('requestId') },
      401
    );
  }

  const tokenHash = await sha256Hex(token);
  const row = await c.env.AUTH_DB.prepare(
    `SELECT id, user_id, scopes_json, expires_at, revoked_at
     FROM api_tokens WHERE token_hash = ? LIMIT 1`
  )
    .bind(tokenHash)
    .first<TokenRow>();

  if (
    !row ||
    row.revoked_at !== null ||
    (row.expires_at !== null && row.expires_at <= Date.now())
  ) {
    return c.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', requestId: c.get('requestId') },
      401
    );
  }

  let scopes: unknown;
  try {
    scopes = JSON.parse(row.scopes_json);
  } catch {
    scopes = [];
  }
  const requiredScope = c.req.method === 'GET' ? 'x-archive:read' : 'x-archive:write';
  if (!Array.isArray(scopes) || !scopes.includes(requiredScope)) {
    return c.json({ error: 'Forbidden', code: 'FORBIDDEN', requestId: c.get('requestId') }, 403);
  }

  await c.env.AUTH_DB.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?')
    .bind(Date.now(), row.id)
    .run();
  c.set('userId', row.user_id);
  await next();
});

app.post('/api/v1/x-timeline/runs', async (c) => {
  const parsed = CreateXTimelineRunSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid run payload', code: 'INVALID_INPUT', issues: parsed.error.issues },
      400
    );
  }

  const userId = c.get('userId');
  const input = parsed.data;
  const existing = await c.env.ARCHIVE_DB.prepare('SELECT * FROM x_timeline_runs WHERE id = ?')
    .bind(input.runId)
    .first<RunRow>();
  if (existing) {
    if (existing.user_id !== userId) {
      return c.json({ error: 'Run already exists', code: 'RUN_CONFLICT' }, 409);
    }
    return c.json({ run: publicRun(existing), created: false });
  }

  const now = Date.now();
  await c.env.ARCHIVE_DB.prepare(
    `INSERT INTO x_timeline_runs
      (id, user_id, requested_count, status, started_at, collector_version, schema_version, created_at, updated_at)
     VALUES (?, ?, ?, 'CAPTURING', ?, ?, ?, ?, ?)`
  )
    .bind(
      input.runId,
      userId,
      input.requestedCount,
      Date.parse(input.startedAt),
      input.collectorVersion,
      X_ARCHIVE_SCHEMA_VERSION,
      now,
      now
    )
    .run();

  const created = await c.env.ARCHIVE_DB.prepare('SELECT * FROM x_timeline_runs WHERE id = ?')
    .bind(input.runId)
    .first<RunRow>();
  return c.json({ run: publicRun(created!), created: true }, 201);
});

app.put('/api/v1/x-timeline/runs/:runId/chunks/:chunkIndex', async (c) => {
  const routeChunkIndex = Number.parseInt(c.req.param('chunkIndex'), 10);
  const body = await c.req.json().catch(() => null);
  const parsed = UploadXTimelineChunkSchema.safeParse(
    body && typeof body === 'object' ? { ...(body as object), chunkIndex: routeChunkIndex } : body
  );
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid chunk payload', code: 'INVALID_INPUT', issues: parsed.error.issues },
      400
    );
  }

  const userId = c.get('userId');
  const runId = c.req.param('runId');
  const run = await c.env.ARCHIVE_DB.prepare(
    'SELECT * FROM x_timeline_runs WHERE id = ? AND user_id = ?'
  )
    .bind(runId, userId)
    .first<RunRow>();
  if (!run) return c.json({ error: 'Run not found', code: 'NOT_FOUND' }, 404);

  const input = parsed.data;
  const checksum = await sha256Hex(JSON.stringify(input));
  const priorChunk = await c.env.ARCHIVE_DB.prepare(
    'SELECT checksum, posts_received, timeline_items_received FROM x_ingest_chunks WHERE run_id = ? AND chunk_index = ?'
  )
    .bind(runId, input.chunkIndex)
    .first<{ checksum: string; posts_received: number; timeline_items_received: number }>();
  if (priorChunk) {
    if (priorChunk.checksum !== checksum) {
      return c.json(
        { error: 'Chunk index already contains different data', code: 'CHUNK_CONFLICT' },
        409
      );
    }
    return c.json({
      accepted: true,
      duplicateChunk: true,
      postsReceived: priorChunk.posts_received,
      timelineItemsReceived: priorChunk.timeline_items_received,
    });
  }
  if (run.status !== 'CAPTURING') {
    return c.json({ error: 'Run is already finalized', code: 'RUN_FINALIZED' }, 409);
  }

  const postsById = new Map(input.posts.map((post) => [post.tweetId, post]));
  const postIds = [...postsById.keys()];
  const placeholders = postIds.map(() => '?').join(', ');
  const existingRows = postIds.length
    ? await c.env.ARCHIVE_DB.prepare(
        `SELECT tweet_id, content_hash FROM x_posts WHERE user_id = ? AND tweet_id IN (${placeholders})`
      )
        .bind(userId, ...postIds)
        .all<{ tweet_id: string; content_hash: string }>()
    : { results: [] };
  const existingHashes = new Map(
    existingRows.results.map((row) => [row.tweet_id, row.content_hash])
  );

  const hashes = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const post of postsById.values()) {
    const hash = await sha256Hex(JSON.stringify(post));
    hashes.set(post.tweetId, hash);
    const previous = existingHashes.get(post.tweetId);
    if (previous === hash) {
      unchanged++;
      continue;
    }

    const key = postObjectKey(userId, post.tweetId);
    await c.env.ARCHIVE_BUCKET.put(
      key,
      await gzipJson({ schemaVersion: X_ARCHIVE_SCHEMA_VERSION, post }),
      {
        httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
        customMetadata: { userId, tweetId: post.tweetId, contentHash: hash },
      }
    );
    if (previous) updated++;
    else created++;
  }

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const post of postsById.values()) {
    const key = authorKey(post);
    const seenAt = Date.parse(post.capturedAt);
    statements.push(
      c.env.ARCHIVE_DB.prepare(
        `INSERT INTO x_authors
          (user_id, author_key, x_user_id, username, name, profile_url, profile_image_url, verified, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, author_key) DO UPDATE SET
          x_user_id = COALESCE(excluded.x_user_id, x_authors.x_user_id),
          username = excluded.username,
          name = excluded.name,
          profile_url = COALESCE(excluded.profile_url, x_authors.profile_url),
          profile_image_url = COALESCE(excluded.profile_image_url, x_authors.profile_image_url),
          verified = COALESCE(excluded.verified, x_authors.verified),
          last_seen_at = MAX(x_authors.last_seen_at, excluded.last_seen_at)`
      ).bind(
        userId,
        key,
        post.author.id ?? null,
        post.author.username,
        post.author.name,
        post.author.profileUrl ?? null,
        post.author.profileImageUrl ?? null,
        post.author.verified === undefined || post.author.verified === null
          ? null
          : post.author.verified
            ? 1
            : 0,
        seenAt,
        seenAt
      )
    );
    statements.push(
      c.env.ARCHIVE_DB.prepare(
        `INSERT INTO x_posts
          (user_id, tweet_id, url, text, published_at, lang, kind, author_key, media_json, metrics_json,
           r2_key, content_hash, first_seen_at, last_seen_at, first_run_id, latest_run_id, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, tweet_id) DO UPDATE SET
          url = excluded.url,
          text = excluded.text,
          published_at = COALESCE(excluded.published_at, x_posts.published_at),
          lang = COALESCE(excluded.lang, x_posts.lang),
          kind = excluded.kind,
          author_key = excluded.author_key,
          media_json = excluded.media_json,
          metrics_json = excluded.metrics_json,
          r2_key = excluded.r2_key,
          content_hash = excluded.content_hash,
          last_seen_at = MAX(x_posts.last_seen_at, excluded.last_seen_at),
          latest_run_id = excluded.latest_run_id,
          schema_version = excluded.schema_version`
      ).bind(
        userId,
        post.tweetId,
        post.url,
        post.text,
        toEpoch(post.publishedAt),
        post.lang ?? null,
        post.kind,
        key,
        JSON.stringify(post.media),
        JSON.stringify(post.metrics),
        postObjectKey(userId, post.tweetId),
        hashes.get(post.tweetId)!,
        seenAt,
        seenAt,
        runId,
        runId,
        X_ARCHIVE_SCHEMA_VERSION
      )
    );
    statements.push(
      c.env.ARCHIVE_DB.prepare(
        'DELETE FROM x_post_relationships WHERE user_id = ? AND source_tweet_id = ?'
      ).bind(userId, post.tweetId)
    );
    for (const relationship of post.relationships) {
      statements.push(
        c.env.ARCHIVE_DB.prepare(
          `INSERT INTO x_post_relationships
            (user_id, source_tweet_id, relationship_type, target_tweet_id, target_url)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(
          userId,
          post.tweetId,
          relationship.type,
          relationship.tweetId,
          relationship.url ?? null
        )
      );
    }
  }
  for (const item of input.items) {
    statements.push(
      c.env.ARCHIVE_DB.prepare(
        `INSERT INTO x_timeline_run_items
          (run_id, user_id, tweet_id, position, observed_at, presentation, reposted_by_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id, tweet_id) DO UPDATE SET
           position = MIN(x_timeline_run_items.position, excluded.position),
           observed_at = MIN(x_timeline_run_items.observed_at, excluded.observed_at),
           presentation = excluded.presentation,
           reposted_by_json = excluded.reposted_by_json`
      ).bind(
        runId,
        userId,
        item.tweetId,
        item.position,
        Date.parse(item.observedAt),
        item.presentation,
        item.repostedBy ? JSON.stringify(item.repostedBy) : null
      )
    );
  }
  statements.push(
    c.env.ARCHIVE_DB.prepare(
      `INSERT INTO x_ingest_chunks
        (run_id, chunk_index, checksum, posts_received, timeline_items_received, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(runId, input.chunkIndex, checksum, postsById.size, input.items.length, now)
  );
  statements.push(
    c.env.ARCHIVE_DB.prepare(
      `UPDATE x_timeline_runs
       SET collected_count = (SELECT COUNT(*) FROM x_timeline_run_items WHERE run_id = ?), updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).bind(runId, now, runId, userId)
  );
  await c.env.ARCHIVE_DB.batch(statements);

  return c.json({
    accepted: true,
    duplicateChunk: false,
    postsReceived: postsById.size,
    timelineItemsReceived: input.items.length,
    canonicalPosts: { created, updated, unchanged },
  });
});

app.post('/api/v1/x-timeline/runs/:runId/complete', async (c) => {
  const parsed = CompleteXTimelineRunSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid completion payload', code: 'INVALID_INPUT', issues: parsed.error.issues },
      400
    );
  }
  const userId = c.get('userId');
  const runId = c.req.param('runId');
  const run = await c.env.ARCHIVE_DB.prepare(
    'SELECT * FROM x_timeline_runs WHERE id = ? AND user_id = ?'
  )
    .bind(runId, userId)
    .first<RunRow>();
  if (!run) return c.json({ error: 'Run not found', code: 'NOT_FOUND' }, 404);

  const items = await c.env.ARCHIVE_DB.prepare(
    `SELECT tweet_id, position, observed_at, presentation, reposted_by_json
     FROM x_timeline_run_items WHERE run_id = ? ORDER BY position ASC`
  )
    .bind(runId)
    .all<{
      tweet_id: string;
      position: number;
      observed_at: number;
      presentation: string;
      reposted_by_json: string | null;
    }>();
  if (items.results.length !== parsed.data.collectedCount) {
    return c.json(
      {
        error: `Collected count does not match uploaded timeline items (${items.results.length})`,
        code: 'COUNT_MISMATCH',
      },
      409
    );
  }

  const key = runManifestKey(userId, runId);
  const completedAt = parsed.data.completedAt ? Date.parse(parsed.data.completedAt) : Date.now();
  await c.env.ARCHIVE_BUCKET.put(
    key,
    await gzipJson({
      schemaVersion: X_ARCHIVE_SCHEMA_VERSION,
      runId,
      requestedCount: run.requested_count,
      collectedCount: parsed.data.collectedCount,
      status: parsed.data.status,
      startedAt: new Date(run.started_at).toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      excludedAds: parsed.data.excludedAds,
      collectorVersion: run.collector_version,
      failureReason: parsed.data.failureReason ?? null,
      items: items.results.map((item) => ({
        tweetId: item.tweet_id,
        position: item.position,
        observedAt: new Date(item.observed_at).toISOString(),
        presentation: item.presentation,
        repostedBy: item.reposted_by_json ? (JSON.parse(item.reposted_by_json) as unknown) : null,
      })),
    }),
    {
      httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
      customMetadata: { userId, runId },
    }
  );

  await c.env.ARCHIVE_DB.prepare(
    `UPDATE x_timeline_runs SET
      collected_count = ?, status = ?, completed_at = ?, excluded_ads = ?, manifest_key = ?,
      failure_reason = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      parsed.data.collectedCount,
      parsed.data.status,
      completedAt,
      parsed.data.excludedAds,
      key,
      parsed.data.failureReason ?? null,
      Date.now(),
      runId,
      userId
    )
    .run();

  const completed = await c.env.ARCHIVE_DB.prepare('SELECT * FROM x_timeline_runs WHERE id = ?')
    .bind(runId)
    .first<RunRow>();
  return c.json({ run: publicRun(completed!), manifestKey: key });
});

app.get('/api/v1/x-timeline/runs', async (c) => {
  const userId = c.get('userId');
  const limit = parseLimit(c.req.query('limit'));
  const rows = await c.env.ARCHIVE_DB.prepare(
    `SELECT * FROM x_timeline_runs WHERE user_id = ? ORDER BY started_at DESC, id DESC LIMIT ?`
  )
    .bind(userId, limit)
    .all<RunRow>();
  return c.json({ runs: rows.results.map(publicRun) });
});

app.get('/api/v1/x-timeline/runs/:runId/export', async (c) => {
  const userId = c.get('userId');
  const run = await c.env.ARCHIVE_DB.prepare(
    'SELECT manifest_key FROM x_timeline_runs WHERE id = ? AND user_id = ?'
  )
    .bind(c.req.param('runId'), userId)
    .first<{ manifest_key: string | null }>();
  if (!run?.manifest_key)
    return c.json({ error: 'Completed run not found', code: 'NOT_FOUND' }, 404);
  const object = await c.env.ARCHIVE_BUCKET.get(run.manifest_key);
  if (!object) return c.json({ error: 'Run manifest is missing', code: 'ARCHIVE_MISSING' }, 500);
  return new Response(object.body, {
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      etag: object.httpEtag,
    },
  });
});

app.get('/api/v1/x-timeline/runs/:runId', async (c) => {
  const userId = c.get('userId');
  const run = await c.env.ARCHIVE_DB.prepare(
    'SELECT * FROM x_timeline_runs WHERE id = ? AND user_id = ?'
  )
    .bind(c.req.param('runId'), userId)
    .first<RunRow>();
  if (!run) return c.json({ error: 'Run not found', code: 'NOT_FOUND' }, 404);
  const items = await c.env.ARCHIVE_DB.prepare(
    `SELECT i.position, i.observed_at, i.presentation, i.reposted_by_json,
      p.tweet_id, p.url, p.text, p.published_at, p.lang, p.kind,
      p.author_key, a.username, a.name AS author_name, a.profile_url, a.profile_image_url, a.verified,
      p.media_json, p.metrics_json, p.r2_key, p.content_hash, p.first_seen_at, p.last_seen_at,
      p.first_run_id, p.latest_run_id, p.schema_version
     FROM x_timeline_run_items i
     JOIN x_posts p ON p.user_id = i.user_id AND p.tweet_id = i.tweet_id
     JOIN x_authors a ON a.user_id = p.user_id AND a.author_key = p.author_key
     WHERE i.run_id = ? AND i.user_id = ? ORDER BY i.position ASC`
  )
    .bind(run.id, userId)
    .all<
      PostRow & {
        position: number;
        observed_at: number;
        presentation: string;
        reposted_by_json: string | null;
      }
    >();
  return c.json({
    run: publicRun(run),
    items: items.results.map((item) => ({
      position: item.position,
      observedAt: new Date(item.observed_at).toISOString(),
      presentation: item.presentation,
      repostedBy: item.reposted_by_json ? (JSON.parse(item.reposted_by_json) as unknown) : null,
      post: publicPost(item),
    })),
  });
});

app.get('/api/v1/x-timeline/posts/:tweetId', async (c) => {
  const userId = c.get('userId');
  const row = await c.env.ARCHIVE_DB.prepare(
    `SELECT p.*, a.username, a.name AS author_name, a.profile_url, a.profile_image_url, a.verified
     FROM x_posts p JOIN x_authors a ON a.user_id = p.user_id AND a.author_key = p.author_key
     WHERE p.user_id = ? AND p.tweet_id = ?`
  )
    .bind(userId, c.req.param('tweetId'))
    .first<PostRow>();
  if (!row) return c.json({ error: 'Post not found', code: 'NOT_FOUND' }, 404);
  const relationships = await c.env.ARCHIVE_DB.prepare(
    `SELECT relationship_type AS type, target_tweet_id AS tweetId, target_url AS url
     FROM x_post_relationships WHERE user_id = ? AND source_tweet_id = ?`
  )
    .bind(userId, row.tweet_id)
    .all();
  return c.json({ post: { ...publicPost(row), relationships: relationships.results } });
});

app.get('/api/v1/x-timeline/posts', async (c) => {
  const userId = c.get('userId');
  const limit = parseLimit(c.req.query('limit'));
  const cursor = decodeCursor(c.req.query('cursor'));
  const statement = cursor
    ? c.env.ARCHIVE_DB.prepare(
        `SELECT p.*, a.username, a.name AS author_name, a.profile_url, a.profile_image_url, a.verified
         FROM x_posts p JOIN x_authors a ON a.user_id = p.user_id AND a.author_key = p.author_key
         WHERE p.user_id = ? AND (p.last_seen_at < ? OR (p.last_seen_at = ? AND p.tweet_id < ?))
         ORDER BY p.last_seen_at DESC, p.tweet_id DESC LIMIT ?`
      ).bind(userId, cursor[0], cursor[0], cursor[1], limit)
    : c.env.ARCHIVE_DB.prepare(
        `SELECT p.*, a.username, a.name AS author_name, a.profile_url, a.profile_image_url, a.verified
         FROM x_posts p JOIN x_authors a ON a.user_id = p.user_id AND a.author_key = p.author_key
         WHERE p.user_id = ? ORDER BY p.last_seen_at DESC, p.tweet_id DESC LIMIT ?`
      ).bind(userId, limit);
  const rows = await statement.all<PostRow>();
  const last = rows.results.at(-1);
  return c.json({
    posts: rows.results.map(publicPost),
    nextCursor:
      rows.results.length === limit && last ? encodeCursor(last.last_seen_at, last.tweet_id) : null,
  });
});

export { app };
export default app;
