import { Hono } from 'hono';
import type { Env } from '../types';
import openApiSpec from './api-v1.openapi.json';
import subscriptions from './api-v1/subscriptions';
import sync from './api-v1/sync';
import library from './api-v1/library';
import creators from './api-v1/creators';
import today from './api-v1/today';
import editorialExperiments from './api-v1/editorial-experiments';
import editorial from './api-v1/editorial';

const apiV1Routes = new Hono<Env>();
apiV1Routes.get('/openapi.json', (c) => c.json(openApiSpec));
apiV1Routes.route('/', subscriptions);
apiV1Routes.route('/', sync);
apiV1Routes.route('/', library);
apiV1Routes.route('/', creators);
apiV1Routes.route('/', today);
apiV1Routes.route('/', editorialExperiments);
apiV1Routes.route('/', editorial);

export default apiV1Routes;
