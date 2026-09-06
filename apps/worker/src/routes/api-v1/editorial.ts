import {
  CreateEditorialFeedbackSchema,
  FailEditorialRunSchema,
  PublishEditorialEditionSchema,
  StartEditorialRunSchema,
} from '@zine/editorial-schema';
import { Hono } from 'hono';
import {
  EditorialFeedbackConflictError,
  EditorialFeedbackTargetError,
  getEditorialFeedbackProfile,
  recordEditorialFeedback,
} from '../../lib/editorial-feedback';
import {
  EditorialRunConflictError,
  EditorialRunNotFoundError,
  failEditorialRun,
  startEditorialRun,
} from '../../lib/editorial-runs';
import {
  EditorialConflictError,
  EditorialValidationError,
  getEditorialArtifact,
  getEditorialEdition,
  listEditorialEditions,
  storeEditorialEdition,
} from '../../lib/editorial-storage';
import { getEditorialToday } from '../../lib/editorial-today';
import type { Env } from '../../types';
import { apiAuth } from './auth';
import { parseLimit } from './request';

const apiV1Routes = new Hono<Env>();

apiV1Routes.get('/editorial/today', apiAuth('bookmarks:read'), async (c) => {
  const result = await getEditorialToday(c.env.DB, c.env.ARTICLE_CONTENT, c.get('userId')!);
  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.post('/editorial/runs', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = StartEditorialRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial run',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await startEditorialRun(c.env.DB, c.get('userId')!, parsed.data);
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    if (error instanceof EditorialRunConflictError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITORIAL_RUN_CONFLICT',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        409
      );
    }
    throw error;
  }
});

apiV1Routes.post('/editorial/runs/:id/failure', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = FailEditorialRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial run failure',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await failEditorialRun(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    if (error instanceof EditorialRunNotFoundError) {
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
    if (error instanceof EditorialRunConflictError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITORIAL_RUN_CONFLICT',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        409
      );
    }
    throw error;
  }
});

apiV1Routes.get('/editorial/feedback/profile', apiAuth('bookmarks:read'), async (c) => {
  const profile = await getEditorialFeedbackProfile(c.env.DB, c.get('userId')!);
  return c.json({
    profile,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.post('/editorial/feedback', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateEditorialFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial feedback',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  const edition = await getEditorialEdition(
    c.env.DB,
    c.env.ARTICLE_CONTENT,
    c.get('userId')!,
    parsed.data.editionId
  );
  if (!edition) {
    return c.json(
      {
        error: 'Edition not found',
        code: 'NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }
  try {
    const result = await recordEditorialFeedback(
      c.env.DB,
      c.get('userId')!,
      edition.edition,
      parsed.data
    );
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.duplicate ? 200 : 201
    );
  } catch (error) {
    if (error instanceof EditorialFeedbackConflictError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITORIAL_FEEDBACK_CONFLICT',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        409
      );
    }
    if (error instanceof EditorialFeedbackTargetError) {
      return c.json(
        {
          error: error.message,
          code: 'INVALID_EDITORIAL_TARGET',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }
    throw error;
  }
});

apiV1Routes.get('/editorial/editions', apiAuth('bookmarks:read'), async (c) => {
  const editions = await listEditorialEditions(
    c.env.DB,
    c.get('userId')!,
    parseLimit(c.req.query('limit'))
  );
  return c.json({ editions, requestId: c.get('requestId'), traceId: c.get('traceId') });
});

apiV1Routes.get('/editorial/editions/latest', apiAuth('bookmarks:read'), async (c) => {
  const result = await getEditorialEdition(c.env.DB, c.env.ARTICLE_CONTENT, c.get('userId')!);
  if (!result) {
    return c.json(
      {
        error: 'Edition not found',
        code: 'NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }
  return c.json({
    edition: result.edition,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/editorial/editions/:id', apiAuth('bookmarks:read'), async (c) => {
  const result = await getEditorialEdition(
    c.env.DB,
    c.env.ARTICLE_CONTENT,
    c.get('userId')!,
    c.req.param('id')
  );
  if (!result) {
    return c.json(
      {
        error: 'Edition not found',
        code: 'NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }
  return c.json({
    edition: result.edition,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get(
  '/editorial/editions/:id/artifacts/:artifact',
  apiAuth('bookmarks:read'),
  async (c) => {
    const artifact = c.req.param('artifact');
    if (!['markdown', 'snapshot', 'validation', 'candidates'].includes(artifact)) {
      return c.json(
        {
          error: 'Unknown artifact',
          code: 'NOT_FOUND',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }
    const object = await getEditorialArtifact(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      c.req.param('id'),
      artifact as 'markdown' | 'snapshot' | 'validation' | 'candidates'
    );
    if (!object) {
      return c.json(
        {
          error: 'Artifact not found',
          code: 'NOT_FOUND',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }
    return new Response(object.body, {
      headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
    });
  }
);

apiV1Routes.post('/editorial/editions', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = PublishEditorialEditionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial edition',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await storeEditorialEdition(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      parsed.data
    );
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    if (error instanceof EditorialConflictError || error instanceof EditorialRunConflictError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITION_CONFLICT',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        409
      );
    }
    if (error instanceof EditorialValidationError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITORIAL_VALIDATION_FAILED',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }
    throw error;
  }
});

export default apiV1Routes;
