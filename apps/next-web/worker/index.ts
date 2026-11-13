interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/next') return Response.redirect(url.origin + '/next/', 308);
    if (!url.pathname.startsWith('/next/')) return new Response('Not found', { status: 404 });
    const path = url.pathname.slice('/next'.length);
    url.pathname = path === '/' ? '/index.html' : path;
    const result = await env.ASSETS.fetch(new Request(url, request));
    const response = new Response(result.body, result);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set(
      'Cache-Control',
      path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
    );
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://clerk.myzine.app https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https://clerk.myzine.app https://*.clerk.com; frame-src https://challenges.cloudflare.com https://clerk.myzine.app https://accounts.myzine.app; object-src 'none'; base-uri 'self'; form-action 'self' https://clerk.myzine.app"
    );
    if (path === '/sw.js') response.headers.set('Service-Worker-Allowed', '/next/');
    return response;
  },
};
