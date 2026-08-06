interface PreviewWorkerEnv {
  API: {
    fetch(request: Request): Promise<Response>;
  };
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  PREVIEW_GIT_SHA?: string;
  PREVIEW_ID?: string;
  UPSTREAM_API_URL?: string;
}

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'x-zine-client-request-id',
  'x-zine-trace-id',
] as const;

export function isPreviewApiPath(pathname: string): boolean {
  return (
    pathname === '/trpc' ||
    pathname.startsWith('/trpc/') ||
    pathname === '/api/v1' ||
    pathname.startsWith('/api/v1/')
  );
}

function buildUpstreamRequest(request: Request, upstreamApiUrl: string): Request {
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstreamApiUrl);
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });
}

function withPreviewHeaders(response: Response, previewId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('X-Zine-Preview', previewId);

  if (headers.get('content-type')?.includes('text/html')) {
    headers.set('Cache-Control', 'private, no-store');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: PreviewWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const previewId = env.PREVIEW_ID || 'unknown-preview';

    if (url.pathname === '/_preview/health') {
      return Response.json(
        {
          status: 'ok',
          service: 'zine-web-preview',
          previewId,
          gitSha: env.PREVIEW_GIT_SHA || 'unknown',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow, noarchive',
            'X-Zine-Preview': previewId,
          },
        }
      );
    }

    if (isPreviewApiPath(url.pathname)) {
      const upstreamApiUrl = env.UPSTREAM_API_URL?.trim();
      if (!upstreamApiUrl) {
        return Response.json(
          { error: 'Preview API upstream is not configured.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const upstreamResponse = await env.API.fetch(buildUpstreamRequest(request, upstreamApiUrl));
      return withPreviewHeaders(upstreamResponse, previewId);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withPreviewHeaders(assetResponse, previewId);
  },
};
