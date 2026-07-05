import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ulid } from 'ulid';
import { ContentTypeSchema, ProviderSchema, UserItemState } from '@zine/shared';
import type { Env } from '../types';
import { createDb } from '../db';
import { apiTokens, userItemConsumptionEvents, userItems } from '../db/schema';
import { appRouter } from '../trpc/router';
import { createContext } from '../trpc/context';
import openApiSpec from './api-v1.openapi.json';
import {
  getActiveSyncJob,
  getJobStatus,
  getSyncStatus,
  initiateSyncJob,
  RateLimitError,
} from '../sync/service';
import {
  type ApiTokenScope,
  API_TOKEN_PREFIX,
  hashApiToken,
  hasApiTokenScope,
  isApiTokenActive,
} from '../lib/api-tokens';

const DEFAULT_BOOKMARKS_LIMIT = 10;
const MAX_BOOKMARKS_LIMIT = 50;

const SaveBookmarkBodySchema = z.object({
  url: z.string().url('Invalid URL format'),
});

const InboxQuerySchema = z.object({
  provider: ProviderSchema.optional(),
  contentType: ContentTypeSchema.optional(),
});

const BookmarkQuerySchema = z.object({
  provider: ProviderSchema.optional(),
  contentType: ContentTypeSchema.optional(),
});

const SyncJobBodySchema = z.object({}).strict().optional();

const SetTagsBodySchema = z
  .object({
    tags: z.array(z.string().min(1).max(64)).max(20),
  })
  .strict();

const UpdateProgressBodySchema = z
  .object({
    position: z.number().min(0),
    duration: z.number().min(0),
  })
  .strict();

const FinishBookmarkBodySchema = z
  .object({
    isFinished: z.boolean().optional(),
    finished: z.boolean().optional(),
    completed: z.boolean().optional(),
    read: z.boolean().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const fields = ['isFinished', 'finished', 'completed', 'read'] as const;
    const provided = fields.filter((field) => body[field] !== undefined);

    if (provided.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of isFinished, finished, completed, or read',
      });
    }
  });

function getRequestedFinishedState(body: z.infer<typeof FinishBookmarkBodySchema>): boolean {
  return Boolean(body.isFinished ?? body.finished ?? body.completed ?? body.read);
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.startsWith(API_TOKEN_PREFIX) ? token : null;
}

