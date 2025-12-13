/**
 * @zine/worker - Cloudflare Workers backend
 *
 * This is a placeholder entry point. The actual Hono app
 * will be configured in a later epic.
 */

import { ZINE_VERSION } from '@zine/shared';

export default {
  async fetch(_request: Request, _env: unknown, _ctx: ExecutionContext): Promise<Response> {
    return new Response(JSON.stringify({ version: ZINE_VERSION, status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
