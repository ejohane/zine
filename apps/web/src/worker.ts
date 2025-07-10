const testBookmarks = [
  { id: '1', title: 'GitHub - React' },
  { id: '2', title: 'TanStack Query Documentation' },
  { id: '3', title: 'Vite Documentation' },
  { id: '4', title: 'Cloudflare Workers' },
  { id: '5', title: 'TypeScript Handbook' },
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // API routes
    if (url.pathname === '/api/v1/bookmarks') {
      if (request.method === 'GET') {
        return new Response(JSON.stringify(testBookmarks), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new Response('Method not allowed', { status: 405 });
    }
    
    // Try to serve static assets first
    const asset = await env.ASSETS.fetch(request);
    
    // If asset found, return it
    if (asset.status !== 404) {
      return asset;
    }
    
    // For SPA routing, serve index.html for any non-asset requests
    if (!url.pathname.includes('.')) {
      const indexRequest = new Request(`${url.origin}/index.html`);
      const indexAsset = await env.ASSETS.fetch(indexRequest);
      
      if (indexAsset.status !== 404) {
        return new Response(indexAsset.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache',
          },
        });
      }
    }
    
    return new Response('Not found', { status: 404 });
  },
};

interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}