function parseLimit(value: string | undefined): number {
  if (!value) {
    return DEFAULT_BOOKMARKS_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BOOKMARKS_LIMIT;
  }

  return Math.min(MAX_BOOKMARKS_LIMIT, Math.max(1, parsed));
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

function getRetryAfterSeconds(message: string): number | undefined {
  const match = message.match(/wait (\d+) seconds/i);
  if (!match) {
    return undefined;
  }

  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function toPreviewItem(preview: {
  provider: string;
  contentType: string;
  providerId: string;
  title: string;
  creator: string;
  creatorImageUrl?: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  canonicalUrl: string;
  description?: string | null;
  siteName?: string | null;
  wordCount?: number | null;
  readingTimeMinutes?: number | null;
  publishedAt?: string | null;
}) {
  return {
    provider: preview.provider,
    contentType: preview.contentType,
    providerId: preview.providerId,
    title: preview.title,
    creator: preview.creator,
    creatorImageUrl: preview.creatorImageUrl ?? null,
    thumbnailUrl: preview.thumbnailUrl,
    duration: preview.duration,
    canonicalUrl: preview.canonicalUrl,
    description: preview.description ?? null,
    siteName: preview.siteName ?? null,
    wordCount: preview.wordCount ?? null,
    readingTimeMinutes: preview.readingTimeMinutes ?? null,
    publishedAt: preview.publishedAt ?? null,
  };
}

function trpcErrorResponse(c: Context<Env>, error: unknown) {
  if (error instanceof TRPCError) {
    if (error.code === 'NOT_FOUND') {
      return c.json(
        {
          error: error.message,
          code: 'NOT_FOUND',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }

    if (error.code === 'BAD_REQUEST') {
      return c.json(
        {
          error: error.message,
          code: 'BAD_REQUEST',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }

    if (error.code === 'UNAUTHORIZED') {
      return c.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        401
      );
    }
  }

  throw error;
}

function personalAccessTokenAuth(requiredScope: ApiTokenScope) {
  const middleware: MiddlewareHandler<Env> = async (c, next) => {
    const requestId = c.get('requestId');
    const traceId = c.get('traceId');
    const rawToken = extractBearerToken(c.req.header('Authorization'));

    if (!rawToken) {
      return c.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          requestId,
          traceId,
        },
        401
      );
    }

    const tokenHash = await hashApiToken(rawToken);
    const db = createDb(c.env.DB);
    const token = await db.query.apiTokens.findFirst({
      where: eq(apiTokens.tokenHash, tokenHash),
    });

    if (!token || !isApiTokenActive(token)) {
      return c.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          requestId,
          traceId,
        },
        401
      );
    }

    if (!hasApiTokenScope(token, requiredScope)) {
      return c.json(
        {
          error: 'Forbidden',
          code: 'FORBIDDEN',
          requestId,
          traceId,
        },
        403
      );
    }

    await db
      .update(apiTokens)
      .set({ lastUsedAt: Date.now() })
      .where(and(eq(apiTokens.id, token.id), eq(apiTokens.userId, token.userId)));

    c.set('userId', token.userId);
    await next();
  };

  return middleware;
}

const apiV1Routes = new Hono<Env>();

apiV1Routes.get('/openapi.json', (c) => c.json(openApiSpec));

apiV1Routes.post('/sync-jobs', personalAccessTokenAuth('sync:write'), async (c) => {
  let body: unknown;
  const contentLength = c.req.header('content-length');
  const hasPositiveContentLength =
    contentLength !== undefined && Number.parseInt(contentLength, 10) > 0;
  const hasJsonBody =
    hasPositiveContentLength ||
    (contentLength === undefined && c.req.header('content-type')?.includes('application/json'));

  if (hasJsonBody) {
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: 'Invalid request body',
          code: 'INVALID_REQUEST_BODY',
          issues: [{ message: 'Expected a valid JSON request body' }],
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }
  }

  const parsedBody = SyncJobBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const userId = c.get('userId');
  if (!userId) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      401
    );
  }

  try {
    const result = await initiateSyncJob(userId, createDb(c.env.DB), c.env, {
      traceId: c.get('traceId'),
      requestId: c.get('requestId'),
      clientRequestId: c.get('clientRequestId'),
      source: 'api.v1.syncJobs.create',
    });

    return c.json(
      {
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      202
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      const retryAfterSeconds = getRetryAfterSeconds(error.message);
      if (retryAfterSeconds !== undefined) {
        c.header('Retry-After', String(retryAfterSeconds));
      }

      return c.json(
        {
          error: error.message,
          code: 'RATE_LIMITED',
          retryAfterSeconds,
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        429
      );
    }
    throw error;
  }
});

