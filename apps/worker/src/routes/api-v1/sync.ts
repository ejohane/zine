import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../../db';
import {
  getActiveSyncJob,
  getJobStatus,
  getSyncStatus,
  initiateSyncJob,
  RateLimitError,
} from '../../sync/service';
import type { Env } from '../../types';
import { apiAuth } from './auth';
import { getRetryAfterSeconds } from './request';

const apiV1Routes = new Hono<Env>();

const SyncJobBodySchema = z.object({}).strict().optional();

apiV1Routes.post('/sync-jobs', apiAuth('sync:write'), async (c) => {
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

apiV1Routes.get('/sync-jobs/active', apiAuth('sync:read'), async (c) => {
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

apiV1Routes.get('/sync-jobs/:jobId', apiAuth('sync:read'), async (c) => {
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

export default apiV1Routes;
