import { ContentTypeSchema, ProviderSchema, UserItemState } from '@zine/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { ulid } from 'ulid';
import { z } from 'zod';
import {
  enqueueArticleBody,
  getArticleBodyStatus,
  isArticleBodyEnrollmentEnabled,
  toArticleBodyPublicStatus,
} from '../../article-body/service';
import { getArticleBodyArtifact } from '../../article-body/storage';
import { createDb } from '../../db';
import { userItemConsumptionEvents, userItems } from '../../db/schema';
import { logger } from '../../lib/logger';
import { createContext } from '../../trpc/context';
import { appRouter } from '../../trpc/router';
import type { Env } from '../../types';
import { apiAuth } from './auth';
import { trpcErrorResponse } from './errors';
import { parseBoolean, parseLimit } from './request';

const apiV1Routes = new Hono<Env>();

const apiLogger = logger.child('api-v1');

async function readArticleContent(
  env: Env['Bindings'],
  itemId: string,
  legacyContent: string | null
) {
  const record = await getArticleBodyStatus(createDb(env.DB), itemId);
  const artifact = record?.r2Key
    ? await getArticleBodyArtifact(env.ARTICLE_CONTENT, record.r2Key)
    : null;
  const artifactMissing = Boolean(record?.r2Key && !artifact);
  const effectiveRecord = artifactMissing
    ? { ...record!, versionId: null, r2Key: null, lastErrorCode: 'ARTIFACT_MISSING' }
    : record;
  let articleBody = toArticleBodyPublicStatus(effectiveRecord, Boolean(legacyContent));

  if (artifactMissing && legacyContent) {
    articleBody = {
      ...articleBody,
      availability: 'DEGRADED' as const,
      sourceKind: 'LEGACY' as const,
      qualityWarnings: [...articleBody.qualityWarnings, 'CURRENT_ARTIFACT_MISSING_FALLBACK_LEGACY'],
    };
  }

  return {
    content: artifact?.sanitizedHtml ?? legacyContent,
    articleBody,
  };
}

