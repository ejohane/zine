/**
 * Replicache sync routes
 *
 * Handles push/pull endpoints for Replicache sync protocol.
 * Validates payloads using Zod schemas, extracts userId from auth,
 * and forwards requests to the user's Durable Object.
 */

import { Hono } from 'hono';
import { PushRequestSchema, PullRequestSchema } from '@zine/shared';
import type { Env } from '../types';

// Timeout for DO requests (30 seconds)
const DO_TIMEOUT_MS = 30_000;

/**
 * Zod issue structure for error formatting
 */
interface ZodIssue {
  path: (string | number)[];
  message: string;
  code: string;
}

/**
 * Format Zod validation errors into a structured response
 */
function formatZodError(issues: ZodIssue[]) {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Create a structured error response
 */
function createErrorResponse(error: string, code: string, requestId: string, details?: unknown) {
  return {
    error,
    code,
    requestId,
    ...(details ? { details } : {}),
  };
}

const sync = new Hono<Env>();

/**
 * POST /api/replicache/push
 *
 * Receives mutations from the client and applies them to the user's
 * Durable Object storage.
 *
 * @see https://doc.replicache.dev/guide/push
 */
sync.post('/push', async (c) => {
  const userId = c.get('userId');
  const requestId = c.get('requestId');

  // Auth is handled by middleware, but double-check userId exists
  if (!userId) {
    console.error(`[${requestId}] Push: userId not set after auth middleware`);
    return c.json(createErrorResponse('Authentication required', 'UNAUTHORIZED', requestId), 401);
  }

  console.log(`[${requestId}] Push: Starting for user ${userId}`);

  // Parse and validate request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch (error) {
    console.error(`[${requestId}] Push: Failed to parse JSON body`, error);
    return c.json(createErrorResponse('Invalid JSON body', 'INVALID_JSON', requestId), 400);
  }

  const parseResult = PushRequestSchema.safeParse(body);
  if (!parseResult.success) {
    console.error(`[${requestId}] Push: Validation failed`, parseResult.error.issues);
    return c.json(
      createErrorResponse(
        'Invalid push request',
        'VALIDATION_ERROR',
        requestId,
        formatZodError(parseResult.error.issues)
      ),
      400
    );
  }

  const pushRequest = parseResult.data;
  console.log(
    `[${requestId}] Push: Validated request with ${pushRequest.mutations.length} mutations`
  );

  // Get user's Durable Object
  const doId = c.env.USER_DO.idFromName(userId);
  const stub = c.env.USER_DO.get(doId);

  // Forward request to DO with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DO_TIMEOUT_MS);

    const doResponse = await stub.fetch('http://do/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify(pushRequest),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Forward DO response
    const responseBody = await doResponse.json();
    console.log(`[${requestId}] Push: DO responded with status ${doResponse.status}`);

    return c.json(responseBody, doResponse.status as 200 | 400 | 500);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[${requestId}] Push: DO request timed out after ${DO_TIMEOUT_MS}ms`);
      return c.json(createErrorResponse('Request timed out', 'TIMEOUT', requestId), 504);
    }

    console.error(`[${requestId}] Push: DO request failed`, error);
    return c.json(
      createErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        requestId,
        c.env.ENVIRONMENT === 'development' && error instanceof Error ? error.message : undefined
      ),
      500
    );
  }
});

/**
 * POST /api/replicache/pull
 *
 * Returns changes since the client's last sync cookie.
 *
 * @see https://doc.replicache.dev/guide/pull
 */
sync.post('/pull', async (c) => {
  const userId = c.get('userId');
  const requestId = c.get('requestId');

  // Auth is handled by middleware, but double-check userId exists
  if (!userId) {
    console.error(`[${requestId}] Pull: userId not set after auth middleware`);
    return c.json(createErrorResponse('Authentication required', 'UNAUTHORIZED', requestId), 401);
  }

  console.log(`[${requestId}] Pull: Starting for user ${userId}`);

  // Parse and validate request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch (error) {
    console.error(`[${requestId}] Pull: Failed to parse JSON body`, error);
    return c.json(createErrorResponse('Invalid JSON body', 'INVALID_JSON', requestId), 400);
  }

  const parseResult = PullRequestSchema.safeParse(body);
  if (!parseResult.success) {
    console.error(`[${requestId}] Pull: Validation failed`, parseResult.error.issues);
    return c.json(
      createErrorResponse(
        'Invalid pull request',
        'VALIDATION_ERROR',
        requestId,
        formatZodError(parseResult.error.issues)
      ),
      400
    );
  }

  const pullRequest = parseResult.data;
  console.log(
    `[${requestId}] Pull: Validated request, cookie version: ${pullRequest.cookie?.version ?? 'null'}`
  );

  // Get user's Durable Object
  const doId = c.env.USER_DO.idFromName(userId);
  const stub = c.env.USER_DO.get(doId);

  // Forward request to DO with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DO_TIMEOUT_MS);

    const doResponse = await stub.fetch('http://do/pull', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify(pullRequest),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Forward DO response
    const responseBody = await doResponse.json();
    console.log(`[${requestId}] Pull: DO responded with status ${doResponse.status}`);

    return c.json(responseBody, doResponse.status as 200 | 400 | 500);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[${requestId}] Pull: DO request timed out after ${DO_TIMEOUT_MS}ms`);
      return c.json(createErrorResponse('Request timed out', 'TIMEOUT', requestId), 504);
    }

    console.error(`[${requestId}] Pull: DO request failed`, error);
    return c.json(
      createErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        requestId,
        c.env.ENVIRONMENT === 'development' && error instanceof Error ? error.message : undefined
      ),
      500
    );
  }
});

export default sync;
