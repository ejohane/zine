import { Hono } from 'hono';
import { createContext } from '../../trpc/context';
import { appRouter } from '../../trpc/router';
import type { Env } from '../../types';
import { apiAuth } from './auth';
import { trpcErrorResponse } from './errors';
import { parseBoolean, parseLimit } from './request';

const apiV1Routes = new Hono<Env>();

apiV1Routes.get('/creators/:creatorId', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const creator = await caller.creators.get({ creatorId: c.req.param('creatorId') });
    return c.json({
      creator,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/creators/:creatorId/bookmarks', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');

  try {
    const result = await caller.creators.listBookmarks({
      creatorId: c.req.param('creatorId'),
      limit: parseLimit(c.req.query('limit')),
      cursor: cursor && cursor.length > 0 ? cursor : undefined,
      isFinished: parseBoolean(c.req.query('isFinished')),
    });
    return c.json({
      items: result.items,
      nextCursor: result.nextCursor,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/creators/:creatorId/latest-content', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.creators.fetchLatestContent({
      creatorId: c.req.param('creatorId'),
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

export default apiV1Routes;
