import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDailyAuthorActivity, getDailyFeed } from '../../lib/daily-feed';
import {
  activatePeopleDailyEdition,
  failPeopleDailyBuild,
  getPeopleDailyBuild,
  getPeopleDailyOverview,
  getPeopleDailySection,
  listPeopleDailyEditions,
  PeopleDailyConflictError,
  PeopleDailyNotFoundError,
  PeopleDailyValidationError,
  publishPeopleDailyBuild,
  startPeopleDailyBuild,
} from '../../lib/people-daily-editions';
import type { Env } from '../../types';
import { apiAuth } from './auth';

const apiV1Routes = new Hono<Env>();

const DailyFeedQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const DailyAuthorQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  range: z.enum(['TODAY', 'WEEK']).default('TODAY'),
});

const PeopleDailyStartBuildSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    editionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    model: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

const PeopleDailyPublishBuildSchema = z
  .object({
    favoritesRunId: z.string().trim().min(1).max(200),
    followingRunId: z.string().trim().min(1).max(200),
  })
  .strict();

const PeopleDailyFailBuildSchema = z
  .object({
    stage: z.enum([
      'COLLECT_FAVORITES',
      'COLLECT_FOLLOWING',
      'BUILD',
      'VALIDATE',
      'UPLOAD',
      'PUBLISH',
      'READBACK',
    ]),
    message: z.string().trim().min(1).max(2_000),
  })
  .strict();

function peopleDailyErrorResponse(c: Context<Env>, error: unknown): Response {
  const common = { requestId: c.get('requestId'), traceId: c.get('traceId') };
  if (error instanceof PeopleDailyNotFoundError) {
    return c.json({ error: error.message, code: 'NOT_FOUND', ...common }, 404);
  }
  if (error instanceof PeopleDailyConflictError) {
    return c.json({ error: error.message, code: 'PEOPLE_DAILY_CONFLICT', ...common }, 409);
  }
  if (error instanceof PeopleDailyValidationError) {
    return c.json({ error: error.message, code: 'PEOPLE_DAILY_VALIDATION', ...common }, 422);
  }
  throw error;
}

apiV1Routes.get('/today', apiAuth('bookmarks:read'), async (c) => {
  try {
    const result = await getPeopleDailyOverview(c.env.DB, c.env.ARTICLE_CONTENT, c.get('userId')!);
    if (!result) {
      return c.json(
        {
          error: 'No published people-first Today edition is available',
          code: 'TODAY_UNAVAILABLE',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }
    const etag = `"${result.contentHash}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return peopleDailyErrorResponse(c, error);
  }
});

apiV1Routes.get('/today/sections/:sectionId', apiAuth('bookmarks:read'), async (c) => {
  try {
    const result = await getPeopleDailySection(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      c.req.param('sectionId')
    );
    if (!result) {
      return c.json(
        {
          error: 'No published people-first Today edition is available',
          code: 'TODAY_UNAVAILABLE',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }
    const etag = `"${result.edition.contentHash}:${c.req.param('sectionId')}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', 'private, max-age=300, stale-while-revalidate=900');
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return peopleDailyErrorResponse(c, error);
  }
});

apiV1Routes.post('/today/builds', apiAuth('bookmarks:write'), async (c) => {
  const parsed = PeopleDailyStartBuildSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid People Daily build',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await startPeopleDailyBuild(c.env.DB, c.get('userId')!, parsed.data);
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    return peopleDailyErrorResponse(c, error);
  }
});

apiV1Routes.get('/today/builds/:buildId', apiAuth('bookmarks:read'), async (c) => {
  try {
    const build = await getPeopleDailyBuild(c.env.DB, c.get('userId')!, c.req.param('buildId'));
    return c.json({ build, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return peopleDailyErrorResponse(c, error);
  }
});

apiV1Routes.post('/today/builds/:buildId/publish', apiAuth('bookmarks:write'), async (c) => {
  const parsed = PeopleDailyPublishBuildSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid People Daily source runs',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await publishPeopleDailyBuild(
      c.env.DB,
      c.env.X_ARCHIVE_DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      c.req.param('buildId'),
      parsed.data,
      {
        ai: c.env.AI as unknown as
          | { run(model: string, input: unknown): Promise<unknown> }
          | undefined,
        embeddingModel: c.env.EMBEDDING_MODEL,
        overviewModel: c.env.ENRICHMENT_MODEL,
      }
    );
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    return peopleDailyErrorResponse(c, error);
  }
});

apiV1Routes.post('/today/builds/:buildId/failure', apiAuth('bookmarks:write'), async (c) => {
  const parsed = PeopleDailyFailBuildSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid People Daily failure',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const build = await failPeopleDailyBuild(
      c.env.DB,
      c.get('userId')!,
      c.req.param('buildId'),
      parsed.data
    );
    return c.json({ build, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return peopleDailyErrorResponse(c, error);
  }
});

apiV1Routes.get('/today/editions', apiAuth('bookmarks:read'), async (c) => {
  const parsed = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30)
    .safeParse(c.req.query('limit'));
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid People Daily edition limit',
        code: 'INVALID_QUERY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  const result = await listPeopleDailyEditions(c.env.DB, c.get('userId')!, parsed.data);
  return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
});

apiV1Routes.post('/today/editions/:editionId/activate', apiAuth('bookmarks:write'), async (c) => {
  try {
    const result = await activatePeopleDailyEdition(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      c.req.param('editionId')
    );
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return peopleDailyErrorResponse(c, error);
  }
});

apiV1Routes.get('/today/feed', apiAuth('bookmarks:read'), async (c) => {
  const parsed = DailyFeedQuerySchema.safeParse({ date: c.req.query('date') });
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid daily feed query',
        code: 'INVALID_QUERY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  const result = await getDailyFeed(c.env.X_ARCHIVE_DB, c.get('userId')!, {
    ...parsed.data,
    ai: c.env.AI as unknown as { run(model: string, input: unknown): Promise<unknown> } | undefined,
    embeddingModel: c.env.EMBEDDING_MODEL,
    overviewModel: c.env.ENRICHMENT_MODEL,
  });
  return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
});

apiV1Routes.get('/today/authors/:authorKey', apiAuth('bookmarks:read'), async (c) => {
  const parsed = DailyAuthorQuerySchema.safeParse({
    date: c.req.query('date'),
    range: c.req.query('range'),
  });
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid author activity query',
        code: 'INVALID_QUERY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  const result = await getDailyAuthorActivity(
    c.env.X_ARCHIVE_DB,
    c.get('userId')!,
    c.req.param('authorKey'),
    parsed.data
  );
  return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
});

export default apiV1Routes;
