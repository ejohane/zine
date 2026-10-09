import { Hono } from 'hono';
import { ZodError } from 'zod';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../../types';
import { IdempotencyKeySchema } from '@zine/shared';
import {
  CreateWeeklyRecapIssueSchema,
  WeeklyRecapPreferencesInputSchema,
  WeeklyRecapPageInputSchema,
} from '../../../../../packages/shared/src/schemas/weekly-recaps';
import { apiAuth } from './auth';
import { PublicationError } from '../../publications/errors';
import { WeeklyRecapService } from '../../weekly-recaps/service';
import { createWeeklyIssue } from '../../weekly-recaps/draft';
const routes = new Hono<Env>();
const auth: MiddlewareHandler<Env> = async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (c.req.header('Authorization')?.slice(7).trim().startsWith('zine_pat_'))
    return c.json(
      {
        error: 'Forbidden',
        code: 'FORBIDDEN',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      403
    );
  return apiAuth('bookmarks:read')(c, next);
};
for (const path of ['/me/weekly-recaps', '/me/weekly-recaps/*', '/me/weekly-recap-preferences'])
  routes.use(path, auth);
routes.onError((error, c) => {
  if (error instanceof ZodError)
    return c.json(
      {
        error: 'Invalid input',
        code: 'INVALID_INPUT',
        details: { issues: error.issues.map((i) => ({ path: i.path, code: i.code })) },
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  if (error instanceof PublicationError)
    return c.json(
      {
        error: error.code,
        code: error.code,
        details: error.details,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      error.status
    );
  throw error;
});
const envelope = (c: Parameters<MiddlewareHandler<Env>>[0]) => ({
  requestId: c.get('requestId'),
  traceId: c.get('traceId'),
});
async function json(c: Parameters<MiddlewareHandler<Env>>[0]) {
  if (Number(c.req.header('Content-Length')) > 32 * 1024)
    throw new PublicationError('PAYLOAD_TOO_LARGE', 413);
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new PublicationError('INVALID_INPUT', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 32 * 1024) throw new PublicationError('PAYLOAD_TOO_LARGE', 413);
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new PublicationError('INVALID_INPUT', 400);
  }
}
routes.get('/me/weekly-recap-preferences', async (c) =>
  c.json({
    preferences: await new WeeklyRecapService(c.env.DB).getPreferences(c.get('userId')!),
    ...envelope(c),
  })
);
routes.put('/me/weekly-recap-preferences', async (c) => {
  const input = WeeklyRecapPreferencesInputSchema.parse(await json(c));
  return c.json({
    preferences: await new WeeklyRecapService(c.env.DB).setPreferences(
      c.get('userId')!,
      input.timezone
    ),
    ...envelope(c),
  });
});
routes.get('/me/weekly-recaps', async (c) => {
  const input = WeeklyRecapPageInputSchema.parse(c.req.query());
  return c.json({
    ...(await new WeeklyRecapService(c.env.DB).list(c.get('userId')!, input.limit, input.cursor)),
    ...envelope(c),
  });
});
routes.get('/me/weekly-recaps/:weekStart', async (c) =>
  c.json({
    recap: await new WeeklyRecapService(c.env.DB).get(c.get('userId')!, c.req.param('weekStart')),
    ...envelope(c),
  })
);
routes.post('/me/weekly-recaps/:weekStart/issue', async (c) => {
  const input = CreateWeeklyRecapIssueSchema.parse(await json(c)),
    key = IdempotencyKeySchema.parse(c.req.header('Idempotency-Key'));
  return c.json({
    ...((await createWeeklyIssue(
      c.env.DB,
      c.get('userId')!,
      c.req.param('weekStart'),
      input,
      key
    )) as object),
    ...envelope(c),
  });
});
export default routes;
