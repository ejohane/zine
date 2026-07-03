import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ulid } from 'ulid';
import { ContentTypeSchema, ProviderSchema, UserItemState } from '@zine/shared';
import type { Env } from '../types';
import { createDb } from '../db';
import { apiTokens, userItemConsumptionEvents, userItems } from '../db/schema';
import { appRouter } from '../trpc/router';
import { createContext } from '../trpc/context';
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

function openApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Zine API',
      version: '1.0.0',
      description: 'REST API for personal access token access to Zine bookmarks.',
    },
    servers: [{ url: 'https://api.myzine.app' }],
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/v1/inbox': {
        get: {
          operationId: 'listInbox',
          summary: 'List inbox items',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_BOOKMARKS_LIMIT,
                default: DEFAULT_BOOKMARKS_LIMIT,
              },
            },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
            {
              name: 'provider',
              in: 'query',
              schema: {
                type: 'string',
                enum: Object.values(ProviderSchema.enum),
              },
            },
            {
              name: 'contentType',
              in: 'query',
              schema: {
                type: 'string',
                enum: Object.values(ContentTypeSchema.enum),
              },
            },
          ],
          responses: {
            '200': { description: 'Inbox items' },
            '400': { description: 'Invalid query parameters' },
            '401': { description: 'Missing or invalid personal access token' },
            '403': { description: 'Token is missing bookmarks:read scope' },
          },
        },
      },
      '/api/v1/bookmarks': {
        get: {
          operationId: 'listBookmarks',
          summary: 'List bookmarks',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_BOOKMARKS_LIMIT,
                default: DEFAULT_BOOKMARKS_LIMIT,
              },
            },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            {
              name: 'isFinished',
              in: 'query',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            '200': { description: 'Bookmarks' },
            '401': { description: 'Missing or invalid personal access token' },
            '403': { description: 'Token is missing bookmarks:read scope' },
          },
        },
        post: {
          operationId: 'saveBookmark',
          summary: 'Save a URL as a bookmark',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: { type: 'string', format: 'uri' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Bookmark saved or already present' },
            '400': { description: 'Invalid request body' },
            '401': { description: 'Missing or invalid personal access token' },
            '403': { description: 'Token is missing bookmarks:write scope' },
            '422': { description: 'URL could not be previewed or saved' },
          },
        },
      },
      '/api/v1/bookmarks/{id}': {
        patch: {
          operationId: 'updateBookmarkFinishedState',
          summary: 'Mark a bookmark as finished or unfinished',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    isFinished: { type: 'boolean' },
                    finished: { type: 'boolean' },
                    completed: { type: 'boolean' },
                    read: { type: 'boolean' },
                  },
                  minProperties: 1,
                  maxProperties: 1,
                },
              },
            },
          },
          responses: {
            '200': { description: 'Bookmark finished state updated' },
            '400': { description: 'Invalid request body' },
            '401': { description: 'Missing or invalid personal access token' },
            '403': { description: 'Token is missing bookmarks:write scope' },
            '404': { description: 'Bookmark not found' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
  };
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

apiV1Routes.get('/openapi.json', (c) => c.json(openApiSpec()));

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

apiV1Routes.get('/bookmarks', personalAccessTokenAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');
  const search = c.req.query('search')?.trim();
  const isFinished = parseBoolean(c.req.query('isFinished'));

  const result = await caller.items.library({
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
    search: search && search.length > 0 ? search : undefined,
    filter: {
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
    item: {
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
    },
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
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

export default apiV1Routes;
