import { loadReader, publicRoute } from './public-publications/model';
import { renderPublicDocument } from './public-publications/server';
export interface PublicWorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API?: { fetch(request: Request): Promise<Response> };
  UPSTREAM_API_URL?: string;
  APPLE_APPLICATION_IDENTIFIER?: string;
  PREVIEW_READ_ONLY?: string;
}
const proxyHeaders = [
  'accept',
  'authorization',
  'content-type',
  'idempotency-key',
  'x-zine-client-request-id',
  'x-zine-interaction-id',
  'x-zine-trace-id',
];
import { isPublicPath } from './public-publications/paths';
export { isPublicPath } from './public-publications/paths';
export async function publicWorkerFetch(request: Request, env: PublicWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const noStore = { 'Cache-Control': 'no-store' };
  if (url.pathname === '/.well-known/apple-app-site-association') {
    const application = env.APPLE_APPLICATION_IDENTIFIER;
    if (!application || !/^[A-Z0-9]+\.app\.zine\.native$/.test(application))
      return Response.json(
        { error: 'Association is not configured.' },
        { status: 503, headers: noStore }
      );
    return Response.json(
      {
        applinks: {
          details: [{ appIDs: [application], components: [{ '/': '/p/*' }, { '/': '/i/*' }] }],
        },
      },
      { headers: noStore }
    );
  }
  const upstream = env.UPSTREAM_API_URL;
  if (url.pathname.startsWith('/api/v1/') || url.pathname.startsWith('/trpc/')) {
    if (!env.API || !upstream)
      return Response.json({ error: 'API is not configured.' }, { status: 503, headers: noStore });
    if (env.PREVIEW_READ_ONLY === 'true' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      return Response.json(
        { error: 'This preview is read-only. Configure an isolated backend to enable writes.' },
        { status: 403, headers: noStore }
      );
    const headers = new Headers();
    for (const name of proxyHeaders) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await env.API.fetch(
      new Request(new URL(url.pathname + url.search, upstream), {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      })
    );
    const output = new Headers(response.headers);
    output.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers: output });
  }
  if (!isPublicPath(url.pathname)) return env.ASSETS.fetch(request);
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { ...noStore, Allow: 'GET, HEAD' } });
  const route = publicRoute(url.pathname);
  const result =
    route && env.API && upstream
      ? await loadReader(url.pathname + url.search, (path) =>
          env.API!.fetch(
            new Request(new URL(path, upstream), {
              headers: { Accept: 'application/json' },
              redirect: 'manual',
            })
          )
        )
      : {
          data: { type: 'unavailable' as const, temporary: Boolean(route) },
          status: route ? 503 : 404,
        };
  const shellResponse = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
  if (!shellResponse.ok)
    return new Response('Please try again shortly.', { status: 503, headers: noStore });
  const document = renderPublicDocument(await shellResponse.text(), result.data, url);
  return new Response(request.method === 'HEAD' ? null : document, {
    status: result.status,
    headers: {
      ...noStore,
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
export default { fetch: publicWorkerFetch };