apiV1Routes.get('/sync-jobs/active', personalAccessTokenAuth('sync:read'), async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      401
    );
  }

  const result = await getActiveSyncJob(userId, c.env.OAUTH_STATE_KV);

  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/sync-jobs/:jobId', personalAccessTokenAuth('sync:read'), async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      401
    );
  }

  const jobId = c.req.param('jobId');
  const storedStatus = await getJobStatus(jobId, c.env.OAUTH_STATE_KV);
  if (!storedStatus || storedStatus.userId !== userId) {
    return c.json(
      {
        error: 'Sync job not found',
        code: 'SYNC_JOB_NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }

  const result = await getSyncStatus(jobId, c.env.OAUTH_STATE_KV);

  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/inbox', personalAccessTokenAuth('bookmarks:read'), async (c) => {
  const parsedQuery = InboxQuerySchema.safeParse({
    provider: c.req.query('provider'),
    contentType: c.req.query('contentType'),
  });

  if (!parsedQuery.success) {
    return c.json(
      {
        error: 'Invalid query parameters',
        code: 'INVALID_QUERY_PARAMETERS',
        issues: parsedQuery.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');

  const result = await caller.items.inbox({
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
    filter: {
      provider: parsedQuery.data.provider,
      contentType: parsedQuery.data.contentType,
    },
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.post('/inbox/:id/bookmark', personalAccessTokenAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.bookmark({ id: c.req.param('id') });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/inbox/:id/archive', personalAccessTokenAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.archive({ id: c.req.param('id') });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/bookmarks', personalAccessTokenAuth('bookmarks:read'), async (c) => {
  const parsedQuery = BookmarkQuerySchema.safeParse({
    provider: c.req.query('provider'),
    contentType: c.req.query('contentType'),
  });

  if (!parsedQuery.success) {
    return c.json(
      {
        error: 'Invalid query parameters',
        code: 'INVALID_QUERY_PARAMETERS',
        issues: parsedQuery.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');
  const search = c.req.query('search')?.trim();
  const isFinished = parseBoolean(c.req.query('isFinished'));

  const result = await caller.items.library({
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
    search: search && search.length > 0 ? search : undefined,
    filter: {
      provider: parsedQuery.data.provider,
      contentType: parsedQuery.data.contentType,
      isFinished,
    },
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.post('/bookmarks/preview', personalAccessTokenAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = SaveBookmarkBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));

  try {
    const preview = await caller.bookmarks.preview({ url: parsedBody.data.url });

    if (!preview) {
      return c.json(
        {
          error: 'URL could not be previewed',
          code: 'UNSUPPORTED_URL',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        422
      );
    }

    return c.json({
      item: toPreviewItem(preview),
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/bookmarks', personalAccessTokenAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = SaveBookmarkBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  const preview = await caller.bookmarks.preview({ url: parsedBody.data.url });

  if (!preview) {
    return c.json(
      {
        error: 'URL could not be previewed',
        code: 'UNSUPPORTED_URL',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      422
    );
  }

  const bookmark = await caller.bookmarks.save({
    ...preview,
    url: parsedBody.data.url,
  });

  return c.json({
    bookmark,
    item: toPreviewItem(preview),
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/bookmarks/:id', personalAccessTokenAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const item = await caller.items.get({ id: c.req.param('id') });
    return c.json({
      item,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.patch('/bookmarks/:id', personalAccessTokenAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = FinishBookmarkBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const bookmarkId = c.req.param('id');
  const userId = c.get('userId');
  if (!userId) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      401
    );
  }

  const db = createDb(c.env.DB);
  const bookmark = await db.query.userItems.findFirst({
    where: and(
      eq(userItems.id, bookmarkId),
      eq(userItems.userId, userId),
      eq(userItems.state, UserItemState.BOOKMARKED)
    ),
  });

  if (!bookmark) {
    return c.json(
      {
        error: 'Bookmark not found',
        code: 'BOOKMARK_NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }

  const isFinished = getRequestedFinishedState(parsedBody.data);
  const finishedAt = isFinished ? (bookmark.finishedAt ?? new Date().toISOString()) : null;

  if (bookmark.isFinished !== isFinished) {
    const now = Date.now();

    await db
      .update(userItems)
      .set({
        isFinished,
        finishedAt,
        updatedAt: new Date(now).toISOString(),
      })
      .where(eq(userItems.id, bookmarkId));

    await db.insert(userItemConsumptionEvents).values({
      id: ulid(),
      userId,
      userItemId: bookmark.id,
      itemId: bookmark.itemId,
      eventType: isFinished ? 'FINISHED' : 'UNFINISHED',
      occurredAt: now,
      positionSeconds: null,
      durationSeconds: null,
      deltaSeconds: null,
      source: 'MANUAL_FINISH_TOGGLE',
      metadata: JSON.stringify({ source: 'api_v1' }),
    });
  }

  return c.json({
    bookmark: {
      id: bookmark.id,
      itemId: bookmark.itemId,
      isFinished,
      finishedAt,
    },
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.delete('/bookmarks/:id', personalAccessTokenAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.unbookmark({ id: c.req.param('id') });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.put('/bookmarks/:id/tags', personalAccessTokenAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = SetTagsBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.setTags({
      id: c.req.param('id'),
      tags: parsedBody.data.tags,
    });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/bookmarks/:id/opened', personalAccessTokenAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.markOpened({ id: c.req.param('id') });
    return c.json({
      ...result,
      lastOpenedAt: 'lastOpenedAt' in result ? result.lastOpenedAt : null,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.put(
  '/bookmarks/:id/progress',
  personalAccessTokenAuth('bookmarks:write'),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = UpdateProgressBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid request body',
          code: 'INVALID_REQUEST_BODY',
          issues: parsedBody.error.issues,
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }

    const caller = appRouter.createCaller(await createContext(c));

    try {
      const result = await caller.items.updateProgress({
        id: c.req.param('id'),
        position: parsedBody.data.position,
        duration: parsedBody.data.duration,
      });
      return c.json({
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      });
    } catch (error) {
      return trpcErrorResponse(c, error);
    }
  }
);

apiV1Routes.get(
  '/bookmarks/:id/article-content',
  personalAccessTokenAuth('bookmarks:read'),
  async (c) => {
    const caller = appRouter.createCaller(await createContext(c));

    try {
      const item = await caller.items.get({ id: c.req.param('id') });
      const result = await caller.items.getArticleContent({ itemId: item.itemId });
      return c.json({
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      });
    } catch (error) {
      return trpcErrorResponse(c, error);
    }
  }
);

apiV1Routes.get('/tags', personalAccessTokenAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  const result = await caller.items.listTags();
  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

export default apiV1Routes;
