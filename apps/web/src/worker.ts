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
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/v1/bookmarks' && request.method === 'GET') {
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
    
    // For SPA routing, serve index.html for client-side routes
    // This handles all routes that don't have file extensions (like /sign-up, /bookmarks, etc.)
    const isClientSideRoute = !url.pathname.includes('.');
    
    if (isClientSideRoute) {
      try {
        const indexRequest = new Request(`${url.origin}/index.html`, {
          method: 'GET',
        });
        const indexAsset = await env.ASSETS.fetch(indexRequest);
        
        if (indexAsset.ok) {
          // Clone the response to avoid stream consumption issues
          const indexContent = await indexAsset.text();
          return new Response(indexContent, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            },
          });
        }
      } catch (error) {
        console.error('Error serving index.html:', error);
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