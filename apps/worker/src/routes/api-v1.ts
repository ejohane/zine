import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Env } from '../types';
import { createDb } from '../db';
import { apiTokens } from '../db/schema';
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

export default apiV1Routes;
