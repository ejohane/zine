import {
  AbandonEditorialExperimentSchema,
  CreateEditorialExperimentSchema,
  FailEditorialExperimentSchema,
  PromoteEditorialExperimentSchema,
  PublishEditorialExperimentVariantSchema,
  ReviewEditorialExperimentSchema,
  UpdateEditorialExperimentSchema,
} from '@zine/editorial-schema';
import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  abandonEditorialExperiment,
  createEditorialExperiment,
  EditorialExperimentConflictError,
  EditorialExperimentNotFoundError,
  EditorialExperimentTransitionError,
  EditorialExperimentValidationError,
  failEditorialExperiment,
  getEditorialExperiment,
  getEditorialExperimentVariantPreview,
  listEditorialExperiments,
  lockEditorialExperiment,
  promoteEditorialExperiment,
  publishEditorialExperimentVariant,
  reviewEditorialExperiment,
  updateEditorialExperiment,
} from '../../lib/editorial-experiments';
import type { Env } from '../../types';
import { apiAuth } from './auth';
import { parseLimit } from './request';

const apiV1Routes = new Hono<Env>();

function editorialExperimentErrorResponse(c: Context<Env>, error: unknown): Response {
  const common = { requestId: c.get('requestId'), traceId: c.get('traceId') };
  if (error instanceof EditorialExperimentNotFoundError) {
    return c.json({ error: error.message, code: 'NOT_FOUND', ...common }, 404);
  }
  if (error instanceof EditorialExperimentConflictError) {
    return c.json({ error: error.message, code: 'EDITORIAL_EXPERIMENT_CONFLICT', ...common }, 409);
  }
  if (
    error instanceof EditorialExperimentTransitionError ||
    error instanceof EditorialExperimentValidationError
  ) {
    return c.json(
      {
        error: error.message,
        code:
          error instanceof EditorialExperimentTransitionError
            ? 'EDITORIAL_EXPERIMENT_TRANSITION'
            : 'EDITORIAL_EXPERIMENT_VALIDATION',
        ...common,
      },
      400
    );
  }
  throw error;
}

apiV1Routes.get('/editorial/experiments', apiAuth('bookmarks:read'), async (c) => {
  const experiments = await listEditorialExperiments(
    c.env.DB,
    c.get('userId')!,
    parseLimit(c.req.query('limit'))
  );
  return c.json({ experiments, requestId: c.get('requestId'), traceId: c.get('traceId') });
});

apiV1Routes.post('/editorial/experiments', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await createEditorialExperiment(c.env.DB, c.get('userId')!, parsed.data);
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.get('/editorial/experiments/:id', apiAuth('bookmarks:read'), async (c) => {
  try {
    const experiment = await getEditorialExperiment(c.env.DB, c.get('userId')!, c.req.param('id'));
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.patch('/editorial/experiments/:id', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment update',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const experiment = await updateEditorialExperiment(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/lock', apiAuth('bookmarks:write'), async (c) => {
  try {
    const experiment = await lockEditorialExperiment(c.env.DB, c.get('userId')!, c.req.param('id'));
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/failure', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = FailEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment failure',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const experiment = await failEditorialExperiment(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/abandon', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = AbandonEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment abandonment',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const experiment = await abandonEditorialExperiment(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/variants', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = PublishEditorialExperimentVariantSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment variant',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await publishEditorialExperimentVariant(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.get(
  '/editorial/experiments/:id/variants/:variantId',
  apiAuth('bookmarks:read'),
  async (c) => {
    try {
      const result = await getEditorialExperimentVariantPreview(
        c.env.DB,
        c.env.ARTICLE_CONTENT,
        c.get('userId')!,
        c.req.param('id'),
        c.req.param('variantId')
      );
      const requestId = c.get('requestId');
      const traceId = c.get('traceId');
      return c.json({
        ...result,
        preview: { ...result.preview, requestId, traceId },
        requestId,
        traceId,
      });
    } catch (error) {
      return editorialExperimentErrorResponse(c, error);
    }
  }
);

apiV1Routes.post('/editorial/experiments/:id/decision', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ReviewEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment review',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await reviewEditorialExperiment(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.duplicate ? 200 : 201
    );
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/promote', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = PromoteEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment promotion',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await promoteEditorialExperiment(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data.variantId
    );
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

export default apiV1Routes;
