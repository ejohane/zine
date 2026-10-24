import {
  HomeCompositionSchema,
  HOME_NATIVE_COMPONENTS,
} from '../../../../../packages/shared/src/home-composition';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  getHomeCandidates,
  getHomeComposition,
  prepareHomeComposition,
  publishHomeComposition,
} from '../../lib/home-composition';
import type { Env } from '../../types';
import { apiAuth } from './auth';

const routes = new Hono<Env>();
const bodySchema = z.object({ composition: HomeCompositionSchema }).strict();

routes.get('/home/components', apiAuth('bookmarks:read'), (c) => c.json(HOME_NATIVE_COMPONENTS));
routes.get('/home/candidates', apiAuth('bookmarks:read'), async (c) =>
  c.json(await getHomeCandidates(c.env, c.get('userId')!))
);
routes.get('/home/composition', apiAuth('bookmarks:read'), async (c) =>
  c.json(await getHomeComposition(c.env, c.get('userId')!))
);

for (const operation of ['preview', 'publish'] as const) {
  routes.on(
    operation === 'preview' ? 'POST' : 'PUT',
    operation === 'preview' ? '/home/composition/preview' : '/home/composition',
    apiAuth(operation === 'preview' ? 'bookmarks:read' : 'bookmarks:write'),
    async (c) => {
      const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json(
          {
            error: 'Invalid Home Lab arrangement',
            code: 'INVALID_REQUEST_BODY',
            issues: parsed.error.issues,
            requestId: c.get('requestId'),
            traceId: c.get('traceId'),
          },
          400
        );
      }
      const result = await (
        operation === 'preview' ? prepareHomeComposition : publishHomeComposition
      )(c.env, c.get('userId')!, parsed.data.composition);
      return c.json(result, 'valid' in result && !result.valid ? 422 : 200);
    }
  );
}

export default routes;