async function enrollSavedArticleBestEffort(
  env: Env['Bindings'],
  item: { itemId: string; contentType: string },
  traceId: string
): Promise<void> {
  if (item.contentType !== 'ARTICLE' || !isArticleBodyEnrollmentEnabled(env, 'bookmark')) {
    return;
  }

  try {
    await enqueueArticleBody(createDb(env.DB), env, {
      itemId: item.itemId,
      trigger: 'bookmark',
      traceId,
    });
  } catch (error) {
    apiLogger.warn('Article-body bookmark enrollment failed without blocking the bookmark', {
      operation: 'article_body.enroll.bookmark',
      traceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const SaveBookmarkBodySchema = z.object({
  url: z.string().url('Invalid URL format'),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
});

const PreviewBookmarkBodySchema = z.object({
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

apiV1Routes.get('/inbox', apiAuth('bookmarks:read'), async (c) => {
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

apiV1Routes.get('/home', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  const result = await caller.items.home({});

  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.post('/inbox/:id/bookmark', apiAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const item = await caller.items.get({ id: c.req.param('id') });
    const result = await caller.items.bookmark({ id: c.req.param('id') });
    await enrollSavedArticleBestEffort(c.env, item, c.get('traceId'));
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/inbox/:id/archive', apiAuth('bookmarks:write'), async (c) => {
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

apiV1Routes.get('/bookmarks', apiAuth('bookmarks:read'), async (c) => {
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

apiV1Routes.get('/bookmarks/opened', apiAuth('bookmarks:read'), async (c) => {
  const parsedQuery = BookmarkQuerySchema.safeParse({
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
  const result = await caller.items.recentlyOpened({
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
    filter: { contentType: parsedQuery.data.contentType },
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/bookmarks/quick-wins', apiAuth('bookmarks:read'), async (c) => {
  const parsedQuery = BookmarkQuerySchema.safeParse({
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
  const result = await caller.items.quickWins({
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
    filter: { contentType: parsedQuery.data.contentType },
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/collections/:id/items', apiAuth('bookmarks:read'), async (c) => {
  const parsedQuery = BookmarkQuerySchema.safeParse({
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
  const result = await caller.collections.items({
    id: c.req.param('id'),
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
    filter: { contentType: parsedQuery.data.contentType },
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.post('/bookmarks/preview', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = PreviewBookmarkBodySchema.safeParse(body);

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

apiV1Routes.post('/bookmarks', apiAuth('bookmarks:write'), async (c) => {
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

  try {
    const bookmark = await caller.bookmarks.save({
      ...preview,
      url: parsedBody.data.url,
      tags: parsedBody.data.tags,
    });
    await enrollSavedArticleBestEffort(
      c.env,
      { itemId: bookmark.itemId, contentType: preview.contentType },
      c.get('traceId')
    );

    return c.json({
      bookmark,
      item: toPreviewItem(preview),
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/bookmarks/:id', apiAuth('bookmarks:read'), async (c) => {
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

apiV1Routes.get('/bookmarks/:id/subscription-settings', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.subscriptionSettings({ id: c.req.param('id') });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.patch('/bookmarks/:id', apiAuth('bookmarks:write'), async (c) => {
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

  const isFinished = getRequestedFinishedState(parsedBody.data);
  const db = createDb(c.env.DB);
  const bookmark = await db.query.userItems.findFirst({
    where: and(
      eq(userItems.id, bookmarkId),
      eq(userItems.userId, userId),
      isFinished ? undefined : eq(userItems.state, UserItemState.BOOKMARKED)
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

  const finishedAt = isFinished ? (bookmark.finishedAt ?? new Date().toISOString()) : null;

  const shouldBookmark = isFinished && bookmark.state !== UserItemState.BOOKMARKED;
  if (bookmark.isFinished !== isFinished || shouldBookmark) {
    const now = Date.now();

    await db
      .update(userItems)
      .set({
        ...(shouldBookmark
          ? { state: UserItemState.BOOKMARKED, bookmarkedAt: new Date(now).toISOString() }
          : {}),
        isFinished,
        finishedAt,
        updatedAt: new Date(now).toISOString(),
      })
      .where(eq(userItems.id, bookmarkId));
  }

  if (bookmark.isFinished !== isFinished) {
    const now = Date.now();
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

apiV1Routes.delete('/bookmarks/:id', apiAuth('bookmarks:write'), async (c) => {
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

apiV1Routes.put('/bookmarks/:id/tags', apiAuth('bookmarks:write'), async (c) => {
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

apiV1Routes.post('/bookmarks/:id/opened', apiAuth('bookmarks:write'), async (c) => {
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

apiV1Routes.put('/bookmarks/:id/progress', apiAuth('bookmarks:write'), async (c) => {
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
});

apiV1Routes.get('/bookmarks/:id/article-content', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const item = await caller.items.get({ id: c.req.param('id') });
    const legacy = await caller.items.getArticleContent({ itemId: item.itemId });
    const result = await readArticleContent(c.env, item.itemId, legacy.content);

    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/bookmarks/:id/article-content', apiAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const item = await caller.items.get({ id: c.req.param('id') });
    if (item.contentType !== 'ARTICLE') {
      return c.json(
        {
          error: 'Article reading is only available for article items',
          code: 'ARTICLE_BODY_NOT_ELIGIBLE',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        422
      );
    }

    const requestResult = isArticleBodyEnrollmentEnabled(c.env, 'reader_open')
      ? await enqueueArticleBody(createDb(c.env.DB), c.env, {
          itemId: item.itemId,
          trigger: 'reader_open',
          traceId: c.get('traceId'),
        })
      : { queued: false as const, reason: 'enrollment_disabled' as const };
    const legacy = await caller.items.getArticleContent({ itemId: item.itemId });
    const result = await readArticleContent(c.env, item.itemId, legacy.content);
    const response = {
      ...result,
      request: requestResult,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    };

    return requestResult.queued || requestResult.reason === 'already_queued'
      ? c.json(response, 202)
      : c.json(response);
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/tags', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  const result = await caller.items.listTags();
  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

export default apiV1Routes;
