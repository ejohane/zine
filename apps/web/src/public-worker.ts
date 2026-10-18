export interface PublicWorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API?: { fetch(request: Request): Promise<Response> };
  UPSTREAM_API_URL?: string;
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
export async function publicWorkerFetch(request: Request, env: PublicWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const noStore = { 'Cache-Control': 'no-store' };
  if (
    ['/.well-known/apple-app-site-association', '/apple-app-site-association'].includes(
      url.pathname
    )
  ) {
    return Response.json(
      {
        applinks: {
          details: [{ appIDs: ['TRA7965NM5.app.zine.native'], components: [{ '/': '/item/*' }] }],
        },
      },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  }
  if (/^\/(p|i)(\/|$)/.test(url.pathname)) {
    return new Response(null, { status: 404, headers: noStore });
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
        ...{ duplex: 'half' },
      })
    );
    const output = new Headers(response.headers);
    output.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers: output });
  }
  return env.ASSETS.fetch(request);
}
export default { fetch: publicWorkerFetch };
